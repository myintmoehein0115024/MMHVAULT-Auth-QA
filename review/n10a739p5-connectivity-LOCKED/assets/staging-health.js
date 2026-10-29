'use strict';
/* N10-A7.39-P5: Noncredential-only Staging preflight, no auto-start, no authentication. */
(() => {
  const REAL_AUTH_ENABLED = false;
  const STAGING_WRITES_ALLOWED = false;
  const TURNSTILE_ACTIONS_ENABLED = false;
  const REQUIRED_ORIGIN = 'https://mmhvault-auth-g10g11-locked.pages.dev';
  const STAGING_EDGE = 'https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username';
  const button = document.getElementById('check');
  const status = document.getElementById('status');
  let busy = false;
  function setState(state, text) {
    status.dataset.state = state;
    status.className = 'status ' + state;
    status.textContent = text;
  }
  if (REAL_AUTH_ENABLED || STAGING_WRITES_ALLOWED || TURNSTILE_ACTIONS_ENABLED ||
      location.origin !== REQUIRED_ORIGIN || !window.isSecureContext) {
    button.disabled = true;
    setState('blocked', '安全限制：当前环境不允许连接 Staging。');
    return;
  }
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    setState('checking', '正在检查 Staging 的关闭状态……');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 9000);
    try {
      const response = await fetch(STAGING_EDGE, {
        method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer', cache: 'no-store',
        headers: {'Content-Type': 'application/json'},
        body: '{"action":"preflight"}', signal: abort.signal
      });
      if (!response.ok) {
        setState('blocked', '预检未通过。不能证明服务器仍关闭，请停止测试。');
        return;
      }
      const data = await response.json();
      if (data?.code === 'preflight_ok' && data?.scope === 'isolated_staging_only' &&
          data?.enabled === false && data?.registration_enabled === false) {
        setState('closed', '安全关闭：Staging 可连接，真实登录与注册仍禁用。G10/G11 未运行。');
      } else {
        setState('blocked', '警告：服务器没有明确报告关闭状态，立即停止后续操作。');
      }
    } catch {
      setState('blocked', '网络或浏览器安全检查失败。请勿把它视为登录成功。');
    } finally {
      clearTimeout(timeout);
      busy = false;
      button.disabled = false;
    }
  });
})();