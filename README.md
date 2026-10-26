# MMHVAULT Auth QA · P9.92 三种登录同 UID 验收

## 上传位置
本 ZIP 内的 `MMHVAULT-Auth-QA/index.html` 与 `MMHVAULT-Auth-QA/README.md` 上传到独立仓库 **MMHVAULT-Auth-QA 根目录**覆盖原文件。不要上传到正式 MMHVAULT 仓库。

## 浏览器测试（无需终端）
1. 打开 `https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/?v=P992`。
2. 第 4 区使用 `haochen05024` 与当前密码登录，若启用了 TOTP，请先完成第 6 区。
3. 到第 16A 区点击 `检查用户名登录与 UID`，确认绿色。
4. 到第 10B 区用原已验证邮箱＋**相同当前密码**重新登录。
5. 回到第 16B 区点击 `核对邮箱登录与原 UID`，确认同一 UID 及 QA 条数。
6. 点击第 16C `准备独立 Google 登录测试`，然后点击出现的黄色 `打开 Google 独立登录（新标签页）`。
7. 使用之前已关联的 Google 测试账号授权，回调的新标签页滚动到第 16C，检查 `Google OAuth 新会话验收通过` 的绿色文字。

## 安全说明
- 第 16C 走 GoTrue `/auth/v1/authorize`，**不携带现有用户的 Bearer**。这和 P9.91 `/auth/v1/user/identities/authorize` 主动身份关联是两回事。
- OAuth 回调的 access_token 立即从地址栏移除，仅用于新会话当次只读核验，不加入原用户名会话、也不写 localStorage/sessionStorage。
- 如果返回 `code` 而非 `access_token`，缺少对应 PKCE verifier 的页面会提示未通过，不会虚假显示成功。
- 目前验证的是隔离 QA 环境，正式 MMHVAULT 不修改。
- 请勿分享密码、Google OAuth 授权链接、JWT 或恢复码，也不要截图包含 token/code 的地址栏。

## 文件清单和回滚
覆盖：根目录 `index.html`、`README.md`。新增：无。删除：无。
回滚：从 P9.91 ZIP 恢复原 `index.html` 与 `README.md`。P9.92 只将 Google 身份只读审计接口从 v3 更新到 v4，用于返回当前已认证账号的用户名归属；不改账号、数据或 RLS。
