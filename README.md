# MMHVAULT Auth QA — P9.81 用户名账号恢复码与会话保护

版本：P9.81 | 目标：隔离测试仓库 MMHVAULT-Auth-QA | 正式 MMHVAULT：不得上传

## 本次变更
- **覆盖文件：仓库根目录 `index.html`**（保留原 1–10 区，新增第 11 区）
- **新增或覆盖：仓库根目录 `README.md`**（本文）
- **新增（可选）：`P9.81-中文安全报告.md`**
- **删除清单：无**
- Supabase 已直接部署隔离项目：auth.users 密码变更触发器 `mmh_p981_password_session_floor`；新恢复码 claim、finalize、rotate 函数及锁定表；Edge Function `mmhvault-username-recovery-qa` v1。上传 GitHub 只需文件，不需要执行 SQL。
- 原有 `mmhvault-username-auth` v16、`mmhvault-email-qa` v2 保留，不更换。

## 上传方式（无需 Mac Terminal）
1. 解压此 ZIP，进入内部的 `MMHVAULT-Auth-QA` 文件夹。
2. 打开 https://github.com/myintmoehein0115024/MMHVAULT-Auth-QA 。
3. 点击 Add file → Upload files，将 `index.html` 与 `README.md` 上传至仓库根目录，覆盖旧文件（不要把外层目录作为额外子目录上传）。
4. 打开 https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/?v=P981 ，确认顶端显示 P9.81。
5. 滚动到 11 区，先点击“检查恢复服务状态”。

## 第一轮真实测试（先不要修改密码）
1. 在第 4 区用之前的 `qa_test_2026` 测试账号登录。
2. 进入第 11A 区输入该测试账号的当前密码，点击“验证身份并轮换 8 枚恢复码”。
3. 只有服务器返回“已轮换成功”，才继续操作：手动点显示新恢复码，保存到自己的密码管理器；不要截图、不要发给 ChatGPT、不要保存到 GitHub。然后点击“已保存，隐藏并清除”。
4. 将第 11A 区的非敏感成功/失败文字截图给助手。

## 第二轮测试（只有您明确准备改测试密码时进行）
1. 在第 2 区完成 Cloudflare Turnstile。
2. 使用您自己刚保存的一枚恢复码，在 11B 填测试用户名和一个全新的 6–20 字符密码。
3. 成功后新密码生效，原 8 枚恢复码全部被新 8 枚代替。您必须保存新码，然后用新密码重新登录。旧会话应被 QA 数据门禁拒绝。
4. 有 TOTP 的账号仍需继续通过 TOTP，恢复码不能取消二次验证。
5. 测试全程不要发任何密码、动态码、完整 JWT、恢复码或 Secret。

## 风险与回滚
- 浏览器真实恢复码兑换尚未验收；目前为 QA 测试，不是正式上线安全认证。
- 恢复码兑换或密码更新途中异常可能消耗一枚旧码。若服务器已经更改密码而轮换失败，请使用新密码登录，再用 11A 更新恢复码。
- 新“会话时间门槛”仅保护接入 `mmh_p975_private.session_eligible_for_owner_data()` 的 QA 表。它不保证其他 Supabase API 立即拒绝已签发的 JWT。
- 严禁在正式项目执行 SQL。要紧急禁用恢复接口，可在隔离项目中收回 `service_role` 对 `mmh_p981_*` 三个函数的 EXECUTE 权限（将使新接口拒绝恢复/轮换，但不影响旧用户名登录）；详细审查见附报告。
- 若只回滚界面：将 GitHub 仓库根目录 `index.html` 恢复为 P9.77 版本；后台新函数不会因此删除。
- 若需回滚数据库触发器，应先审查影响，优先从隔离项目移除 `auth.users` 上的 `mmh_p981_password_session_floor` 触发器。不要删除 P9.80 原有会话门禁或历史账号记录。
