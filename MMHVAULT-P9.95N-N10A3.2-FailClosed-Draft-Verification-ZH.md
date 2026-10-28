# MMHVAULT · P9.95N-N10-A3.2 新用户名登录函数代码审查草案

**日期：2026-10-28**  
**状态：仅在 Auth QA 仓库保存源码，不是已部署 Edge Function、不是可使用的登录服务。**

## 新文件
- `staging-review/n10a3-username-login/index.ts`（约 9.3 KB；纯源码审查稿）。
- 代码中 `CODE_GATE_OPEN = false`，使用独立环境开关 `MMH_N10A3_ENABLED`，所以即使有人误部署源文件，用户名 `login` 也返回 503。
- 只指向 Staging 项目 `ldivswlhtgmznzwhzsoi` 的账户 B，未向生产项目提交任何修改。

## 相对于旧 N6 的修补
1. 首先调用原子配额 RPC，按固定 **global** 桶和规范化 **username** 桶双重限流；生产环境仍需进一步实施可信 IP / 风险分析。
2. Turnstile token 必须在服务端 Siteverify 成功且匹配固定 hostname/action。
3. 后台查询用户名映射需落在原 UID，邮箱已经验证且非匿名。
4. 用原生 Supabase Auth 进行密码登录，再由 `/auth/v1/user` 与专用 QA RLS 同时校验。
5. 只有通过 UID 与 RLS 后才给客户端返回原生 access/refresh token；失败时 `finally` 尝试撤销已经签发的令牌。
6. 统一响应不把 Secret Key、管理员凭据、明文密码或验证码回显，响应头标明 no-store。跨来源检查是浏览器约束，不当作实际身份验证。

## 已完成的本地等效请求模拟（使用虚构数据，未请求真实服务器）

**第一组：即使把环境变量模拟为“已开启”，只要代码开关仍为 false：**

| 测试 | 预期 | 结果 |
|---|---|---|
| 非授权 Origin | 403 | PASS |
| GET 非法方法 | 405 | PASS |
| 非 JSON 请求 | 415 | PASS |
| preflight | 200；enabled=false | PASS |
| login | 503；staging_n10a3_disabled | PASS |
| 不支持的 action | 400 | PASS |
| 上述请求触发后台网络调用 | 0 次 | PASS |

**第二组：仅在内存中的模拟源码里临时替换代码开关，不写回仓库：**

| 测试 | 预期 | 结果 |
|---|---|---|
| 伪造正常 Staging Auth/RLS 应答 | 200 login_success；模拟 access/refresh 回传 | PASS |
| 伪造 QA RLS 不属于本用户 | 503；模拟撤销访问令牌 1 次 | PASS |
| 伪造全局限流已满 | 429；后续密码及 Siteverify 不执行 | PASS |

**特别注意：**第二组使用的是内存中改写后的模拟代码、虚构令牌、模拟的 Cloudflare/Supabase 网络结果。**没有真的解锁接口、没进行真实登录、没调用生产或 Staging 服务，也不能视为攻击/并发测试通过。**

## 下一阶段必须完成
- 再次检查代码对验证码失败、映射错误、Auth 不可用、RLS 断网、撤销失败、并发请求的处理。
- 新接口必须采用独立的测试窗口和独立 Secret，不能沿用旧 N6/N9 的开关或临时打开旧接口。
- 在 Staging 自有 QA 项目中执行负向测试后，才可设计一个**真正可控的新集成页面**。
- N10-A2 页面原有邮箱、Google 登录继续保持不变；现有 UID、RLS 仍需重新验收。
- 正式 MMHVAULT 的 Auth、安全顾问告警以及全量财务表 RLS 尚未验收，**生产三登录仍为 BLOCKED**。

## 审核状态
N10-A3.1 静态风险清单已提交。N10-A3.2 审查源码与两组 mock 验证通过；**部署、真实网络登录和完整安全回归尚未执行**。无需用户此刻修改任何 Supabase 配置。
