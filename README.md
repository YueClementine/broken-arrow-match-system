# Broken Arrow 5v5 约战

朋友群自用的手机端约战站：创建未来七天内的 5v5 房间、固定选座、自动分配 OOPZ 001–020 语音组，并可选关联 BATrace 的裁剪玩家资料。

BATrace 查询失败、超时、关闭或没有结果时，建房和报名仍可正常使用。页面不会展示 Steam64、完整对局、封禁记录、玩家追踪或衍生评价指数。

## 本地前端

要求 Node.js 20 或更新版本。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local` 只填写项目 URL 和 Publishable Key。当前开发项目为 `hgrtlpekoblnnysmcspx`，本机文件已配置且被 Git 忽略。

常用检查：

```bash
npm run lint
npm test
npm run build
```

## Supabase 初始化

1. 在项目 Dashboard 的 Authentication 设置中启用 Anonymous Sign-Ins。
2. 准备 Docker 后运行 `npx supabase start`、`npx supabase db reset --local` 和 `npx supabase test db --local`。
3. 线上项目使用真实数据库密码或 Supabase Access Token 链接：

```bash
npx supabase link --project-ref hgrtlpekoblnnysmcspx
npx supabase db push --linked
```

`db reset` 只能用于本地/CI，禁止对线上项目执行。

## BATrace Edge Function

BATrace 功能默认关闭。Edge Function 需要以下 Secret：

- `SUPABASE_SECRET_KEY`：Supabase 后端 Secret Key，只在 Edge 环境使用。
- `SITE_ORIGIN`：正式 GitHub Pages Origin，例如 `https://example.github.io`。

部署：

```bash
npx supabase secrets set --project-ref hgrtlpekoblnnysmcspx SUPABASE_SECRET_KEY=... SITE_ORIGIN=...
npx supabase functions deploy batrace-profile --project-ref hgrtlpekoblnnysmcspx --no-verify-jwt
```

先在关闭、超时、无结果和重复昵称情况下确认约战仍可使用，再启用：

```sql
update private.app_config
set batrace_enabled = true, updated_at = now()
where singleton;
```

资料只显示 ELO、等级、最近最多十二个有效趋势点的胜率/平均 KD、主力类别、最多三个常用单位和抓取时间。数据来自 [BATrace](https://app.batrace.top)，可能存在数天延迟，仅供参考；其公开接口没有已知 SLA，因此保留运行时关闭开关。

## GitHub 配置

Repository Variables：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SITE_ORIGIN`

Repository/Environment Secrets：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SECRET_KEY`

`CI` 在本地 Supabase 容器中运行 migration、pgTAP 和双浏览器验收。`Deploy Pages` 从 `main` 构建 GitHub Pages；`Deploy Supabase` 必须手动触发，避免误改线上数据库。

## 数据边界

- 浏览器只使用 Publishable Key，通过裁剪 RPC 读取房间。
- 业务写入由 PostgreSQL RPC 原子完成；房间座位不会因并发产生双占。
- 管理 Token 只在创建时返回，数据库仅保存摘要；打开管理链接后 Token 转入当前标签页 `sessionStorage` 并从地址栏移除。
- Realtime 只订阅房间版本号，变化后重新读取裁剪详情。
