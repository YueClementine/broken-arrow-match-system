# Broken Arrow 5v5 预约对战站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个部署在 GitHub Pages、使用 Supabase Free 的中文手机优先 Broken Arrow 5v5 预约对战站，支持匿名身份、固定座位原子抢占、房主管理和 OOPZ 001～020 语音频道自动排期。

**Architecture:** 前端使用 React + TypeScript + Vite，采用 HashRouter 适配 GitHub Pages。所有关键写操作由 Supabase PostgreSQL `SECURITY DEFINER` RPC 执行，浏览器只持有 Supabase Publishable Key；普通用户首次访问时自动 `signInAnonymously()`。每个约战房固定创建 10 个座位行，抢座/退出/踢人都通过原子 UPDATE；创建或改期房间时在数据库事务内自动锁定一对 OOPZ 频道。

**Tech Stack:** React, TypeScript, Vite, react-router-dom, Supabase JS, PostgreSQL, Supabase Auth/Realtime/RLS/RPC, Vitest, React Testing Library, pgTAP, GitHub Actions, GitHub Pages.

## Global Constraints

- 静态前端部署到 GitHub Pages，不部署传统应用服务器。
- Supabase Free 作为数据库、匿名 Auth、RPC 和 Realtime。
- 不展示注册/登录页面；首次访问自动匿名登录。
- 中文界面，手机优先。
- 所有时间统一显示为北京时间 UTC+8；数据库使用 `timestamptz`。
- 每场比赛固定 45 分钟。
- 公共大厅默认展示未来 7 天、未取消且尚未开始的房间，并按开始时间升序。
- 创建房间字段：开始时间、标题、房主昵称、房主 QQ、备注。
- 玩家报名字段：游戏昵称、QQ；昵称和 QQ 在房间详情页完全公开。
- A/B 两队各 5 个固定座位。
- 一个匿名用户在同一房间只能占一个位置。
- 两人并发抢同一座位时只能有一个成功。
- 满 10 人显示“已满”，不另存 `is_full`。
- 房主通过独立管理链接修改、取消房间或移除玩家。
- 管理 Token 不明文存库，不放入公开数据库表。
- 过期房间默认不在大厅显示；旧分享链接仍可打开，但只读。
- 首版不做用户注册、QQ 自动通知、信誉系统、聊天、自动匹配、战绩/Elo、BATrace 集成。
- OOPZ 预建 001～020 共 20 个频道，固定两两成组：001/002、003/004……019/020。
- 每场创建时立即预留一个 OOPZ Pair；A 队使用奇数频道，B 队使用对应偶数频道。
- 首版语音资源占用窗口默认：开始前 10 分钟至比赛结束后 15 分钟，即 `start_at - 10m` ～ `start_at + 60m`。该值以数据库常量实现，后续可统一调整。
- 任一时间段最多同时容纳 10 场使用 OOPZ 的对战；无可用 Pair 时创建/改期失败。
- 浏览器端绝不能出现 `service_role` key。
- 前端路由使用 HashRouter；管理链接格式采用 `/#/room/<ROOM_CODE>?admin=<TOKEN>`，使 Token 保留在 URL fragment 内。

---

## 1. Target File Structure

```text
broken-arrow-5v5/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── pages.yml
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── router.tsx
│   ├── components/
│   │   ├── AppHeader.tsx
│   │   ├── EmptyState.tsx
│   │   ├── LoadingState.tsx
│   │   ├── RoomCard.tsx
│   │   ├── SeatCard.tsx
│   │   ├── TeamBoard.tsx
│   │   ├── JoinSeatDialog.tsx
│   │   ├── VoiceAssignment.tsx
│   │   └── AdminPanel.tsx
│   ├── features/
│   │   ├── auth/
│   │   │   └── ensureAnonymousSession.ts
│   │   ├── lobby/
│   │   │   ├── lobbyApi.ts
│   │   │   └── LobbyPage.tsx
│   │   ├── create-room/
│   │   │   ├── createRoomApi.ts
│   │   │   └── CreateRoomPage.tsx
│   │   └── room/
│   │       ├── roomApi.ts
│   │       ├── roomRealtime.ts
│   │       ├── roomTypes.ts
│   │       └── RoomPage.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── beijingTime.ts
│   │   ├── validation.ts
│   │   └── errors.ts
│   ├── styles/
│   │   └── global.css
│   ├── test/
│   │   └── setup.ts
│   ├── main.tsx
│   └── vite-env.d.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260811000100_core_schema.sql
│   │   ├── 20260811000200_room_rpc.sql
│   │   └── 20260811000300_realtime.sql
│   ├── tests/
│   │   ├── 001_schema.test.sql
│   │   ├── 002_create_room.test.sql
│   │   ├── 003_seat_rpc.test.sql
│   │   └── 004_admin_rpc.test.sql
│   └── seed.sql
├── tests/
│   └── smoke/
│       └── critical-flows.test.tsx
├── .env.example
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Boundary decisions

- `lib/` 只放无业务状态的基础能力。
- 每个业务功能在 `features/` 内维护 API + Page，避免一个巨大 `services.ts`。
- PostgreSQL 是并发和权限的最终裁判，前端不承担“先查再写”的一致性逻辑。
- OOPZ 只管理频道编号，不保存链接。
- BATrace 保持独立，MVP 不创建任何 BATrace 代码。

---

# Task 1: Scaffold Frontend, Test Harness, and Beijing Time Utilities

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/router.tsx`
- Create: `src/lib/beijingTime.ts`
- Create: `src/lib/validation.ts`
- Create: `src/test/setup.ts`
- Create: `src/styles/global.css`
- Test: `src/lib/beijingTime.test.ts`
- Test: `src/lib/validation.test.ts`

**Interfaces:**
- Produces: `formatBeijingDateTime(iso: string): string`
- Produces: `formatBeijingTimeRange(startIso: string): string`
- Produces: `validateQQ(value: string): string | null`
- Produces: `validateNickname(value: string): string | null`
- Produces: `validateTitle(value: string): string | null`
- Produces: Hash routes `/`, `/create`, `/room/:roomCode`.

- [ ] **Step 1: Initialize React/Vite/TypeScript and testing dependencies**

```bash
npm create vite@latest . -- --template react-ts
npm install @supabase/supabase-js react-router-dom
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event supabase
```

Set scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "supabase:start": "supabase start",
    "supabase:reset": "supabase db reset",
    "test:db": "supabase test db"
  }
}
```

- [ ] **Step 2: Write failing Beijing-time tests**

```ts
import { describe, expect, it } from 'vitest';
import { formatBeijingTimeRange } from './beijingTime';

describe('formatBeijingTimeRange', () => {
  it('always renders UTC+8 and adds 45 minutes', () => {
    expect(formatBeijingTimeRange('2026-08-12T13:00:00Z'))
      .toBe('8月12日 21:00 - 21:45');
  });
});
```

Run:

```bash
npm test -- src/lib/beijingTime.test.ts
```

Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Implement UTC+8 formatting without relying on browser timezone**

Use `Intl.DateTimeFormat` with `timeZone: 'Asia/Shanghai'`. Do not derive local time with `new Date().getHours()`.

```ts
const BEIJING_TZ = 'Asia/Shanghai';

export function formatBeijingTimeRange(startIso: string): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 45 * 60_000);
  // Format month/day and HH:mm with timeZone: BEIJING_TZ.
  // Return exact form: 8月12日 21:00 - 21:45
  return buildBeijingRange(start, end);
}
```

- [ ] **Step 4: Write validation tests**

Assert:

```ts
expect(validateQQ('12345')).toBeNull();
expect(validateQQ('123456789012')).toBeNull();
expect(validateQQ('1234')).not.toBeNull();
expect(validateQQ('12345a')).not.toBeNull();
expect(validateNickname('')).not.toBeNull();
expect(validateNickname('A'.repeat(31))).not.toBeNull();
expect(validateTitle('A'.repeat(41))).not.toBeNull();
```

- [ ] **Step 5: Implement validations**

Rules:

```text
title: trim 后 1～40 字符
nickname: trim 后 1～30 字符
qq: 5～12 位数字
note: trim 后最多 300 字符
```

- [ ] **Step 6: Configure HashRouter**

Use:

```tsx
<HashRouter>
  <Routes>
    <Route path="/" element={<LobbyPage />} />
    <Route path="/create" element={<CreateRoomPage />} />
    <Route path="/room/:roomCode" element={<RoomPage />} />
  </Routes>
</HashRouter>
```

- [ ] **Step 7: Run frontend tests and build**

```bash
npm test
npm run build
```

Expected: all tests PASS, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: scaffold broken arrow booking frontend"
```

---

# Task 2: Create Supabase Schema, Fixed Seats, Voice Pairs, and RLS Baseline

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20260811000100_core_schema.sql`
- Create: `supabase/tests/001_schema.test.sql`
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces: `public.rooms`
- Produces: `public.room_seats`
- Produces: `public.voice_channel_pairs`
- Produces: `private.room_admin_secrets`
- Produces: 10 OOPZ pairs and 10 fixed seats per room.

- [ ] **Step 1: Initialize Supabase local development**

```bash
npx supabase init
npx supabase start
```

Anonymous sign-in must be enabled in local `supabase/config.toml`:

```toml
[auth]
enable_anonymous_sign_ins = true
```.

- [ ] **Step 2: Write failing pgTAP schema tests**

Tests must assert:

```sql
select has_table('public', 'rooms');
select has_table('public', 'room_seats');
select has_table('public', 'voice_channel_pairs');
select has_table('private', 'room_admin_secrets');
```

Also assert primary/unique/check constraints exist.

Run:

```bash
npx supabase test db
```

Expected: FAIL before migration exists.

- [ ] **Step 3: Implement the core schema**

Required shape:

```sql
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table public.voice_channel_pairs (
  id smallint primary key check (id between 1 and 10),
  team_a_channel smallint not null unique,
  team_b_channel smallint not null unique,
  enabled boolean not null default true
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  title varchar(40) not null,
  start_at timestamptz not null,
  host_nickname varchar(30) not null,
  host_qq varchar(12) not null,
  note varchar(300) not null default '',
  status text not null default 'active'
    check (status in ('active', 'cancelled')),
  voice_pair_id smallint not null
    references public.voice_channel_pairs(id),
  voice_reserved_from timestamptz
    generated always as (start_at - interval '10 minutes') stored,
  voice_reserved_until timestamptz
    generated always as (start_at + interval '60 minutes') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_seats (
  room_id uuid not null references public.rooms(id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  seat_no smallint not null check (seat_no between 1 and 5),
  player_uid uuid,
  nickname varchar(30),
  qq varchar(12),
  joined_at timestamptz,
  primary key (room_id, team, seat_no),
  check (
    (player_uid is null and nickname is null and qq is null and joined_at is null)
    or
    (player_uid is not null and nickname is not null and qq is not null and joined_at is not null)
  )
);

create unique index room_seats_one_seat_per_user
  on public.room_seats(room_id, player_uid)
  where player_uid is not null;

create table private.room_admin_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  token_hash bytea not null
);
```

Seed OOPZ pairs:

```sql
insert into public.voice_channel_pairs(id, team_a_channel, team_b_channel)
values
  (1,1,2),(2,3,4),(3,5,6),(4,7,8),(5,9,10),
  (6,11,12),(7,13,14),(8,15,16),(9,17,18),(10,19,20);
```

- [ ] **Step 4: Add indexes used by lobby/allocation**

```sql
create index rooms_start_at_idx on public.rooms(start_at);
create index rooms_active_voice_idx
  on public.rooms(voice_pair_id, voice_reserved_from, voice_reserved_until)
  where status = 'active';
create index room_seats_player_uid_idx on public.room_seats(player_uid);
```

- [ ] **Step 5: Enable RLS and grants**

Public room metadata and public QQ are readable, but tables are not directly writable:

```sql
alter table public.rooms enable row level security;
alter table public.room_seats enable row level security;
alter table public.voice_channel_pairs enable row level security;

create policy rooms_public_read
on public.rooms for select
to anon, authenticated
using (true);

create policy room_seats_public_read
on public.room_seats for select
to anon, authenticated
using (true);

create policy voice_pairs_public_read
on public.voice_channel_pairs for select
to anon, authenticated
using (true);
```

Do **not** create INSERT/UPDATE/DELETE policies for these tables.

Revoke private secrets:

```sql
revoke all on schema private from anon, authenticated;
revoke all on private.room_admin_secrets from anon, authenticated;
```

- [ ] **Step 6: Re-run database tests**

```bash
npx supabase db reset
npx supabase test db
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase
git commit -m "feat: add booking schema and oopz voice pairs"
```

---

# Task 3: Implement create_room() with Atomic OOPZ Pair Allocation

**Files:**
- Create: `supabase/migrations/20260811000200_room_rpc.sql`
- Create: `supabase/tests/002_create_room.test.sql`

**Interfaces:**
- Produces RPC:
  `create_room(p_start_at timestamptz, p_title text, p_host_nickname text, p_host_qq text, p_note text)`
- Returns: `room_code text, admin_token text, voice_pair_id smallint`
- Creates exactly 10 empty `room_seats`.
- Allocates the lowest-numbered available enabled OOPZ Pair.

- [ ] **Step 1: Write failing tests for room creation**

Tests must prove:

1. future room can be created;
2. exactly 10 seats are generated;
3. A1～A5/B1～B5 exist;
4. Pair 1 maps to OOPZ 001/002;
5. room code is unique;
6. admin token is returned but not present in `public.rooms`;
7. past time is rejected;
8. start time beyond 7 days is rejected.

- [ ] **Step 2: Implement common SQL validation helpers inside the function**

Use exact DB validation rules:

```sql
if length(btrim(p_title)) not between 1 and 40 then
  raise exception 'INVALID_TITLE';
end if;

if p_host_qq !~ '^[0-9]{5,12}$' then
  raise exception 'INVALID_QQ';
end if;

if p_start_at <= now() or p_start_at > now() + interval '7 days' then
  raise exception 'INVALID_START_TIME';
end if;
```

- [ ] **Step 3: Serialize voice allocation**

At the start of both create and reschedule operations use one transaction-scoped advisory lock:

```sql
perform pg_advisory_xact_lock(20260811, 1);
```

Select the first pair for which no active reservation window overlaps:

```sql
select vp.id
into v_voice_pair_id
from public.voice_channel_pairs vp
where vp.enabled
and not exists (
  select 1
  from public.rooms r
  where r.status = 'active'
    and r.voice_pair_id = vp.id
    and tstzrange(
          r.voice_reserved_from,
          r.voice_reserved_until,
          '[)'
        )
        &&
        tstzrange(
          p_start_at - interval '10 minutes',
          p_start_at + interval '60 minutes',
          '[)'
        )
)
order by vp.id
limit 1;
```

If none exists:

```sql
raise exception 'NO_VOICE_PAIR_AVAILABLE';
```

- [ ] **Step 4: Generate room code and one-time admin token**

Use:

```sql
v_room_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
v_admin_token := encode(extensions.gen_random_bytes(32), 'hex');
```

Store only:

```sql
extensions.digest(v_admin_token, 'sha256')
```

inside `private.room_admin_secrets`.

- [ ] **Step 5: Create the 10 fixed seats**

```sql
insert into public.room_seats(room_id, team, seat_no)
select v_room_id, team, seat_no
from (values ('A'), ('B')) as teams(team)
cross join generate_series(1, 5) as seat_no;
```

- [ ] **Step 6: Make RPC callable only after anonymous authentication**

```sql
revoke all on function public.create_room(...) from public;
grant execute on function public.create_room(...) to authenticated;
```

Function must be `SECURITY DEFINER` with an empty/fixed search path and fully qualified table names.

- [ ] **Step 7: Test Pair exhaustion and overlap**

Create 10 overlapping rooms; assert pair IDs 1～10 are assigned.

Attempt an 11th overlapping room; assert:

```text
NO_VOICE_PAIR_AVAILABLE
```

Create a non-overlapping room; assert Pair 1 becomes reusable.

- [ ] **Step 8: Run tests**

```bash
npx supabase db reset
npx supabase test db
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase
git commit -m "feat: allocate oopz voice pair when creating rooms"
```

---

# Task 4: Implement Atomic Seat Join and Self-Leave

**Files:**
- Modify: `supabase/migrations/20260811000200_room_rpc.sql`
- Create: `supabase/tests/003_seat_rpc.test.sql`

**Interfaces:**
- Produces RPC:
  `join_room_seat(p_room_code text, p_team text, p_seat_no smallint, p_nickname text, p_qq text)`
- Produces RPC:
  `leave_room_seat(p_room_code text)`
- Both use `(select auth.uid())` as the authoritative player identity.

- [ ] **Step 1: Write failing seat tests**

Test:

- valid user can claim A1;
- same user cannot also claim B1;
- another user cannot claim occupied A1;
- same room can have different users in different seats;
- cancelled/expired rooms reject join;
- invalid QQ/nickname/team/seat reject join;
- leaving clears only current caller's seat;
- leaving a room the caller did not join returns a controlled error.

- [ ] **Step 2: Implement join as one conditional UPDATE**

Core write:

```sql
update public.room_seats
set
  player_uid = (select auth.uid()),
  nickname = btrim(p_nickname),
  qq = p_qq,
  joined_at = now()
where room_id = v_room_id
  and team = p_team
  and seat_no = p_seat_no
  and player_uid is null
returning * into v_seat;
```

If no row updated:

```sql
raise exception 'SEAT_TAKEN';
```

Catch the partial unique-index violation caused by one user racing to claim two seats and map it to:

```text
ALREADY_JOINED
```

- [ ] **Step 3: Implement leave by caller identity, not seat input**

```sql
update public.room_seats
set player_uid = null,
    nickname = null,
    qq = null,
    joined_at = null
where room_id = v_room_id
  and player_uid = (select auth.uid())
returning team, seat_no into v_team, v_seat_no;
```

This ensures clients cannot ask to remove another user.

- [ ] **Step 4: Verify uniqueness constraints are the concurrency backstop**

The database must retain:

```sql
primary key (room_id, team, seat_no)
```

and:

```sql
create unique index room_seats_one_seat_per_user
on public.room_seats(room_id, player_uid)
where player_uid is not null;
```

These constraints are required even though the RPC checks state first.

- [ ] **Step 5: Run database tests**

```bash
npx supabase db reset
npx supabase test db
```

Expected: PASS.

- [ ] **Step 6: Manual race proof before merge**

Open two independent browsers/incognito sessions, target the same empty seat, submit within the same second.

Acceptance:

```text
Exactly one response succeeds.
The other receives SEAT_TAKEN.
The room still contains exactly one player on that seat.
```

- [ ] **Step 7: Commit**

```bash
git add supabase
git commit -m "feat: add atomic seat join and self leave"
```

---

# Task 5: Implement Host Admin RPCs, Including Voice Reallocation on Reschedule

**Files:**
- Modify: `supabase/migrations/20260811000200_room_rpc.sql`
- Create: `supabase/tests/004_admin_rpc.test.sql`

**Interfaces:**
- Produces RPC:
  `admin_update_room(...)`
- Produces RPC:
  `admin_remove_player(p_room_code text, p_admin_token text, p_team text, p_seat_no smallint)`
- Produces RPC:
  `admin_cancel_room(p_room_code text, p_admin_token text)`
- Returns updated room data including the final voice pair.

- [ ] **Step 1: Write failing admin tests**

Test:

- correct token can modify title/note/time;
- incorrect token returns `INVALID_ADMIN_TOKEN`;
- correct token can clear any occupied seat;
- correct token can cancel room;
- cancelled room disappears from lobby query;
- rescheduling keeps current voice pair if still available;
- rescheduling picks another pair if current pair conflicts;
- rescheduling fails atomically with `NO_VOICE_PAIR_AVAILABLE` if all 10 pairs conflict;
- failed reschedule does not change original start time or pair.

- [ ] **Step 2: Add a private token verification helper**

Use constant-time database equality over digest bytes:

```sql
select exists (
  select 1
  from private.room_admin_secrets s
  where s.room_id = p_room_id
    and s.token_hash = extensions.digest(p_admin_token, 'sha256')
);
```

Never return `token_hash`.

- [ ] **Step 3: Reuse the same advisory lock for admin time changes**

```sql
perform pg_advisory_xact_lock(20260811, 1);
```

When time changes, find an available pair while excluding the current room from overlap checks:

```sql
and r.id <> v_room_id
```

- [ ] **Step 4: Implement remove player as seat clear**

```sql
update public.room_seats
set player_uid = null,
    nickname = null,
    qq = null,
    joined_at = null
where room_id = v_room_id
  and team = p_team
  and seat_no = p_seat_no;
```

- [ ] **Step 5: Implement cancel as soft state**

```sql
update public.rooms
set status = 'cancelled',
    updated_at = now()
where id = v_room_id;
```

Do not delete room or seats.

- [ ] **Step 6: Run database tests**

```bash
npx supabase db reset
npx supabase test db
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase
git commit -m "feat: add room host administration"
```

---

# Task 6: Add Supabase Client, Automatic Anonymous Session, and API Error Mapping

**Files:**
- Create: `.env.example`
- Create: `src/lib/supabase.ts`
- Create: `src/features/auth/ensureAnonymousSession.ts`
- Create: `src/lib/errors.ts`
- Create: `src/features/lobby/lobbyApi.ts`
- Create: `src/features/create-room/createRoomApi.ts`
- Create: `src/features/room/roomApi.ts`
- Test: corresponding `*.test.ts`

**Interfaces:**
- Produces: `ensureAnonymousSession(): Promise<User>`
- Produces: `listLobbyRooms(): Promise<LobbyRoom[]>`
- Produces: `createRoom(input): Promise<{roomCode, adminToken, voicePairId}>`
- Produces: `getRoom(roomCode): Promise<RoomDetails>`
- Produces: `joinSeat(...)`, `leaveRoom(...)`, `adminUpdateRoom(...)`, `adminRemovePlayer(...)`, `adminCancelRoom(...)`.
- Produces: `toUserMessage(error): string`.

- [ ] **Step 1: Define environment variables**

`.env.example` contains names only:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Do not create any `SERVICE_ROLE` variable.

- [ ] **Step 2: Write failing auth test**

Mock Supabase auth:

- existing session => return existing user, no new sign-in;
- no session => call `signInAnonymously()` once;
- failure => surface a Chinese startup error.

- [ ] **Step 3: Implement `ensureAnonymousSession()`**

Flow:

```text
getSession()
  ├─ session exists -> return user
  └─ no session -> signInAnonymously() -> return user
```

Call this before rendering pages that mutate state.

- [ ] **Step 4: Implement API wrappers**

`createRoomApi.ts` must call:

```ts
supabase.rpc('create_room', {
  p_start_at: input.startAtIso,
  p_title: input.title.trim(),
  p_host_nickname: input.hostNickname.trim(),
  p_host_qq: input.hostQQ,
  p_note: input.note.trim(),
});
```

Never implement seat checks client-side as a substitute for RPC constraints.

- [ ] **Step 5: Map RPC errors to Chinese messages**

Required mappings:

```text
SEAT_TAKEN -> 这个位置刚刚被其他玩家抢走了，请选择其他位置。
ALREADY_JOINED -> 你已经加入了这个房间。
ROOM_EXPIRED -> 本场约战已经开始，无法继续报名。
ROOM_CANCELLED -> 本场约战已被房主取消。
INVALID_ADMIN_TOKEN -> 管理链接无效。
NO_VOICE_PAIR_AVAILABLE -> 这个时间段的 OOPZ 语音频道已经全部被预约，请换一个时间。
INVALID_QQ -> QQ 号格式不正确。
```

- [ ] **Step 6: Run unit tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src .env.example
git commit -m "feat: connect frontend to supabase rpc"
```

---

# Task 7: Build Public Lobby

**Files:**
- Create: `src/features/lobby/LobbyPage.tsx`
- Create: `src/components/RoomCard.tsx`
- Test: `src/features/lobby/LobbyPage.test.tsx`

**Interfaces:**
- Consumes: `listLobbyRooms()`
- Produces: mobile-first lobby grouped by Beijing calendar date.

- [ ] **Step 1: Write failing lobby UI tests**

Test that the page:

- sorts by `start_at ASC`;
- shows only active, future, next-7-day rooms;
- shows title, Beijing time, `x / 10`, OOPZ pair channels;
- shows “已满” at 10 players;
- links to `#/room/<code>`;
- has a visible `创建约战` action.

- [ ] **Step 2: Implement lobby query**

Prefer a single read that returns room + player count + voice pair numbers. If nested Supabase relation selection becomes awkward, create a read-only SQL function `list_lobby_rooms()` rather than doing N+1 browser queries.

Required returned fields:

```ts
type LobbyRoom = {
  roomCode: string;
  title: string;
  startAt: string;
  playerCount: number;
  voiceA: number;
  voiceB: number;
};
```

- [ ] **Step 3: Implement RoomCard**

Mobile card hierarchy:

```text
21:00
今晚欢乐5v5
7 / 10
语音：A 005 / B 006
[进入房间]
```

No QQ shown in lobby.

- [ ] **Step 4: Add empty/loading/error states**

Empty copy:

```text
未来 7 天还没有约战。
```

- [ ] **Step 5: Run tests/build**

```bash
npm test
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add public booking lobby"
```

---

# Task 8: Build Create Room Flow and Management-Link Handoff

**Files:**
- Create: `src/features/create-room/CreateRoomPage.tsx`
- Test: `src/features/create-room/CreateRoomPage.test.tsx`

**Interfaces:**
- Consumes: `createRoom()`
- Produces: normal share link and one-time admin management link.

- [ ] **Step 1: Write failing form tests**

Test required inputs and invalid cases.

The form must state:

```text
比赛时长固定 45 分钟
时间统一为北京时间 UTC+8
```

- [ ] **Step 2: Convert Beijing form input to UTC ISO correctly**

If user selects `2026-08-12 21:00`, API must send:

```text
2026-08-12T13:00:00.000Z
```

Do not use browser-local timezone assumptions.

- [ ] **Step 3: Implement successful create result**

After RPC success show:

```text
创建成功
A 队语音：OOPZ 005
B 队语音：OOPZ 006
```

Construct:

```text
普通分享链接:
https://<pages-origin>/<base>/#/room/<ROOM_CODE>

房主管理链接:
https://<pages-origin>/<base>/#/room/<ROOM_CODE>?admin=<ADMIN_TOKEN>
```

- [ ] **Step 4: Make management-link warning explicit**

Copy:

```text
请保存房主管理链接。任何拿到该链接的人都可以管理本房间。
```

Do not display admin token separately from the management link.

- [ ] **Step 5: Test no-voice-pair state**

When RPC returns `NO_VOICE_PAIR_AVAILABLE`, keep form values and show the user-facing message instead of clearing the page.

- [ ] **Step 6: Run tests/build**

```bash
npm test
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: add room creation flow"
```

---

# Task 9: Build Room Detail, Concrete Seat Selection, and Public QQ Display

**Files:**
- Create: `src/features/room/RoomPage.tsx`
- Create: `src/features/room/roomTypes.ts`
- Create: `src/components/TeamBoard.tsx`
- Create: `src/components/SeatCard.tsx`
- Create: `src/components/JoinSeatDialog.tsx`
- Create: `src/components/VoiceAssignment.tsx`
- Test: `src/features/room/RoomPage.test.tsx`

**Interfaces:**
- Consumes: room reads, `joinSeat()`, `leaveRoom()`.
- Produces: A1～A5/B1～B5 exact seat grid/list.

- [ ] **Step 1: Write failing room-page tests**

Test:

- ten seats render in fixed order;
- empty seat shows `加入`;
- occupied seat shows nickname and QQ;
- own seat shows `退出`;
- other users' seats do not show `退出`;
- full room shows `已满`;
- expired room is read-only;
- cancelled room is read-only;
- OOPZ A/B channel numbers are visible.

- [ ] **Step 2: Implement JoinSeatDialog privacy acknowledgement**

Before submit show:

```text
你的游戏昵称和 QQ 将公开显示在本房间页面，任何获得房间链接的人都可以查看。
```

User must explicitly check:

```text
我知道并同意公开显示
```

before `确认加入` is enabled.

- [ ] **Step 3: Implement submit**

Call the chosen exact seat:

```ts
await joinSeat({
  roomCode,
  team: 'A',
  seatNo: 3,
  nickname,
  qq,
});
```

On `SEAT_TAKEN`, close or refresh the seat state and show the mapped message.

- [ ] **Step 4: Implement self-leave**

The client calls only `leave_room_seat(roomCode)`; it never sends another player's UID.

- [ ] **Step 5: Implement voice block**

Example:

```text
语音频道
A 队：OOPZ 005
B 队：OOPZ 006

频道入口在 QQ 群内，本网站只负责分配频道编号。
```

No OOPZ URL is stored or rendered.

- [ ] **Step 6: Run tests/build**

```bash
npm test
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: add room seats and public player details"
```

---

# Task 10: Add Supabase Realtime to Room and Lobby

**Files:**
- Create: `supabase/migrations/20260811000300_realtime.sql`
- Create: `src/features/room/roomRealtime.ts`
- Modify: `src/features/room/RoomPage.tsx`
- Modify: `src/features/lobby/LobbyPage.tsx`
- Test: `src/features/room/roomRealtime.test.ts`

**Interfaces:**
- Produces: `subscribeToRoom(roomId, onChange): () => void`
- Room page updates without refresh when a seat or room changes.

- [ ] **Step 1: Publish tables to Realtime**

Migration:

```sql
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_seats;
```

Guard migration so repeated local reset does not fail if publication membership already exists.

- [ ] **Step 2: Write failing subscription tests**

Mock `.channel().on().subscribe()` and verify room subscriptions listen to:

```text
rooms UPDATE filtered by room id
room_seats UPDATE filtered by room_id
```

Fixed-seat design means joins/leaves/removals are UPDATE events; no DELETE subscription is needed.

- [ ] **Step 3: Implement room subscription**

On any relevant event, update local state or refetch the room once. Prefer a small debounced refetch over complex optimistic reconciliation.

- [ ] **Step 4: Add lobby refresh**

For MVP, subscribe to room changes and seat UPDATEs and debounce `listLobbyRooms()`.

Avoid one subscription per lobby card.

- [ ] **Step 5: Verify two-browser sync manually**

Browser A joins A3.

Acceptance in Browser B:

```text
A3 changes from “加入” to nickname + QQ without page reload.
```

Browser A leaves.

Acceptance in Browser B:

```text
A3 becomes empty without page reload.
```

- [ ] **Step 6: Run tests**

```bash
npm test
npx supabase test db
```

- [ ] **Step 7: Commit**

```bash
git add src supabase
git commit -m "feat: sync rooms and seats with realtime"
```

---

# Task 11: Build Host Admin Mode

**Files:**
- Create: `src/components/AdminPanel.tsx`
- Modify: `src/features/room/RoomPage.tsx`
- Test: `src/components/AdminPanel.test.tsx`

**Interfaces:**
- Admin mode activates only when URL contains `?admin=<token>`.
- Consumes: admin RPC wrappers.
- Produces: edit room, remove player, cancel room.

- [ ] **Step 1: Write failing admin-mode tests**

Test:

- normal share URL does not show admin controls;
- management URL shows `房主管理`;
- edit form pre-fills current values;
- remove control appears next to occupied seats;
- cancel action requires confirmation;
- invalid token displays `管理链接无效`;
- reschedule response updates displayed OOPZ pair if pair changed.

- [ ] **Step 2: Implement room edit form**

Editable:

```text
开始时间
标题
房主昵称
房主 QQ
备注
```

Not editable:

```text
比赛时长（固定45分钟）
OOPZ Pair（系统自动分配）
```

- [ ] **Step 3: Handle voice pair change after reschedule**

If original:

```text
A 005 / B 006
```

and RPC returns Pair 4:

```text
A 007 / B 008
```

show:

```text
时间已修改，语音频道已重新分配为 A 007 / B 008。
```

- [ ] **Step 4: Implement player removal**

Admin selects occupied seat and confirms:

```text
确定移除 PlayerName 吗？
```

Then call `admin_remove_player`.

- [ ] **Step 5: Implement cancel**

After success display:

```text
本场约战已取消
```

and disable all join/admin mutation controls except navigation/copy link.

- [ ] **Step 6: Run tests/build**

```bash
npm test
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: add host room management"
```

---

# Task 12: Mobile-First Polish and Accessibility

**Files:**
- Modify: `src/styles/global.css`
- Modify: UI components as needed
- Test: existing UI tests

**Interfaces:**
- Produces: usable layout at 320px+ width and desktop.

- [ ] **Step 1: Define design tokens**

Use CSS variables for spacing, borders, surfaces, text, danger/success states. Do not hardcode visual values repeatedly across components.

- [ ] **Step 2: Enforce mobile interaction rules**

- tap targets >= 44px;
- no hover-only behavior;
- QQ input uses `inputMode="numeric"`;
- date/time controls work on mobile;
- buttons show disabled/loading state;
- long nickname/QQ does not break layout.

- [ ] **Step 3: Add accessibility labels**

Every seat action label includes team/seat:

```text
加入 A3
退出 A3
移除 A3 的 PlayerName
```

Dialogs have heading and focus behavior.

- [ ] **Step 4: Test 320px, 375px, 430px, and desktop manually**

Acceptance:

- no horizontal scrolling;
- ten seats remain readable;
- admin panel does not overflow;
- create form usable one-handed.

- [ ] **Step 5: Run tests/build**

```bash
npm test
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "style: polish mobile booking experience"
```

---

# Task 13: CI, GitHub Pages Deployment, and Production Supabase Setup

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Modify: `vite.config.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: CI on push/PR.
- Produces: GitHub Pages deployment from `main`.

- [ ] **Step 1: Add CI workflow**

CI runs:

```bash
npm ci
npm test
npm run build
```

Database job runs local Supabase and:

```bash
supabase db reset
supabase test db
```

- [ ] **Step 2: Configure Vite base path**

For repository Pages, derive the base path from GitHub Actions instead of hardcoding a repository-name placeholder:

```ts
export default defineConfig(() => {
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  return {
    base: process.env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/',
    plugins: [react()],
  };
});
```

- [ ] **Step 3: Add GitHub Pages workflow**

Workflow requirements:

```text
permissions:
  contents: read
  pages: write
  id-token: write
```

Build `dist/`, upload with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`.

Store only:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

as GitHub repository/environment variables or secrets.

Never store:

```text
SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 4: Link production Supabase and push migrations**

Run:

```bash
npx supabase login
export SUPABASE_PROJECT_REF="$(cat .supabase-project-ref)"
test -n "$SUPABASE_PROJECT_REF"
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase db push --dry-run
npx supabase db push
```

Before production push, create a local untracked `.supabase-project-ref` file containing the exact project ref copied from the Supabase dashboard, add that filename to `.gitignore`, and verify the linked project in the CLI. This file is project metadata rather than a secret, but keeping the deployment-specific value local avoids committing an environment-specific identifier into a reusable template.

- [ ] **Step 5: Enable Anonymous Sign-Ins in production**

Verify a fresh browser can open the site, obtain an anonymous session, and create/join without any login UI.

- [ ] **Step 6: Enable/check Realtime publication**

Verify `rooms` and `room_seats` receive updates on production.

- [ ] **Step 7: Commit**

```bash
git add .github vite.config.ts README.md
git commit -m "ci: deploy booking site to github pages"
```

---

# Task 14: Final Acceptance and Security Pass

**Files:**
- Create: `docs/acceptance-checklist.md`
- Modify only if defects are found.

**Interfaces:**
- Produces: signed-off MVP release candidate.

- [ ] **Step 1: Run automated checks**

```bash
npm test
npm run build
npx supabase db reset
npx supabase test db
```

All must PASS.

- [ ] **Step 2: Search repository for forbidden secret patterns**

Run:

```bash
git grep -n "service_role\|SUPABASE_SERVICE_ROLE\|admin_token_hash"
```

Acceptance:

- no service-role secret exists in frontend/config/docs examples;
- no admin token hash is returned through public API payloads.

- [ ] **Step 3: Test primary happy path**

1. Open clean mobile browser.
2. Create room at a valid Beijing time.
3. Confirm OOPZ Pair assigned immediately.
4. Copy normal link.
5. Open normal link in a second browser.
6. Join A1 with nickname + QQ.
7. Confirm first browser updates via Realtime.
8. Fill remaining seats.
9. Confirm 10/10 and `已满`.

- [ ] **Step 4: Test concurrency**

Two different anonymous sessions submit A3 simultaneously.

Acceptance:

```text
one success
one SEAT_TAKEN
exactly one occupant persisted
```

- [ ] **Step 5: Test self-ownership**

A player cannot remove or leave another player's seat through normal UI/API.

- [ ] **Step 6: Test admin link**

Admin link can:

```text
修改标题/时间/QQ/备注
移除玩家
取消房间
```

Normal share link cannot.

- [ ] **Step 7: Test OOPZ allocation**

Create 10 overlapping rooms:

```text
Pair 1 -> 001/002
Pair 2 -> 003/004
...
Pair 10 -> 019/020
```

11th overlapping room must fail with user-friendly “频道已满” message.

Cancel one overlapping room or move it out of the time window; the released Pair must become available again.

- [ ] **Step 8: Test expiry**

After `start_at`:

- room disappears from lobby;
- direct link remains readable;
- join action disabled/rejected.

- [ ] **Step 9: Test timezone from a non-UTC+8 system timezone**

Change OS/browser timezone and confirm the same room still displays identical Beijing time.

- [ ] **Step 10: Tag MVP**

```bash
git tag v0.1.0
git push origin main --tags
```

---

# Delivery Milestones

## Milestone 1 — Database correctness
Tasks 1～5 complete.

**Can prove:** room creation, OOPZ allocation, atomic seat ownership, admin authority all work locally before UI complexity is added.

## Milestone 2 — Usable product
Tasks 6～11 complete.

**Can prove:** users can create/share/join/leave/manage a real room from mobile browsers with Realtime updates.

## Milestone 3 — Public MVP
Tasks 12～14 complete.

**Can prove:** GitHub Pages production URL works against production Supabase and passes critical security/concurrency checks.

---

# Explicitly Deferred After v0.1

Do not let these enter the MVP branch unless scope is intentionally changed:

```text
BATrace player lookup
Steam login
QQ login/bot/notification
OOPZ API or direct channel links
chat
player reputation
history/profile
Elo/ranking
auto matchmaking
auto team balancing
deck analysis
match result recording
```

The database/API boundaries should make BATrace easy to add later as an independent player-information feature without changing room scheduling or seat ownership.

---

# Implementation Order Summary

```text
1. React/Vite + UTC+8 utilities
2. Supabase schema + fixed seats + OOPZ 10 pairs
3. create_room + atomic voice allocation
4. atomic join/leave
5. admin RPC + reschedule/reallocate
6. anonymous auth + frontend API layer
7. lobby
8. create room
9. room + seat UI
10. realtime
11. admin UI
12. mobile polish
13. CI + GitHub Pages
14. acceptance/security
```

The key architectural invariants are:

```text
浏览器不持有高权限密钥
数据库决定谁抢到座位
数据库决定哪个 OOPZ Pair 可用
管理权限由不可猜测 Token 决定
匿名 UID 只决定普通玩家自己的座位
所有时间展示固定 UTC+8
```
