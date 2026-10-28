# MMHVAULT P9.95N-N10-A1：正式 Supabase 高权限函数与密码安全只读核查

**核查日期：2026-10-28**  
**环境：正式 MMHVAULT Supabase 项目 vrypucmyrztxgiqhjspd（只读）；认证 Staging 与正式项目隔离。**  
**工作边界：仅查询元信息、函数定义和 RLS 策略；无数据修改、无迁移、无业务函数调用、无用户身份冒用。**

## 1. 结论摘要

1. 当前生产 Supabase Security Advisor 报告两项 WARN：`authenticated_security_definer_function_executable` 和 `auth_leaked_password_protection`。
2. 正式数据库 `public` 模式有 10 个 `SECURITY DEFINER` 函数（包括 3 个用户创建触发器、1 个钱包交易删除 RPC、3 个客服保留/清理工具、2 个投资定时任务验证函数、1 个 RLS event trigger）。
3. 依据 `information_schema.routine_privileges` 的授权记录，**唯一发现授予 `authenticated` EXECUTE 的上述高权限函数是 `public.mmh_delete_crypto_wallet_movement_v4(uuid)`**。未发现这组函数给 `anon` 或 `PUBLIC` 的 EXECUTE 授权。其余定时/客服/触发器函数的授权列表未显示普通登录用户调用权。
4. 已读取钱包删除函数的正文，明确在定位钱包记录和删除相关投资/交易时应用 `auth.uid()` 与 `user_id` 一致性约束。**未发现明显的跨 UID 删除条件缺失**；但高权限函数属于特殊信任边界，静态检查不能代替恶意参数及并发回归。
5. `crypto_wallet_movements`、`investments`、`transactions` 的 RLS 均已启用；对应 SELECT/DELETE、INSERT 以及有需要的 UPDATE 策略，已核实有 `auth.uid() = user_id` 所有权条件。
6. Supabase 组织 `Statement001` 的套餐为 `free`。官方文档当前注明 **Leaked password protection 需要 Pro 或更高**；因此该 Advisor WARN 无法在 Free 套餐中简单开启。不得把未开启误称为已修复。
7. **当前放行结论：允许继续隔离测试和认证界面设计，生产认证上线闸门仍保持未放行（BLOCKED）**；本轮无生产改动。

## 2. 已识别的 10 个 SECURITY DEFINER 函数

| 函数 | 类型 | 观察到的授权 | 初步分类 |
|---|---|---|---|
| `handle_new_user_customer_id` | Auth 创建触发器 | postgres / service_role | 服务端触发器，不能直接给前端调用 |
| `handle_new_user_finance_defaults` | Auth 创建触发器 | postgres / service_role | 服务端触发器 |
| `handle_new_user_mmhvault` | Auth 创建触发器 | postgres / service_role | 服务端触发器 |
| `mmh_delete_crypto_wallet_movement_v4` | UUID 参数 / boolean 返回的 RPC | **authenticated** / postgres / service_role | **本轮重点**；有功能性 owner guard，仍待模拟攻击回归 |
| `mmh_support_cleanup_candidates` | JSON 返回的 SQL 函数 | postgres / service_role | 内部清理 |
| `mmh_support_cleanup_delete` | integer 返回的 SQL 函数 | postgres / service_role | 内部清理 |
| `mmh_validate_support_cleanup_token` | boolean 返回的 SQL 函数 | postgres / service_role | 内部验证 |
| `mmh_verify_invest_capture_token` | boolean 返回的 SQL 函数 | postgres / service_role | 内部定时任务验证 |
| `mmh_verify_invest_pnl_cron_token` | boolean 返回的 SQL 函数 | postgres / service_role | 内部定时任务验证 |
| `rls_auto_enable` | event trigger | 特殊数据库事件触发器 | 非正常面向客户端的 RPC |

**限制**：授权记录来源于 SQL 元信息，不代表已经从互联网以 anon/authenticated 身份进行调用测试。某些 schema/exposure/owner/默认权限需独立核查。

## 3. 钱包删除 RPC 的实际静态安全检查

- 名称：`public.mmh_delete_crypto_wallet_movement_v4(uuid)`，唯一传入参数 `p_id uuid`。
- 函数开始读取 `auth.uid()`，未登录（null）即报错。
- 查找 `crypto_wallet_movements` 时同时使用 `m.id = p_id` 与 `m.user_id = auth.uid()`，并用 `FOR UPDATE` 锁住匹配记录。
- 若找不到属于当前用户的记录则中止。
- 删除钱包 movement、相关投资及两类关联 transaction 时都再次附带目标行的 `user_id = auth.uid()` 条件。
- 查询语句引用了限定模式的 `public` 表；没有发现正文中使用动态 SQL 字符串拼接。
- 关联行和删除链条存在业务一致性、触发器与并发边界，仍需在隔离测试库验证“不属于自己的 ID”、重复请求、并发删除、关联行意外缺失、不影响资产余额。
- 当前客户端钱包删除功能可能依赖该 RPC；**不能直接撤销 `authenticated` 权限或盲改为 `SECURITY INVOKER`**，否则可能破坏既有删除和余额联动。

**建议（不执行）：**在拥有生产等价表/触发器、但完全使用伪造 QA 数据的独立环境先试验 `SECURITY INVOKER` 与 RLS 是否可满足业务需求；若仍需 DEFINER，保留函数中的 owner guard，审查函数 owner、`search_path` 固定、输入限制和所有副作用，并编写跨用户对抗测试。经过回归才决定迁移方式。

## 4. 已核实的三张业务表权限条件

- `crypto_wallet_movements`：SELECT、INSERT、DELETE 各自附带 `auth.uid() = user_id`。
- `investments`：SELECT、INSERT、UPDATE、DELETE 都有 owner guard，UPDATE 同时限制旧行与新行。
- `transactions`：SELECT、INSERT、UPDATE、DELETE 同样限制 owner，UPDATE 同时限制旧行与新行。
- 其他生产业务表虽然 `list_tables` 显示多数 RLS 已开启，但**本轮没有逐表读完所有 RLS 策略**，不能宣称全站隔离已审核。

## 5. 泄露密码保护与当前 Free 套餐

- 生产 Security Advisor：`auth_leaked_password_protection` = WARN / disabled。
- Supabase 组织查询：当前为 `free` 套餐。
- 官方密码文档指出泄露密码拦截功能只提供 Pro 及以上套餐：https://supabase.com/docs/guides/auth/password-security
- 套餐对照：https://supabase.com/pricing
- **因此这不是当前 Free 套餐下可一键修复的问题。** 不需要为继续 Staging 安全研发立刻升级付费计划，但不应忽视风险。
- 可采用弥补控制：最短密码至少 8 位（建议 12+ 强密码，配密码管理器）、尽可能开启 MFA、限制认证频次、错误消息不枚举账户、关键操作二次验证。正式密码政策不能只依据用户最初的 6–20 字符便利偏好来决定。

## 6. 下一阶段与生产变更闸门

### N10-A1.1 · 只读核对与测试准备
1. 在生产等价测试副本审查 `mmh_delete_crypto_wallet_movement_v4` 的 owner、`search_path` 与所有调用者；
2. 评估 `SECURITY INVOKER` 可用性，但先保留生产函数现状；
3. 使用完全无真实财务记录的 A/B 测试用户，尝试越权 ID、重入、并发、异常回滚和余额不变性；
4. 审查 Auth 登录限流、会话有效期、密码变更二次确认和 Google 与 Username 同 UID。

### N10-A2 · 独立前端集成
1. 从正式 `login.html` 的确切版本复制并增量加入用户名入口，保留现有 Email、Google、恢复与安全重定向。
2. 只接可信服务端、Siteverify、服务器限流和稳定 UID 映射，绝不在网页写入 service_role。
3. 测试用户名冲突、大小写、设备切换、会话并发、跨用户财务数据隔离。
4. 只有全部回归通过、正式权限变更方案审阅通过且具有回滚包后，才考虑生产上线。

## 7. 未做的操作（审计证据范围）

- 未升级 Supabase 套餐，未修改或重置任何密码。
- 未编辑或删除任何正式函数、表、RLS policy、Auth 用户、账单、交易或仓库生产源码。
- 未执行跨用户攻击测试；只进行了生产元信息只读审计。
- 未读取或发布任何 Secret Key、个人财务记录及客户资料。
- N6/N9 Staging 代码级关闭由上一阶段已复核；本轮未重新开启。
- 原 Production Security Advisor 的 WARN 在本次审查后仍是待处理项，不应将这份审计报告误认为风险已消除。

## 8. 官方参考

- https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/pricing
