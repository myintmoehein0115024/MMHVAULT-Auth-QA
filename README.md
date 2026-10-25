# MMHVAULT Auth QA · P9.68

> TEST ONLY / 仅供隔离测试。不要在这个公开仓库上传任何私密凭据、真实密码、JWT、恢复码或财务数据。

## 仓库名称 / Repository name

**MMHVAULT-Auth-QA**

## 预计 GitHub Pages 地址

https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/

注意：此地址必须在创建仓库、上传文件并开启 Pages 后才会生效。

## 使用 Mac 浏览器，无需 Terminal

1. 在 GitHub 创建一个新的仓库，Repository name 填入 `MMHVAULT-Auth-QA`，优先选择 `Public`（GitHub Free 的 Pages 使用公开仓库）。
2. 下载并解压 ZIP，打开内层 `MMHVAULT-Auth-QA/` 文件夹。
3. 在新建仓库的 `Add file` → `Upload files` 页面，把该文件夹里面的 `index.html`、`README.md` 上传到 **仓库根目录**。不要只上传 ZIP，勿再套一层文件夹。
4. 点击 `Commit changes` 保存。
5. 打开仓库 `Settings` → `Pages` → `Build and deployment` → `Source: Deploy from a branch`，设置 Branch `main` 和 `/(root)`，点击 `Save`。
6. 等待 GitHub 显示 `Visit site`，点击它或访问上述地址。
7. 网页打开后先点击“检查注册和登录状态”，并截图结果。此操作不需要密码、Sitekey 或 Mac Terminal。

**Cloudflare 真正的注册验收是后续阶段：** 需要专门用于测试的 Turnstile Widget，允许 Hostname `myintmoehein0115024.github.io`；服务端 Secret 只设置在隔离 Supabase 的 Secrets 页面，不写入 GitHub；请求 action 必须为 `mmhvault_register`。不要使用正式 MMHVAULT 密码。

## 架构约束

- 公开静态页面仅连接隔离测试 Supabase `louxgfaqwajihtadznbw`。
- 浏览器只使用 `sb_publishable_` 开头的公开 API key；不包含 Service Role Key。
- 登录凭据/令牌仅保存在本页内存，不写入 localStorage/sessionStorage。请不要提交或分享测试期间的恢复码。
- `status` 为只读诊断，不能证明真实注册/登录已通过。
- 注册、登录、Turnstile 和恢复操作以隔离 Supabase 服务端实际开关为准。
- 此站在 GitHub Pages 公开可访问，`noindex` 只是建议搜索引擎不索引，不等于访问控制。
- GitHub Pages 同账号下的仓库通常共用 `myintmoehein0115024.github.io` 来源；不要把不可信的 JavaScript 部署到同一账户下的其他 Pages 项目。

## 升级与回滚

只覆盖该测试仓库根目录的 `index.html`、`README.md`；无文件删除。若页面出现问题，可通过 GitHub 文件历史回滚两文件。不要向正式 `MMHVAULT` 仓库上传该 QA 文件。

生产 Supabase 项目 `vrypucmyrztxgiqhjspd` 不属于本测试包。
