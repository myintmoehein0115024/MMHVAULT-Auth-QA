# MMHVAULT — P9.95N-N10-A3.3 负向验证与三登录集成预览

**日期：2026-10-28**  
**范围：仅 MMHVAULT-Auth-QA 与 Supabase `MMHVAULT-Auth-Staging`，无正式财务操作**

## 本轮实际交付

1. 对 N10-A3.2 的新用户名登录源码执行了 **29 项离线模拟用例，全部符合预期**。
2. 新建 `p995n-n10a3-three-login-qa.html` 及 `p995n-n10a3-three-login-qa.js`，基于已验收 N10-A2 的双登录流程，为第三入口接入真正的身份/RLS 核验逻辑。
3. 新的用户名控件初始全部锁定；仅在 Staging 新接口 `preflight` 返回 `configured:true`、`enabled:true`、`scope:staging_account_b_only` 时才有条件加载 Turnstile、允许输入密码。
4. 在独立 **Staging 项目** 新部署 `mmh-staging-n10a3-username-login` **v1**，`verify_jwt=false`，以支持未登录时的 preflight 和未来的服务端密码认证；**源码写死 `CODE_GATE_OPEN=false`，并另要求 `MMH_N10A3_ENABLED=true`。目前绝不执行用户名登录。** 不触碰 N6/N9。
5. 云端重新读取已部署函数：确认 N6 v11、N9 v4、新函数 v1 均代码级关闭；Staging 仍有 **2 个 Auth 用户、2 个用户名绑定、2 个 QA 数据所有者**。
6. 新 UI 静态检查通过（JS 语法、所有 DOM ID 唯一、绑定齐全、仅测试域、无 service_role/secret key、密码框和登录按钮默认 disabled）；模拟无接口/接口已关闭两种场景，不发送密码。

## 29 项模拟负向用例

**请求入口：**
- 有效虚拟登录（受控 mock 返回）→ 200 且 QA 身份校验通过
- 非法 Origin → 403
- 非法 HTTP 方法 → 405
- 非 JSON Content-Type → 415
- 非法 JSON → 400
- 不支持的 action → 400
- 非法用户名格式 → 401
- 不合规密码长度 → 401

**速率限制和验证码：**
- 全局限流达阈值 → 429，停止后续流程
- 用户名配额达阈值 → 429
- 限流后端异常 → 503，拒绝继续
- 缺失验证码 → 403
- Siteverify 返回失败 → 403
- 验证码域名错误 → 403
- 验证码 action 不匹配 → 403
- 验证服务不可用 → 503

**身份验证：**
- 不允许的测试用户名 → 401
- 映射 UID 不匹配 → 401
- 映射存储不可用 → 503
- 账户未验证邮箱 → 401
- 用户管理接口 UID 不匹配 → 401
- 账户服务不可用 → 503
- 错误密码 → 401
- Auth token 服务不可用 → 503

**会话与 QA 数据：**
- Auth getUser UID 不匹配 → 503，模拟撤销一次
- getUser 服务不可用 → 503，模拟撤销一次
- QA RLS 无本人记录 → 503，模拟撤销一次
- QA RLS 请求不可用 → 503，模拟撤销一次
- 模拟登出服务网络中断 → 503，不向网页返回 token（已尝试撤销一次）

**注意：以上 29 项是在内存中暂时改为测试开关开启、并使用虚构账号和服务端 mock 响应的测试，不是实际打到 Staging 的攻击或登录请求。GitHub 和真实部署中的代码开关仍然是 `false`。**

## 三登录页面的安全行为

打开：`https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/p995n-n10a3-three-login-qa.html`

- 邮箱账户 B：保留 N10-A2 的登录、UID/RLS、Refresh、Logout 逻辑，**尚需在新页面重新验收**。
- Google 账户 A：保留 PKCE 逻辑，**新页面需额外加入 Staging Redirect URL**，否则回调会失败；之前 N10-A2 的成功不自动证明新页面的 Google 回调成功。
- 用户名账户 B：点击「检查 N10-A3.2 接口（无需密码）」。预期显示 `PASS：服务端登录开关关闭`，密码输入框和登录按钮仍不可用。这才是当前安全状态。
- 当未来新接口经过审查并临时开窗：使用公开 Turnstile Site Key 在浏览器绘制验证码，服务端 Siteverify 完成后请求 Staging B 的用户名登录，再用旧 N10-A2 的 `accept()` 校验固定 UID B 和单条 QA RLS。测试窗口关闭后入口应自动失效。

## 风险/限制与下一阶段

- **未开启任何真正的第三入口登录**，本轮不能宣称「三方式端到端 PASS」。
- 因执行环境无法直接向公网 Staging Edge URL 发出 POST，请由用户打开 GitHub Pages 网页做无密码 preflight 截图，核对实际服务端响应；目前仅确认管理接口中的已部署源码与闭锁配置。
- 作为免登录 Edge Function，v1 `verify_jwt=false` 是预期设计，但只有服务端 Turnstile + 密码校验 + UID/RLS + 多层速率限制能做真实认证，Origin/CORS 不能充当授权。
- 模拟撤销网络失败并不证明已签发 JWT 立刻全局失效；当前不会把这些模拟 token 暴露给前端。
- 高并发、IP/用户组合限流、真实验证码重复提交、浏览器移动端以及所有正式财务数据表的 RLS 尚未实测。真实开放前还需做安全复核与回滚准备。
- 不得把测试 Secrets、全量 token、账号密码或回调授权码复制到截图/报告。

## 当前结论

**N10-A3.3 的源码集成、静态验证、负向 mock 与 Staging 安全闭锁部署均完成。真实用户名登录：BLOCKED（符合预期），下一步先完成浏览器无密码 preflight 验收。** 保留 N6/N9 原接口代码级锁，生产 MMHVAULT 原样。

## 2026-10-28 浏览器真实关闭保护验收（追加）

用户在 Mac Chrome 无痕窗口访问 `p995n-n10a3-three-login-qa.html`，选择「用户名」，点击「检查 N10-A3.2 接口（无需密码）」后，页面显示：

> PASS：N10-A3.2 服务端登录开关关闭。用户名密码登录不可用（预期状态）。

截图确认：已绑定的测试用户名正常展示，用户名登录按钮禁用。此测试通过部署后的实际浏览器页面确认了 Staging 新接口的 `preflight` 关闭行为，不是用户名密码登录。

**界面纠正与已完成的增量变更：**
- 原密码框显示的 8 个圆点在源码里是 `placeholder="••••••••"`，不是浏览器已经输入密码的证据。
- 已更改为 `placeholder="未填写 · 安全锁定"`，使用 `readonly disabled` 和 `autocomplete="new-password"`。
- 前端在锁定时清空密码值，并通过 `pageshow`、`input` 事件进一步避免被误填；只有服务端真实启用才允许用户名登录。
- 新版脚本使用 `p995n-n10a3-three-login-qa.js?v=2` 防止旧缓存混用。
- 使用模拟浏览器对象，验证接口不可用/关闭两种情况均不会发送登录请求，密码框和提交按钮保持禁用。

**阶段结论：**真实浏览器无密码 preflight PASS，N10-A3.3 的安全闭锁验收完成。新函数继续代码级关闭；真实用户名登录、在新页面的邮箱/Google 回归、生产数据的整体安全验收仍待进行。正式 MMHVAULT 未修改。

## N10-A3.4 新页面邮箱完整会话回归（2026-10-28）

用户在 Mac Chrome 无痕窗口运行 `p995n-n10a3-three-login-qa.html?v=2`，提供了邮箱登录、会话续期、退出和旧 JWT 专用 QA 表拒绝的连续截图，验收如下：

| 验收项 | 截图结果 |
|---|---|
| 邮箱账户 B 登录 | PASS |
| 原 UID `72a8d120…cffc` 不变 | PASS |
| 专用 QA RLS 仅本人一条 | PASS · 1 |
| Refresh Token 续期后 UID/RLS 不变 | PASS |
| 显式退出登录 | PASS |
| 旧 JWT 被拒绝读取专用 QA 表 | PASS |
| 页面 UID、QA RLS、METHOD 清空 | PASS |

**结论：**N10-A3.4 邮箱完整真实 Staging 会话回归 PASS；这是专用 QA 表和当前测试会话的验证，不能据此推断全部生产数据表或任意使用场景下旧 JWT 已即时失效。

**后续：**N10-A3.5 Google OAuth 新页面回归尚未执行。新页面回调必须独立列入 Staging `Redirect URLs`：

`https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/p995n-n10a3-three-login-qa.html`

先验证 Google A 原 UID `1bc5708a…c690`、专用 QA RLS、会话续期与退出；用户名真实登录仍保持 BLOCKED，不要开启旧 N6/N9 或正式生产功能。
