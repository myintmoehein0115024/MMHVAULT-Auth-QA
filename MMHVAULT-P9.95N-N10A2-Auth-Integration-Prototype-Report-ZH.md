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
