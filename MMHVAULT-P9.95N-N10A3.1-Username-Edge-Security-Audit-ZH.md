# MMHVAULT P9.95N — N10-A3.1 用户名登录 Edge Functions 安全源码审查

**2026-10-28 / Staging 只读审查 / 不修改正式网站或 Staging 已部署接口**

## 一、已审查的实际组件

- Staging 项目：`ldivswlhtgmznzwhzsoi`；**不是正式 MMHVAULT 生产项目**。
- 已部署 `mmh-staging-p995n-multiuser` v11（N6）共 148 行。
- 已部署 `mmh-staging-p995n-n9-compat-qa` v4（N9）共 107 行。
- `public.mmh_p995i_username_links` 的字段、主键、UID 唯一约束、格式 CHECK。
- `public.mmh_p995j_take_attempt` 限流 RPC 的定义和可调用权限。
- `public.mmh_p995j_login_throttle` 权限与 RLS。
- `public.mmh_p995k_session_protected_qa` 的读取策略。
- N10-A2 新登录网页：邮箱/Google 真正签发会话，用户名仅 `preflight`。
- 官方参考：Supabase Edge Function Secret、Auth JWT/API keys；Cloudflare Turnstile Siteverify（要求服务端校验，token 单次使用、5 分钟有效）。

## 二、与 N10-A2 接口兼容的核心区别

| 对比 | N6 | N9 |
|---|---|---|
| 支持用途 | `status` / `bind` / `login` | `preflight` / `login` |
| 可以绑定用户名 | 是 | 否 |
| 用户名+密码可验证 | 是 | 是，仅预置 B |
| 登录成功返回 access/refresh | **是**（N6 第 144–145 行） | **否**（N9 第 98–102 行，验证后撤销） |
| Turnstile Siteverify | 有，校验 hostname、action | 有，校验 hostname、action |
| 服务器限流 | 按用户名、UID 桶 | 预置单用户全局桶 |
| 部署时实际开关 | `N6_QA_WINDOW_OPEN=false` | `N9_QA_WINDOW_OPEN=false` |
| 应直接拿到正式网站使用？ | 否 | 否 |

**N9 是认证兼容性证明接口，不是生产登录 API。** N10-A2 只检查关闭状态，不能把 N9 PASS 写成统一第三入口实际登录 PASS。

## 三、通过的安全机制

1. **数据库硬约束**：用户名主键唯一；`user_id` 也有唯一约束，且 FK 指向 `auth.users(id)`，用户名必须符合小写 ASCII、4–20 字符的 CHECK；因此并发绑定时数据库可以原子拒绝冲突。
2. **权限隔离**：用户名映射表开启 RLS，`anon` / `authenticated` 都没有直接读取和插入权限；限流 RPC `mmh_p995j_take_attempt` 不是 SECURITY DEFINER，`anon` / `authenticated` 均无 EXECUTE，`service_role` 有 EXECUTE；限流数据表开启 RLS，普通用户无 SELECT，减少绕过风险。
3. **验证码**：两个接口均调用 Cloudflare Siteverify 并同时核对 `hostname` 和指定 `action`，没有只信任前端绿色勾选。
4. **服务端身份映射**：N6 通过管理端查找用户名→UID→已验证邮箱，再调用 Supabase 原生密码校验，并复查返回 session 的 UID；未直接相信客户端传入 UID。
5. **关闭保护**：N6/N9 都存在独立于 Secrets 的代码级 `false` 开关；N9 B-only 临时验证不会把 access/refresh 暴露给浏览器；用户已完成关闭状态截图实测。
6. **响应控制**：仅对已配置 Origin 返回 CORS 许可，并使用 no-store，不回显管理员 Secret、验证码 Secret 或限流盐。

## 四、必须修复 / 验证的风险（上线前阻断）

| ID | 级别 | 代码证据 / 风险 | 处理建议 |
|---|---|---|---|
| S-01 | 高 | N6 的登录配额仅 `quota('login:'+name,8,900)`（约第 132 行）。攻击者轮换用户名可分散计数；前置验证码不能完全替代整体请求节流 | 为新 QA API 增加全局固定桶 + 规范化用户名桶，且限流在查询映射与密码验证前执行；生产要按实际流量设计可信边缘 IP / 账号多维限流 |
| S-02 | 高 | N6 的 `login` 分支成功产生 session 后，若后续校验/网络抛异常，最终 `catch`（约第 146 行）直接 503，未统一对临时登录 token 执行 revoke | 将所有已签发 token 放入 `try/finally` 可见域；失败时最佳努力退出并严禁回传任意部分令牌 |
| S-03 | 高 | N6 在 token 返回前核对 Auth UID，但不是自身再查一次专用 QA 表所有者（N9 有这一步） | 新隔离入口返回 token 前必须同时通过后端 `getUser` 与单用户 QA RLS 校验，客户端仍做第二次确认 |
| S-04 | 中 | N6 Username 只按用户名桶限流，未对 IP/全站攻击、拒绝服务、跨实例瞬时竞争做端到端对抗回归 | 利用现有原子 `ON CONFLICT` 限流 RPC 做全局/账户桶，补同 IP 多名字、不同 IP 同名字、并发等测试 |
| S-05 | 中 | GitHub Pages 多个项目共享同一域名，Origin 限制到 `https://myintmoehein0115024.github.io` 不能证明请求来自特定页面，非浏览器客户端还可自行设置 Origin | Origin 仅作为浏览器 CORS 层；必须始终校验一次性 Turnstile、严格 action/hostname、短测试窗口、服务端限流与真实密码，不能把 Origin 当授权 |
| S-06 | 中 | N6 接口密码长度允许 6–256 字符，正式站点 UI 另有 6/8/10 规则；注册用户名后端 4–20 字符 | 新 QA 与现有 Auth 密码策略先保持兼容，正式集成前统一文案/安全密码政策 |
| S-07 | 中 | N6 返回 `login_success` token，N9 永不返回；两者响应契约不同 | 新函数采用独立路径与明确版本，不覆写 N6/N9；写清内存保存、退出和旧 JWT 的测试边界 |
| S-08 | 中 | 错密码或不存在账号一般返回统一 `invalid_credentials`，但格式错误、限流状态、用户未验证状态等仍有差异 | 正式登录界面对普通失败显示非枚举消息，服务端日志保留不含用户名/密码/token 的错误分类 |
| S-09 | 中 | 当新函数未部署时不可证实移动端 Safari、Cloudflare 在各网络环境表现 | 在隔离环境做 iOS Safari、Android Chrome、桌面 Safari/Chrome 的错误恢复、Turnstile 刷新和回调回归 |

## 五、限制说明

- **并未进行真实恶意攻击测试**：以上属于 Staging 的已部署代码和数据库授权的静态分析。限流可靠性、Token 生命周期、所有副作用还需要隔离测试。
- 本轮未获得 Secrets 明文，也没有读取/修改用户密码、财务记录。
- 现有专用 QA 表通过其 RLS 检查会话可访问性，不能证明通用 access JWT 在登出后立即全局失效；Supabase access JWT 一般在有效期内仍可在不检查会话的资源被接受。
- 没有将 `SECURITY DEFINER` 与内部限流 RPC 混淆：上述限流 RPC 是 `SECURITY INVOKER`，且只向 service_role 授予执行权限。
- 浏览器的 `Origin` 字段及 Turnstile action **不构成独立用户认证**，不能替代密码与 UID/RLS。

## 六、下一阶段实现要求

**A3.2：**只能新建独立 Staging QA 函数；默认代码级关闭 + 独立 Secret 开关。改进全局与用户名双限流、Siteverify、已验证用户归属、登录时 QA RLS 校验与失败清理，再返回标准 token（仅测试页内存持有）。旧 N6/N9 继续关闭。完成代码审查和拒绝测试后，才允许临时打开新接口。

**A3.3：**在 N10-A2 隔离网页增加受控用户名密码操作及 Turnstile 组件（不直接改正式 login.html）。测试 B 的邮箱和用户名登录共享 UID，与 A Google 身份互相隔离，Refresh/Logout、原本的 Google/邮箱路径都不能回退。

**结论：N10-A3.1 源码及 DB 权限静态审查完成；A3.2 需先补完 S-01/S-02/S-03 才能上线隔离测试。生产三登录仍处于 BLOCKED。**
