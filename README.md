# MMHVAULT Auth QA · P9.90 安全检查页

## 上传
仅覆盖独立 GitHub 仓库 `MMHVAULT-Auth-QA` 根目录中的 `index.html`。不删除、移动其他文件。此包提供的 README 可选覆盖根目录 README。

地址：https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/?v=P990

## 验收
打开第 14 区，先点击「检查 Google QA 服务」，然后在第 4 区或 10B 区登录测试账号，返回点击「核验 Google 身份、用户名与 QA 数据」。

没有 Google 身份时应如实提示「当前账号尚未关联 Google」，不是失败。不会自动发起 Google 授权或创建新用户。

## 回滚
如需回滚网页，仅恢复 P9.87 包中的 index.html。后台新增的独立只读 Edge Function 不影响原有登录，可单独停用。没有进行生产数据库变更。

不要共享密码、JWT、Google OAuth 客户端密钥。
