# MMHVAULT · N10-A4 正式站点三登录集成前只读审查

日期：2026-10-28。范围：正式 GitHub 仓库 `myintmoehein0115024/MMHVAULT` 的 `main` 分支入口和隔离 Staging 完成的 N10-A3.7 证据。**没有修改主站、生产 Supabase 或生产数据。**

## 正式入口已核对
- 根目录 `index.html` 指向 `login.html`；原入口成功登录后去 `app.html`，或经允许的 `next` 参数转 `business.html`。
- 当前 `login.html` 有邮箱密码登录、Google OAuth 和密码恢复，以及 `signin`、`signup`、`recovery` 表单；当前未发现用户名登录入口和 Turnstile 用户名服务端登录调用。
- 登录后 `verifiedRedirectV946` 使用 Supabase Auth 的 `getUser()` 与 `getSession()` 核验同一 UID 再跳转。用户名新入口不能削弱此保护。
- 当前主站 login 使用 publishable key 而非 secret/service_role key；Supabase URL 与隔离 Staging `ldivswlhtgmznzwhzsoi` 不同。不能复制 Staging 的密钥、绑定用户或专用 QA 表到生产。
- 登录页使用 `@supabase/supabase-js@2.57.4` UMD，需要确认正式部署前所有 Auth 回调流程与依赖兼容。`login.html` blob SHA：`1183791db8cfad73ff740e96e157785f49a679b3`。
- `app.html` 大小约 2.69 MB，GitHub 连接器本轮没有返回其正文，只返回 SHA `e4072fca7cc7a4096887be5feff9a78c92fb8346`。**本轮没有完成正式应用内权限、设备授权、交易/资产/习惯数据 RLS 的全量源码审查**。

## 已验证但仅适用于隔离测试的范围
- Staging 测试账户 A/B 的邮箱密码、Google OAuth PKCE、已绑定用户名密码均完成登录、原 UID / 专用 QA RLS、续期、退出和旧 JWT 对专用 QA 表拒绝。
- Staging 目前新函数 v6 已恢复 `CODE_GATE_OPEN=false` 与无效时间窗口，用户确认 `MMH_N10A3_ENABLED=false`；旧 N6/N9 保持关闭，User / Username Binding / QA Owner 数量为 2 / 2 / 2。
- 当前用户名服务只验证**已有账户 B 的绑定用户名**，没有验收无邮箱新注册、用户名并发抢注、忘记密码找回或正式财务业务数据。

## 正式集成前阻断项
1. 先确定是否需要“仅用户名无邮箱”注册、账户恢复、电子邮件绑定及去重算法。不能把已有账户用户名绑定测试当作新用户注册完成。
2. 保证所有登录方式复用对应 Auth UID；用户名并发冲突须拒绝，禁止账户 A/B 数据串用。
3. 服务端独立处理用户名映射、Turnstile Siteverify、原子限流和安全错误信息；浏览器端只放 publishable key，绝不能出现 service_role 或私有 Secret。
4. 接入时必须保留原 `getUser()/getSession()` 校验、OAuth PKCE、恢复密码及设备授权，而非单纯复制测试页面。
5. 单独审查正式数据库 Transactions、Accounts、Invest、Life Planner 私密内容的 RLS 与授权边界；QA 表的旧 JWT 被拒绝不证明全部生产 API 即时拒绝。
6. 保持高级深蓝黑金 Liquid Glass、中英双语、Safari/Chrome 移动端布局与原路由。先在独立预览回归，再设计回滚包。
7. 核实正式环境密码安全设置。此前 Staging Security Advisor 提醒泄露密码保护未开启，但正式环境尚未检查；不得把 Staging 状态推断成生产配置。

## 结论
**N10-A4 为初步只读审查，正式三登录集成仍 BLOCKED。** 必须获取主站大文件可解析版本和生产 RLS/设备授权架构的只读资料，完成迁移设计、负面测试、复原方案，明确获批后再实施。
