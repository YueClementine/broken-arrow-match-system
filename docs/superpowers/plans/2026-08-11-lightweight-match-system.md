# Broken Arrow 5v5 Lightweight Match System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a mobile-first 5v5 room site where friends can create rooms, atomically claim seats, manage rooms, and optionally attach cropped BATrace profiles.

**Architecture:** A Vite React client signs users in anonymously and calls sanitized Supabase RPCs. PostgreSQL owns room invariants and voice allocation; Realtime publishes only room revision rows. A Supabase Edge Function authenticates anonymous JWTs and calls two fixed BATrace endpoints with caching and a runtime switch.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, React Router 7, Supabase JS 2, PostgreSQL/pgTAP, Supabase Edge Functions, Vitest, Testing Library, Playwright, GitHub Actions.

## Global Constraints

- All displayed and entered match times use `Asia/Shanghai`.
- The browser contains only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- BATrace failures never block room creation or joining.
- Do not expose player UID, Steam64, raw BATrace payloads, full matches, ban history, tracking data, or the “蛆指数”.
- Admin tokens are stored only in the current tab and only their SHA-256 digests are persisted.
- The online database must never run `db reset`; local/CI containers may reset.
- Keep the lightweight controls in the approved design; do not add commercial audit, captcha, or role-management systems.

---

### Task 1: Complete the browser data boundary and anonymous session

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/api.ts`
- Create: `src/lib/types.ts`
- Create: `src/hooks/useAnonymousSession.ts`
- Test: `src/lib/api.test.ts`

**Interfaces:**
- Produces: `getSupabase(): SupabaseClient`, `ensureAnonymousSession(): Promise<string>`, room mutation functions, `searchPlayers(query)` and `loadPlayerProfile(id)`.
- Consumes: existing RPC names in `supabase/migrations/20260811000200_public_rpc.sql` and `PlayerCandidate`/`PlayerProfileSnapshot`.

- [ ] **Step 1: Write a failing API adapter test**

```ts
it('unwraps the first create_room row', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [{ room_code: 'ABC', admin_token: 'secret' }], error: null });
  expect(await createRoomWith({ rpc } as never, validInput)).toMatchObject({ roomCode: 'ABC' });
});
```

- [ ] **Step 2: Run the focused test and verify the missing adapter failure**

Run: `npm test -- --run src/lib/api.test.ts`
Expected: FAIL because `src/lib/api.ts` does not exist.

- [ ] **Step 3: Implement the lazy Supabase client, RPC mapping, Edge invocation, and anonymous-session hook**

```ts
export async function ensureAnonymousSession() {
  const client = getSupabase();
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const result = await client.auth.signInAnonymously();
  if (result.error || !result.data.user) throw result.error ?? new Error('AUTH_REQUIRED');
  return result.data.user.id;
}
```

- [ ] **Step 4: Verify adapter tests and type checking**

Run: `npm test -- --run src/lib/api.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit the browser data boundary**

```bash
git add src/lib src/hooks
git commit -m "feat: add Supabase browser data boundary"
```

### Task 2: Build the mobile room experience

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/pages/LobbyPage.tsx`
- Create: `src/pages/CreateRoomPage.tsx`
- Create: `src/pages/RoomPage.tsx`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/RoomSeat.tsx`
- Create: `src/components/RoomAdminPanel.tsx`
- Modify: `src/features/player-profile/PlayerLookup.tsx`
- Test: `src/pages/CreateRoomPage.test.tsx`
- Test: `src/pages/RoomPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 API functions and existing `PlayerLookup`, `PlayerProfileCard`, `PrivacyConfirmation`.
- Produces: Hash routes `/`, `/create`, and `/room/:roomCode`; session key `room-admin:<ROOM_CODE>`.

- [ ] **Step 1: Write failing form and room interaction tests**

```tsx
it('does not submit until public-data consent is checked', async () => {
  render(<CreateRoomPage api={fakeApi} />);
  expect(screen.getByRole('button', { name: '创建约战' })).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: '创建约战' })).toBeEnabled();
});
```

- [ ] **Step 2: Run the page tests and verify missing-page failures**

Run: `npm test -- --run src/pages/CreateRoomPage.test.tsx src/pages/RoomPage.test.tsx`
Expected: FAIL because the pages do not exist.

- [ ] **Step 3: Implement lobby, create form, fixed seats, joining/leaving, and management UI**

```tsx
<Routes>
  <Route path="/" element={<LobbyPage />} />
  <Route path="/create" element={<CreateRoomPage />} />
  <Route path="/room/:roomCode" element={<RoomPage />} />
</Routes>
```

The room page stores `admin` from the hash query in `sessionStorage`, removes it with `navigate(..., { replace: true })`, verifies it through RPC, and enables edit/remove/cancel controls only after verification.

- [ ] **Step 4: Add 250 ms Realtime refetch and responsive tactical styling**

```ts
const channel = client.channel(`room:${details.subscriptionKey}`).on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'room_change_versions', filter: `room_id=eq.${details.subscriptionKey}` },
  scheduleReload,
).subscribe();
```

Use one-column layouts at 320/375/430 px, 44 px minimum tap targets, visible focus states, and no official game assets.

- [ ] **Step 5: Run component/page tests and production build**

Run: `npm test -- --run src && npm run build`
Expected: PASS and `dist/index.html` exists.

- [ ] **Step 6: Commit the room UI**

```bash
git add src index.html
git commit -m "feat: build mobile match room experience"
```

### Task 3: Finalize database invariants and lightweight pgTAP coverage

**Files:**
- Modify: `supabase/migrations/20260811000100_core_schema.sql`
- Modify: `supabase/migrations/20260811000200_public_rpc.sql`
- Modify: `supabase/migrations/20260811000300_realtime.sql`
- Modify: `supabase/migrations/20260811000400_batrace_edge_rpc.sql`
- Modify: `supabase/tests/001_schema.test.sql`
- Modify: `supabase/tests/002_room_rpc.test.sql`
- Modify: `supabase/tests/003_admin_profile.test.sql`
- Modify: `supabase/tests/004_permissions_quota.test.sql`

**Interfaces:**
- Produces: the fixed public room RPCs plus service-only BATrace cache/quota helpers.
- Consumes: Supabase anonymous `auth.uid()` and OOPZ pairs 001–020.

- [ ] **Step 1: Review every security-definer function for qualified object names and grants**

Run: `rg -n "security definer|set search_path|grant execute|revoke all" supabase/migrations`
Expected: every security-definer function uses `set search_path = ''`, qualified tables/functions, and explicit execute grants.

- [ ] **Step 2: Keep tests focused on real friend-group failure modes**

```sql
select throws_ok(
  $$select public.join_room_seat(room_code, 'B', 1, '玩家2', '87654321', null) from created_room$$,
  'P0001', 'SEAT_TAKEN', 'occupied seat is rejected'
);
```

Tests must cover ten seats, host seat, lowest voice pair, one seat per UID, admin token verification, cancel/read-only, profile attach/detach, and the default-off switch.

- [ ] **Step 3: Validate migrations locally when Docker is available, otherwise defer execution to CI**

Run: `npm run supabase:start && npm run supabase:reset && npm run test:db`
Expected with Docker: PASS. On this machine: document the Docker absence and run the same commands in Task 5 CI.

- [ ] **Step 4: Commit migrations and pgTAP tests**

```bash
git add supabase/migrations supabase/tests supabase/config.toml supabase/seed.sql
git commit -m "feat: add atomic room database functions"
```

### Task 4: Finish and verify the optional BATrace Edge Function

**Files:**
- Modify: `supabase/functions/batrace-profile/core.ts`
- Modify: `supabase/functions/batrace-profile/index.ts`
- Modify: `supabase/functions/batrace-profile/core.test.ts`
- Modify: `supabase/functions/_shared/profileTransform.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SITE_ORIGIN`; fixed `https://app.batrace.top/api/...` endpoints.
- Produces: `{ action: 'search', query }` and `{ action: 'profile', playerId }` responses containing only candidate/profile DTOs.

- [ ] **Step 1: Run the existing handler and transform tests**

Run: `npm test -- --run supabase/functions/batrace-profile src/features/player-profile/profileTransform.test.ts`
Expected: PASS for JWT rejection, URL rejection, candidate filtering, cache hits, profile cropping, retry, timeout, switch, CORS, and quota rejection.

- [ ] **Step 2: Audit the deployed adapter for secret and raw-data leaks**

Run: `rg -n "service.role|steam64|matches|corsproxy|allorigins|client.*url" src supabase/functions`
Expected: no browser secret, raw profile field, public CORS proxy, or client-provided upstream URL.

- [ ] **Step 3: Commit the Edge Function**

```bash
git add supabase/functions src/features/player-profile
git commit -m "feat: add optional BATrace profile proxy"
```

### Task 5: Add browser acceptance, CI, deployment documentation, and online handoff

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/match-room.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `README.md`
- Modify: `.env.example`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1–4 and GitHub repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Produces: repeatable CI, Pages build artifact, Supabase setup/runbook, and online migration instructions.

- [ ] **Step 1: Add Playwright smoke tests for mobile routes and management-token removal**

```ts
for (const width of [320, 375, 430]) {
  test(`lobby fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/');
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  });
}
```

- [ ] **Step 2: Add CI that installs, lints, tests, builds, then runs Supabase DB tests in Docker**

```yaml
- run: npm ci
- run: npm run check
- run: npx supabase start
- run: npx supabase db reset --local
- run: npx supabase test db --local
```

- [ ] **Step 3: Add Pages artifact deployment and a README setup checklist**

The README must list anonymous sign-in enablement, APAC project choice, local `.env.local`, Edge secrets, default-off BATrace switch, production smoke test, and the prohibition on online `db reset`.

- [ ] **Step 4: Run the full locally available verification suite**

Run: `npm run lint && npm test && npm run build`
Expected: all commands exit 0. Record DB/E2E as CI-only if Docker/browser binaries are unavailable.

- [ ] **Step 5: Push migrations only after receiving a real database password or Supabase Access Token**

```bash
npx supabase link --project-ref hgrtlpekoblnnysmcspx
npx supabase db push --linked
```

Expected: four migrations apply without resetting online data. Then set `SUPABASE_SECRET_KEY` and `SITE_ORIGIN`, deploy `batrace-profile`, run disabled/enabled smoke tests, and enable the switch only after success.

- [ ] **Step 6: Commit delivery automation and documentation**

```bash
git add .github e2e playwright.config.ts README.md .env.example package.json package-lock.json
git commit -m "ci: verify and deploy match system"
```
