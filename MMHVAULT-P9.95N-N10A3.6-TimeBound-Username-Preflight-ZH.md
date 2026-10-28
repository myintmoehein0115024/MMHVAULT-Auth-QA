# MMHVAULT · P9.95N — N10-A3.6 限时用户名登录安全准备与验收

**日期：2026-10-28**  
**项目：MMHVAULT-Auth-Staging (ldivswlhtgmznzwhzsoi)**  
**结论：限时保护源码与 Staging v2 安全关闭部署完成；真实用户名登录未开放。**

## 已完成

1. Google OAuth 在统一 QA 页的登录、续期、退出、旧 JWT 专用 QA 表拒绝已经由用户截图连续确认 PASS。邮箱登录同样完整 PASS。该结论仅适用专用 QA 表。
2. 已更新 `staging-review/n10a3-username-login/index.ts`，并部署到独立 Staging Edge Function `mmh-staging-n10a3-username-login` **v2**；未触碰正式 MMHVAULT 或原 N6/N9 代码。
3. 保留 `CODE_GATE_OPEN=false` 的编译时代码闸门，并继续要求独立 Secret `MMH_N10A3_ENABLED=true`。
4. 新增测试窗口的 `WINDOW_START_UTC`、`WINDOW_END_UTC` 与最大时长 `MAX_WINDOW_MS=15*60*1000`。当前两时间均设为 `1970-01-01T00:00:00.000Z`，即使其他参数存在，也不允许登录。
5. `loginReady()` 每个请求重新计算。完成 Cloudflare、邮箱密码校验、原 UID 与专用 QA RLS 后，再次计算窗口，若期间过期，返回 `staging_window_closed`，并进入 `finally` 尝试撤销刚签发的会话，**不向网页返回令牌**。
6. 更新 `p995n-n10a3-three-login-qa.html` 与 JS；显示 v2 限时关闭状态，同时将 Google 回调提示改为“已验证可用，仅出现错误时需检查”。客户端源码检查通过，仍只调用新接口而不重新启用 N6/N9。

## N10-A3.6 新增的 8 项离线模拟测试

| 用例 | 模拟结果 |
|---|---|
| 真实仓库代码闸门仍关闭 | 503；无外部调用；无 token — PASS |
| 关闭状态 preflight | 200 preflight_ok + enabled=false — PASS |
| 仅在内存中打开代码闸门，但时间仍为 1970 | 503 — PASS |
| 仅在内存中打开代码闸门，Secret 为 false | 503 — PASS |
| 时间窗口已过期 | 503 — PASS |
| 测试窗口配置超过 15 分钟 | 503 — PASS |
| 虚构密码/身份/RLS 全部通过且时间有效 | 200（仅虚构 token）— PASS |
| 时间在最后一次 QA RLS 验证过程中到期 | 503 + revoke 调用 1 次 + 无 token 回传 — PASS |

以上均为独立的 JavaScript mock 模拟，未调用真实 Supabase Auth / Cloudflare Siteverify，不能视为端到端登录成功或严格的负载/并发测试。

## 部署后的只读核验

| 检查 | 实际查询结果 |
|---|---|
| 旧 N6 `mmh-staging-p995n-multiuser` | v11；代码闸门关闭 |
| 旧 N9 `mmh-staging-p995n-n9-compat-qa` | v4；代码闸门关闭 |
| 新 N10-A3 `mmh-staging-n10a3-username-login` | v2；代码闸门关闭；起止时间均为 1970 |
| Auth 用户数量 | 2 |
| 用户名绑定数量 | 2 |
| 专用 QA 数据所有者数量 | 2 |
| 正式财务系统 | 未部署、未更改 |

## 用户现在可做的安全验收（不输入密码）

1. 打开 `https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/p995n-n10a3-three-login-qa.html?v=3`。
2. 选择「用户名」。
3. 点击「检查 N10-A3.6 限时保护（无需密码）」，将通过新 N10-A3 v2 接口读取安全关闭状态。
4. 预期状态为 **PASS：N10-A3.6 v2 限时测试开关关闭**，密码框与登录按钮禁用。
5. 请勿输入或分享任何真实密码、验证码、JWT、API Secret。

## 以后临时开放的严格条件（当前尚未开放）

- 只在用户准备好本人 Staging 账户 B 测试时，经过再次审批，创建一次起止均明确的 **不超过 15 分钟**的源代码窗口。
- 需要同时满足：`CODE_GATE_OPEN=true`、Staging 的 `MMH_N10A3_ENABLED=true`、服务端配置完备、当前 UTC 时间处于窗口内。当前四重条件并不满足。
- 只允许指定账户 B、指定绑定用户名；必须通过 Cloudflare Siteverify 的 hostname/action、全局与用户名双配额、真实 Staging 密码、原 UID 和专用 RLS。
- 测试 B 的 Username 登录/续期/退出/旧 JWT 拒绝，并与 A 的 Google UID/RLS 作交叉验证。
- 窗口到期会自动关闭登录；结束后**仍需主动重新部署 `CODE_GATE_OPEN=false` 的关闭版本并将独立 Secret 设为 false**，双重关闭，留存验收截图。
- 生产安全问题（如 Staging 泄露密码保护未启用的提示）和所有生产财务数据表 RLS 独立验收，不能因为 QA 通过而自动解除 BLOCKED。

## 安全边界

- Cloudflare hostname/action 和 Origin/CORS 不能替代认证；用户密码仅在临时 Staging 函数内部传递给 Supabase Auth。
- 失败撤销属于尽力而为；JWT 已签发后可能直到到期前仍可被某些不检查会话状态的下游资源接受，绝不宣传“退出即所有 JWT 全球即时失效”。
- 这次没有读取或修改任何用户密码、财务交易、资产或正式认证设置。
