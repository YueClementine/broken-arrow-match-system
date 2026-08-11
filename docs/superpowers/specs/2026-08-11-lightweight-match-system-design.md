# Broken Arrow 5v5 轻量约战系统设计

## 目标

为一个固定朋友群提供手机端 5v5 约战工具。系统优先保证建房、选座和房主管理简单可靠；BATrace 玩家资料只是可跳过的增强功能。项目不按商业 SaaS 的合规、审计和高并发标准设计。

## 架构

- React、TypeScript、Vite 和 HashRouter 构成 GitHub Pages 前端。
- Supabase 提供匿名登录、PostgreSQL、Realtime 和 Edge Function。
- 浏览器只使用 Publishable Key。BATrace 请求由 Edge Function 代理，后端 Secret 不进入浏览器或仓库。
- 北京时间是所有比赛时间输入与显示的唯一时区。

## 约战功能

- 大厅显示未来七天的有效房间；每个房间固定 A、B 两队各五个座位。
- 创建房间时房主必须占一个具体座位。房间、座位、管理 Token 和 OOPZ 语音组在同一数据库事务中建立。
- 同一玩家在同一房间只能占一个座位；并发抢同一座位只允许一个请求成功。
- 已开始或已取消房间只读。房主可通过当前标签页保存的管理 Token 改期、修改资料、移除玩家或取消房间。
- 取消房间立即使语音预约失效；改期重新选择最低可用语音组。

## 轻量安全边界

保留以下低维护成本的安全措施：

- 匿名 JWT 标识当前座位所有者，避免任何人直接替别人退座。
- 业务写入通过数据库 RPC 完成，原子性和关键校验放在数据库内。
- 管理 Token 只保存 SHA-256 摘要；管理链接中的明文 Token 进入 `sessionStorage` 后立即从地址栏移除。
- 玩家 UID、BATrace 原始响应、Steam64 和完整对局不返回前端。
- Edge Function 只调用固定 BATrace GET 端点，并限制允许的网页 Origin。

不增加多角色后台、审计日志、验证码、封禁系统、复杂风控或商业级权限矩阵。只保留每人建房冷却和 BATrace 固定额度，防止朋友误操作或脚本意外刷接口。

## BATrace 增强

- 昵称输入两字后延迟搜索，候选只保留有有效 ELO 和排位场次的玩家。
- 选中候选后获取裁剪资料，并用 BATrace 标准昵称替换手填昵称。
- 房间仅显示 ELO、等级、近十二场胜率、平均 KD、主力兵种、最多三个常用单位和抓取时间。
- 搜索失败、超时、额度用尽或开关关闭时，手填昵称和全部约战功能仍可使用。
- 不展示蛆指数、封禁记录、玩家追踪或完整对局。

## 数据和实时刷新

- 核心表为 `rooms`、`room_seats`、`voice_channel_pairs`、`room_change_versions` 和裁剪后的 `player_profiles`。
- 房间页面通过裁剪读取 RPC 获取数据。Realtime 只监听房间版本号；版本变化后防抖重新读取详情。
- BATrace 搜索缓存十分钟，资料缓存六小时。运行时开关默认关闭，线上冒烟测试成功后再开启。

## 测试和验收

测试聚焦朋友群真实会遇到的路径：

- 纯逻辑：北京时间、表单校验、候选排序和最近十二场资料转换。
- 数据库：创建并选座、座位唯一性、管理操作、语音预约和资料关联。
- Edge Function：匿名 JWT、固定上游地址、裁剪、缓存、关闭和失败降级。
- 前端：资料选择/跳过、公开资料确认、资料卡展开、建房和报名表单。
- 端到端：两浏览器抢座、房间实时刷新、管理链接以及 320/375/430 像素布局。

本机没有 Docker，因此本机执行前端和纯函数测试；数据库与端到端测试交给 GitHub Actions。线上项目禁止执行 `db reset`。

## 部署

- 目标 Supabase 项目为 `hgrtlpekoblnnysmcspx`，浏览器配置保存在本机忽略提交的 `.env.local`。
- GitHub 仓库只配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY` 变量。
- 数据库密码、Supabase Access Token 和 Edge Secret 只进入 Supabase/GitHub Secret，不写入代码。
- 推送线上 migration 需要项目所有者提供真实数据库密码或 Access Token。
