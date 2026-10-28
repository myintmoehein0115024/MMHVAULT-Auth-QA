# MMHVAULT · P9.95N-N10-A3 三登录统一集成与安全验收计划

**日期：2026-10-28**  
**阶段性质：方案与只读接口审查；未开启旧接口、未部署新接口、未修改正式站点。**

## 一、N10-A2 的最新真实验收基线

- 邮箱账户 B：邮箱密码登录、原 UID 校验、专用 QA RLS 仅自己一条记录、会话续期、退出和旧 JWT 专用 QA 表拒绝测试均 PASS。
- Google 账户 A：OAuth PKCE、原 UID 校验、专用 QA RLS、会话续期、退出及旧 JWT 专用 QA 表拒绝测试均 PASS。
- 新 UI 的「用户名」页：用户截图显示 N9 接口安全关闭 PASS；UID/RLS/METHOD 保持未登录，不存在假登录。
- 旧 N9 独立用户名登录测试此前已在独立页面 PASS，但这不等于新的统一 N10-A2 页已完成三入口登录。
- Staging 的两个用户和两条用户名绑定没有被更改。
- N6 现有代码级关闭；N9 v4 现有代码级关闭（通过只读源代码核对）。
- 生产 MMHVAULT 尚未改动，**生产三登录上线没有通过验收**。

## 二、本阶段只读发现

- N9 Staging Edge Function 支持 `preflight` 和 `mmh_username_login`，已有 Turnstile Siteverify、随机盐参与的限流逻辑以及读取 Auth 身份的实现痕迹。它当前被 `N9_QA_WINDOW_OPEN=false` 代码级保护；**不能未经审查就打开或直接复用为长期生产接口**。
- N6 Staging 主要用于绑定/检查用户名；包含 Turnstile 校验和限流相关代码，同样默认关闭。
- 新 N10-A2 前端 JS 只请求 N9 的 `preflight`，实际登录分支只有邮箱和 Google PKCE。后续新第三入口必须新增受控测试，不得将 preflight 返回成功视为用户名已真实登录。

## 三、N10-A3 交付目标

**目标：**在仅连接隔离 Staging 的全新测试端点或经审查的安全调用路径中，使 Email、Google、Username 三个入口都能创建真实 Supabase Auth 会话，且绑定各自原 UID、数据归属不变。

**边界：**当前用户名模式是“已有 Supabase 邮箱身份的登录别名”，不是不需要邮箱的新账号注册。真正无邮箱注册属于独立 N10-B，不能混为一谈。

## 四、必须落实的安全不变量

1. 后端校验用户名唯一性、规范化、主体归属、密码有效性，不根据网页给的 UID 或 `user_metadata` 授权。
2. 只在服务端持有 Secret Key、Turnstile Secret、限流盐与高权限客户端；GitHub Pages 仅能拿到 public/publishable key。
3. Turnstile Siteverify 必须由服务端完成；一次性 token 使用、过期校验、来源与失败路径都要验证，不能仅靠页面出现绿色勾证明成功。
4. 用户名登录请求需抵御枚举、撞库、速率规避：同样错误信息、规范化 IP 信任链、用户/IP 组合限流、反并发重放和隐私保护日志。
5. 原 UID 必须由 `getUser()` 等可信 Auth 端点核验；登录后专用 QA RLS 只读自己一条，任何 A/B 混用判失败并销毁会话。
6. Refresh Token 轮换、显式退出、旧 JWT 针对专用 QA 表拒绝行为必须全部重新回归。
7. 禁止向生产项目写入 QA Redirect URL、QA 用户名表、QA Edge Function 或测试凭据；不修改任何正式财务数据。
8. N6/N9 旧接口保持锁定；如需进行真实用户名回归，另建独立、时间受限、默认关闭、可完全回滚的 Staging 测试端点，测试后代码级 fail-closed。
9. 不提供或使用永久登录开关；不直接将「已通过 QA」等同于生产上线许可。

## 五、具体开发验收序列（按顺序执行）

### A3.1 · 新接口设计评审（当前）
- 仅检查 N9/N6 Edge Function 源码，复核 CORS、Siteverify、限流策略、响应体、授权与日志脱敏。
- 列出可复用部分与必须重写部分，制定独立新 Staging 函数最小权限和回滚方案。
- 确认对 UID、用户名别名的验证不使用用户自报字段。

### A3.2 · 独立受控集成
- 实现第三个 Username + Password 的真实登录流程，在新 QA 页面中使用自己的测试用户 B，不影响现有邮箱/Google 分支。
- 将服务器回包与 Supabase 标准 access/refresh token 统一交给现有 UID+RLS 验证函数。
- 用清晰的禁用状态呈现窗口关闭时的真实行为，不绕过服务端 gate。

### A3.3 · 安全回归
- 正确用户名及密码、错误密码、重复用户名、Unicode/大小写规范化、无效 Turnstile、重放 token、服务不可达、限流等负向测试。
- UID 不变、数据仅本人、Refresh、Logout、旧 JWT 拒绝、退出后 UI 清空。
- 邮箱、Google 现有 PASS 不回退；用两个不同测试身份检查并发切换隔离。
- Mac Safari/Chrome、iPhone Safari、Android Chrome 验收，无控制台密钥泄漏或布局溢出。

### A3.4 · 关闭与记录
- 立即关闭独立 QA 接口，复核代码级 fail-closed 以及 Secrets 关闭策略。
- 保存中文报告、测试截图和回滚/生产缺口说明，不上传任何密码、Token 或 Secret。
- 若生产安全顾问剩余 WARN 或正式 RLS 未完整验收，继续阻止正式三登录上线。

## 六、当前决定与下一行动

**N10-A3.1 方案记录完成；未进入第三入口真实测试。** 下一步应逐段审核旧 N9/N6 代码中的限流、Siteverify、认证和日志，并在隔离 QA 仓库创建新接口说明及测试文件。整个过程中不得重新打开 N6/N9。
