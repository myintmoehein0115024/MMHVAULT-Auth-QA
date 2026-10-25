# MMHVAULT Auth QA · P9.70 (TEST ONLY)

**此包仅用于 `MMHVAULT-Auth-QA` 测试仓库，不得上传到正式 `MMHVAULT` 主站。**

## 更新

- 用户名：长度 **4–20**，沿用原规则：以英文小写字母开头，后续使用英文小写字母、数字或下划线。新用户名最多 20 个字符；现有 `qa_test_2026` 不用修改。
- 新注册密码：**6–20 个字符**。允许用户自选内容，不做自动截断。密码将通过 HTTPS 发送到隔离 Supabase，绝不写入 GitHub。
- 已有账号登录继续接受旧的较长密码，不要求修改旧测试账号的密码。
- 新账户恢复码在注册成功后**默认隐藏**，由用户主动显示，再妥善保存。不要把恢复码发送给聊天、放进截图或上传到 GitHub。
- 修订版与测试项目 `louxgfaqwajihtadznbw` 的 Edge Function v15、数据库约束保持一致。

## 使用方法（无需 Mac Terminal）

1. 登录 GitHub，在您的测试仓库 `MMHVAULT-Auth-QA` 进入 Code 页面。
2. 进入 **Add file → Upload files**，上传 ZIP 内 `MMHVAULT-Auth-QA/` 文件夹里的 **index.html、README.md** 两个文件到仓库根目录。
3. 遇到覆盖提示时，确认覆盖当前测试仓库的 `index.html` 和 `README.md`；**不要上传整个 ZIP**、不要新建 `MMHVAULT-Auth-QA/` 子目录。
4. 提交到 `main`，刷新 https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/ ，检查顶部 P9.70 标识。
5. 点击「检查注册和登录状态」，然后在测试环境验证 6 位新密码注册（使用不重复的新用户名和真实 Turnstile）。

## 必须注意

- 该密码长度是**用户明确要求的隔离测试规则**。Supabase 官方建议密码至少 8 位，正式金融网站建议至少 12 位并支持密码管理器。6 位密码风险高，不能因为能注册就认定适合生产环境。
- Supabase Auth 如果另行配置了更高的最短密码长度，服务端仍会拒绝不足要求的密码。无法只靠 GitHub Pages 网页修改 Auth 设置。
- 首次更新不用删除账号，无需重新设置 Turnstile Secret，也不用修改正式站。
- 前次泄露的八枚 `qa_test_2026` 恢复码已在测试数据库标记为已使用，不可再作为恢复凭证；恢复 API 仍关闭。
- GitHub Pages 公开托管本网页，只包含可公开的 publishable key；**绝不要上传 Service Role Key、Turnstile Secret、真实密码或 JWT**。

## 变更清单与回滚

- **覆盖**：`index.html`、`README.md`（仅测试仓库根目录）
- **新增**：无
- **删除**：无
- **前端回滚**：可在 GitHub 的 `index.html` File history 恢复 P9.68 版本，但该版本不兼容新注册规则，应配合服务端检查。
- **后台范围**：仅隔离 Supabase 的 Edge Function v15 和用户名约束；恢复到旧服务端规则需在独立测试项目重新部署经验证的旧代码并恢复原 username CHECK；不能仅靠覆盖前端 ZIP 回滚。
- **生产**：正式 MMHVAULT GitHub / Supabase 完全不属于本上传包。
