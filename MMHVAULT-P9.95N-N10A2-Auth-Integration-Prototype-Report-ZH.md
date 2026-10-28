# MMHVAULT · P9.95N-N10-A2 独立认证集成原型

**日期：2026-10-28**  
**部署范围：MMHVAULT-Auth-QA GitHub Pages；仅使用 Supabase Auth Staging。**  
**状态：代码与静态安全检查通过，需用户进行浏览器端真实登录验收。**

## 新增文件
- `p995n-n10a2-auth-integration-qa.html` — 独立 Premium Liquid Glass 黑金深蓝认证页面（移动端响应式，中英切换）。
- `p995n-n10a2-auth-integration-qa.js` — 仅连接隔离 Staging 项目的认证 UI 交互。

GitHub Pages 地址：
https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/p995n-n10a2-auth-integration-qa.html

## 功能范围

| 模式 | 实际能力 | 本次状态 |
|---|---|---|
| 邮箱 + 密码 | Staging 账户 B 的 Email/Password 登录，后端 `getUser` 验证原 UID，QA RLS 只读自己的 1 条记录 | 开发完成，真实登录待验收 |
| Google | Staging 账户 A 使用 OAuth PKCE，回调核对原 UID，QA RLS 只读自己的 1 条记录 | 开发完成，先在 Staging Redirect URLs 添加新回调地址，真实登录待验收 |
| 用户名 | 展示账户 B 的已绑定用户名；调用 N9 `preflight` 检查安全开关 | 当前只有**关闭状态检查**，不能在本页真正使用用户名登录；N9 的真实兼容性在前一阶段独立验收 |
| 邮箱恢复 | 链接跳转 N8 已验收的独立恢复测试 | 只复用测试入口，不在本页面修改密码 |
| 会话管理 | 令牌仅保存在网页内存中，支持 Refresh Token 轮换与退出后 QA 表旧 JWT 读取拒绝测试 | 代码已实现，待浏览器测试 |
| 语言与样式 | 深蓝黑金 Liquid Glass、宽屏/手机适配、中英文本切换 | 代码检查通过，跨设备视觉待用户验收 |

## 安全验证结果

- 重新从 GitHub 读取 HTML/JS：脚本引用正确，22 个 DOM ID 均唯一，JS 中引用的元素均存在。
- JavaScript 语法检查通过。
- HTML Content Security Policy：只允许本域脚本；只连接已指定的 Staging Supabase；禁止嵌入式框架。
- 未包含生产项目 ID、service_role、secret key；仅使用 Staging 的公开 publishable key。
- OAuth PKCE 的短时 code verifier 仅存于 `sessionStorage`，验证成功后立即清理； Access/Refresh Token 不使用 localStorage/sessionStorage/Cookie 保存。
- 登录后核对 `/auth/v1/user` 的原 UID 和 `mmh_p995k_session_protected_qa` 所有者，账号不匹配立即尝试退出。
- N6 及 N9 服务器的代码级关闭保护复核通过，不曾重新开启或重部署。
- Staging 核对仍为 2 个 Auth 用户、2 条用户名绑定、2 个 QA 数据所有者。
- **本次未执行浏览器端实际密码/Google 登录、未进行 iOS/Android 兼容实测、未修改正式财务数据。**

## 用户下一步步骤

1. 打开新 Auth QA 页面，检查顶部中英切换、三种登录选项和页面布局。
2. **邮箱模式**：仅使用账户 B 的新 Staging 密码；确认 UID `72a8d120…cffc`、QA RLS PASS，点击会话续期、退出。
3. **Google 模式**：先在 **Staging** Authentication → URL Configuration → Redirect URLs 中添加完整地址：`https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/p995n-n10a2-auth-integration-qa.html`；再使用原账户 A 的 Google 账号进行 PKCE 登录。错用其他 Google 账户可能导致新 Staging Auth 用户自动创建。
4. **用户名模式**：只检查 N9 关闭状态，不要修改开关、不要输入密码。
5. 保存截图、记录浏览器和报错代码；不要传播密码、授权码、完整恢复链接或密钥。

## 限制与上线闸门

此版本为**独立测试原型**，不是正式站点更新。测试页面不提供注册、财务 Dashboard 或生产认证集成；用户名尚未在本页完成真正的第三种方式的端到端登录。先验收邮箱与 Google 两种实际会话，再于隔离 QA 环境审查新用户名集成方案；禁止绕过已关闭的安全开关。

相关前置报告：`MMHVAULT-P9.95N-N10A1-Production-Security-Definer-ReadOnly-Audit-ZH.md`。生产 Security Advisor 的两项 WARN 仍待处理或评估，不因本次测试静态通过而自动消除。


## 真实浏览器验收补充（2026-10-28）

经用户在 Mac Chrome 无痕窗口对部署后的 Auth QA 页面逐项实测，截图显示：

| 验收项 | 邮箱账户 B | Google 账户 A |
|---|---|---|
| 真实登录 / OAuth 回调 | PASS | PASS |
| UID 归属 | `72a8d120…cffc` 与原账号一致 | `1bc5708a…c690` 与原账号一致 |
| 专用 QA RLS 所有者读取 | PASS · 仅自己 1 条 | PASS · 仅自己 1 条 |
| Refresh Token 续期后 UID/RLS | PASS | PASS |
| 显式退出 | PASS | PASS |
| 旧 JWT 无法读取专用 QA 表 | PASS | PASS |
| UID、METHOD、RLS 状态清空 | PASS | PASS |

Google 模式的 Staging Redirect URL 已由用户添加，OAuth PKCE 成功完成原 UID 校验；邮箱模式使用 N8 后的新 Staging 密码成功。无明文密码、授权码或访问令牌收集到报告中。

**证据范围：**以上为页面实测反馈及截图证实的结果，未在审查中扫描浏览器网络/所有服务端 session；旧 JWT 读取被拒仅针对专用 QA 表，不能宣称整个生产系统的已签发 Access Token 立即失效。既有浏览器密码自动填充可能在输入框显示圆点，但脚本已在登录提交后清空表单值，后续还应跨浏览器检查自动填充。

**阶段结论：**N10-A2 的邮箱和 Google **双模式身份与会话回归通过**。用户名标签尚未完成本页安全关闭状态的用户实测，且本页不执行真实用户名登录；完整三方式生产集成仍未放行。移动端、性能与正式财务表 RLS 未验收。N6/N9 继续保持代码级关闭；与正式生产环境完全隔离。

## N10-A3 建议继续顺序

1. 在 N10-A2 页面点击「用户名」→「检查 N9 关闭保护状态」，记录闭锁测试 PASS（绝不重新开启旧接口）。
2. 审查 N6/N9 的服务端最小权限、失败限流、Turnstile Siteverify 以及同 UID 会话创建方式，形成安全复用方案；仅在全新隔离接口进行第三方式端到端测试。
3. 复核 GitHub Pages OAuth、邮箱与用户名组合在 iOS Safari/Android Chrome 的交互。
4. 回归生产业务表的完整所有者隔离后，才考虑生产集成及回滚方案。


## 用户名接口关闭保护实测（2026-10-28）

用户在 N10-A2 独立登录页面的「用户名」选项点击「检查 N9 关闭保护状态」。截图显示：

> PASS：N9 接口已经关闭。本页不执行用户名真实登录；N9 独立验收记录仍保留。

在这一步，UID、QA RLS、METHOD 显示为未登录状态 `—`，没有产生新用户名登录会话。说明 **N10-A2 页面可正确识别 N9 服务器端的关闭状态**。

**阶段判定：N10-A2 已完成邮箱与 Google 实际会话回归，以及用户名关闭状态验证。** 新版统一页面尚未执行用户名+密码真正登录；这部分需要 N10-A3 使用独立、最小权限、默认关闭的 Staging 验收路线完成，不能把“开关关闭 PASS”视为第三种登录的端到端通过。

**部署安全约束：** 保留 N6/N9 原代码级关闭；不得把测试 Edge Function 的 Secret 或生产凭据写入 GitHub Pages；不得改动正式站点、正式 Auth 用户和财务记录。
