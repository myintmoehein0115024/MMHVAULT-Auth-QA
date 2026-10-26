# MMHVAULT Auth QA · P9.91 Google 主动身份关联

仅将 index.html 和 README.md 放到隔离测试仓库 MMHVAULT-Auth-QA 根目录。
不修改正式 MMHVAULT；不需要上传本 ZIP 的安全报告。

## 先决条件
1. 隔离 Supabase Google Provider 已开启。
2. Authentication → Sign In / Providers → Allow manual linking 已开启并保存。
3. GitHub Pages 回调地址 `https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/` 已列入隔离 Supabase 的 Redirect URLs。
4. Google Cloud OAuth 测试用户已添加，回调网址指向隔离 Supabase。

## 页面步骤
1. 第 4 区登录 haochen05024，若绑定 TOTP 必须先完成第 6 区。
2. 第 15A 区核验 UID 与原有本人 QA 数据，获取 Google 关联 URL。
3. 点击新出现的 Google 授权链接（新标签页）。使用已列入 Test users 的 Google 账号授权。
4. 授权返回后切回**原标签页**，第 15B 区检查 Google 身份与原 UID。
5. 不要用普通 Google 登录来代替上述关联操作。

授权过程不在本页保存 JWT 或 Google 密钥；原标签页仅持有 RAM 中的原登录访问令牌。
第 15B 区通过不代表 Google 登录入口已经完成独立验收。

## 覆盖和回滚
覆盖独立 QA 仓库根目录 index.html、README.md；无删除项。
若发现回调或登录异常，从 P9.90 ZIP 恢复这两个文件。此次交付没有执行数据库迁移。
