# MMHVAULT · P9.95N-N10-A 正式认证集成差距审查报告

**审查日期：2026-10-28**  
**性质：只读、未改动正式网站、未执行生产 SQL 变更、未接入新登录服务。**  
**状态：架构审查完成；正式集成未获上线验收。**

## 一、证据与审查边界

- 正式 GitHub 仓库：`myintmoehein0115024/MMHVAULT`，分支 `main`。
- 当前 `app.html` Git blob：`e4072fca7cc7a4096887be5feff9a78c92fb8346`；`login.html` Git blob：`1183791db8cfad73ff740e96e157785f49a679b3`。
- 两者均与 2026-10-26 提供的完整 `MMHVAULT-main` 源码备份中的 Git blob 完全一致，因此审查包含完整、当前的这两个关键文件。
- 正式代码指向生产 Supabase 项目 `vrypucmyrztxgiqhjspd`；N6–N9 Staging 指向隔离项目 `ldivswlhtgmznzwhzsoi`，不得直接混用表、函数或密钥。
- 仓库中的其余文件仅抽样审查，不能以此认定所有生产路由、业务库和会话均完成全站验收。
- **生产数据库表策略及具体 SECURITY DEFINER 函数授权清单未完成逐条核验**；本报告不宣称已验证生产 RLS。
- 本报告保留前阶段的 Staging 结论：N6/N9 具有代码级关闭保护，用户已报告 `MMH_P995N_ENABLED=false`；这不等于直接读取到了 Secret 的值。

## 二、已具备的正式功能：不应删除或重构

1. `login.html` 已具备 Email/Password 登录、Email 注册、Google OAuth 登录、邮箱密码恢复和密码更新（约 339–398 行）。
2. 登录后会调用 `auth.getUser()` 验证服务器身份，并与当前 `getSession()` 的 UID 比较后重定向，而非只依靠 URL 参数（约 317–331 行）。
3. 恢复页面仅在 `PASSWORD_RECOVERY` 事件后启用密码更新；更新前再次核对 `getSession` 和 `getUser`（约 295–310、370–397 行）。
4. `app.html` 会在 Auth 身份切换时立即遮罩旧账户页面，校验新 UID 后重新载入云数据，并执行重登/数据生命周期清理（约 12864–12919、14171–14235 行）。
5. `app.html` 已有用户密码修改、其他设备退出、所有设备退出等功能，不能用测试文件直接覆盖现有正式实现（约 16673–16757 行）。

## 三、差距清单（按优先级）

| 编号 | 优先级 | 已验证现象 / 差距 | 处理要求 |
|---|---|---|---|
| A-01 | **上线阻断** | 正式 `login.html` 仅有 Email、Google 入口；N6–N9 Username 代码未接入生产项目；主站 `app.html` 亦有遗留 Email 密码认证路径 | 设计唯一入口及兼容层，在隔离的部署副本先验证，不能复制 Staging project URL 或 Secret 到生产前端 |
| A-02 | **上线阻断** | 生产 Supabase Security Advisor 报告 `authenticated_security_definer_function_executable`（WARN） | 逐个检查数据库函数的权限边界、所有者检查、EXECUTE 授权和调用方；无需执行的函数撤销对应访问，确认前禁止扩大认证入口 |
| A-03 | **高** | 生产 Security Advisor 报告 `auth_leaked_password_protection`（WARN） | 核查 Auth 密码安全设置及项目套餐支持情况；可用时启用泄露密码拦截，并做旧用户兼容回归 |
| A-04 | **高** | 正式密码长度验证不一致：`login.html` 注册最低 6、恢复最低 10；`app.html` 设置页修改密码最低 8（代码行约 165、375、16718） | 决定统一的前端、后端策略和错误提示。金融网站建议至少 8 位；当前 6–20 需求需在安全基线下再审阅，不仅改占位文案 |
| A-05 | **高** | `login.html` 存在已勾选的“Remember me”，但没有找到与其状态相连的 JS；Supabase `createClient` 采用默认会话持久化 | 修复选框承诺与实际会话保留行为不一致的问题，或移除不起作用的复选框；全设备/本地退出行为需实测 |
| A-06 | **高** | `app.html` 设置页只有身份提供商列表包含 `email` 时才显示改密码表单；Google-only 及 Google 已有密码但身份列表只含 Google 的账号可能看不到操作入口 | 用明确授权流程处理 Google-only 用户的密码设置/关联，不以 UI 隐藏取代权限验证 |
| A-07 | **高** | N6–N9 验收验证的是 Staging 的 QA 表，不能代表生产 `transactions`、`budgets`、`investments`、`financial_goals` 等的 RLS | 在生产等价的隔离数据副本进行两用户全业务表越权、错误 UID、离线恢复、旧 JWT、刷新并发回归 |
| A-08 | **中** | 正式 `app.html` 包含旧 Auth/重置入口与专门 `login.html` 路由并存的代码；需确认哪些可达 | 审查全部入口和回调路径；避免用户名登录只在一个页面可用，其他入口落回邮件登录 |
| A-09 | **中** | 当前已有用户的 Username 仅为别名映射；真正无邮箱的注册不是现有 N6–N9 的能力 | 明确分为 N10-A（已有账号别名登录）与 N10-B（真实无邮箱注册及独立恢复体系），不得宣传为已上线 |
| A-10 | **中** | Staging 的旧 N6/N9 测试函数、测试回调文件仍存在，但已禁用 | 正式部署前建立回滚包、接口隔离策略、测试文件清单及生产公私密钥检查表 |

## 四、建议的增量实施顺序（不在本次审查中执行）

### N10-A1 · 安全阻断项确认
- 在生产项目只读识别 Security Advisor 指出的具体 `SECURITY DEFINER` 函数，分析 EXECUTE 授权、搜索路径、行级权限、服务端调用方和权限提升风险；未经确认不改变函数属性或删除任何业务函数。
- 核查密码泄露保护、Auth 最小长度、邮件/Google 提供商与重定向域名配置。
- 梳理 `login.html`、`app.html` 旧登录表单及其他入口的可达性；制作完整回滚清单。

### N10-A2 · 隔离副本集成
- 在新 QA 页面或独立测试分支实现 Username 登录 UI，延续 Premium Liquid Glass 与中英双语。
- 只引用**经过审核的可信服务端 API**；不把用户名映射直接暴露为公开枚举查询；采用非枚举错误消息、Siteverify、防暴力破解、原 UID 复核。
- 恢复邮件、Google OAuth、用户名和密码修改均应回到原 UID；身份验证与授权由服务端和 RLS 决定，不能信任客户端 user_metadata。

### N10-A3 · 全量回归与上线门槛
- 新旧两账号的注册/登录/退出、恢复、设备撤销和并发切换测试；
- 所有财务及 Life Planner 表的所有者隔离；所有资产统计必须无重复、无串账；
- iOS Safari、Android Chrome、Mac Safari、桌面 Chrome 登录与回调兼容；
- 通过安全审查、生产快照备份与一键回滚验证后，再安排小范围生产启用。

## 五、禁止事项

- 不直接把 Staging 的 Supabase 地址、Service Role Secret 或 Turnstile Secret 复制进正式 GitHub Pages 前端。
- 不使用“相同邮件、相似用户名或相同设备”自动合并财务账号。
- 不删除生产 Auth 用户、交易或账户，不直接重建用户 UID。
- 不在未审计具体函数前盲目调整生产 SECURITY DEFINER 或 RLS 策略。
- 不因 N6–N9 的 QA PASS 就宣称生产所有表可安全上线。

## 六、审查结论

**N10-A 的静态差距分析已完成，但生产上线闸门目前不通过（BLOCKED）。**  
下一步应先修复/确认 **A-02 安全函数授权** 与 **A-03 密码泄露保护设置**，再将 N6–N9 的已测认证逻辑移入隔离的正式 UI 副本。当前没有做任何生产变更。

## 七、官方参考

- Supabase Auth Password: https://supabase.com/docs/guides/auth/passwords
- Supabase Auth Password Security: https://supabase.com/docs/guides/auth/password-security
- Supabase Users and Identities: https://supabase.com/docs/guides/auth/users
- Supabase Database RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
