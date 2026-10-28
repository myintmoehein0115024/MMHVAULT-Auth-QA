/**
 * MMHVAULT · P9.95N-N10-A3.6 — TIME-BOUND STAGING SECURITY REVIEW.
 * Deploy is allowed only with the hardcoded login gate CLOSED.
 * Staging B-only demonstration; N6/N9 are not modified.
 * Test gate is intentionally hard-coded CLOSED; expiry must be explicitly reviewed.
 */
const PROJECT = "ldivswlhtgmznzwhzsoi";
const BASE = Deno.env.get("SUPABASE_URL") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TURNSTILE = Deno.env.get("MMH_P995N_TURNSTILE_SECRET") || "";
const SALT = Deno.env.get("MMH_P995N_RATE_SALT") || "";
const SECRET_ENABLED = Deno.env.get("MMH_N10A3_ENABLED") === "true";
const CODE_GATE_OPEN = false; // fail closed: do NOT set true during routine deployment
const WINDOW_START_UTC = "1970-01-01T00:00:00.000Z"; // inert in v2
const WINDOW_END_UTC = "1970-01-01T00:00:00.000Z"; // inert in v2
const MAX_WINDOW_MS = 15 * 60 * 1000; // one short, reviewed staging QA window
const ORIGIN = "https://myintmoehein0115024.github.io";
const HOST = "myintmoehein0115024.github.io";
const UID_B = "72a8d120-e4d4-4c49-89df-02b85c89cffc";
const NAME_B = "myintmoehein0115024";
const NAME_RE = /^[a-z][a-z0-9_]{3,19}$/;
const CONFIGURED = BASE === "https://" + PROJECT + ".supabase.co" &&
  ANON.length > 20 && SERVICE.length > 20 && TURNSTILE.length > 12 &&
  SALT.length >= 32;
function withinWindow(now = Date.now()) {
  const start = Date.parse(WINDOW_START_UTC);
  const end = Date.parse(WINDOW_END_UTC);
  return Number.isFinite(start) && Number.isFinite(end) &&
    end > start && end - start <= MAX_WINDOW_MS &&
    now >= start && now < end;
}
function loginReady() {
  // Re-evaluate on EVERY request, including after asynchronous verification:
  // long-lived Edge instances must not preserve a stale "enabled" constant.
  return CODE_GATE_OPEN && SECRET_ENABLED && CONFIGURED && withinWindow();
}

function headers(origin) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private, max-age=0",
    "X-Robots-Tag": "noindex, nofollow",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    ...(origin === ORIGIN
      ? {
          "Access-Control-Allow-Origin": ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "apikey,content-type,authorization",
          "Access-Control-Max-Age": "120",
        }
      : {}),
  };
}
function respond(origin, status, code, extra = {}) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, code, ...extra }),
    { status, headers: headers(origin) });
}
function adminHeaders() {
  return { apikey: SERVICE, Authorization: "Bearer " + SERVICE,
    Accept: "application/json", "Content-Type": "application/json" };
}
function publicHeaders(access) {
  return { apikey: ANON, ...(access ? { Authorization: "Bearer " + access } : {}),
    Accept: "application/json" };
}
async function readJson(response) {
  return response.json().catch(() => null);
}
async function keyHash(label) {
  const data = new TextEncoder().encode(SALT + ":n10a3:" + label);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function spendQuota(label, limit, windowSeconds) {
  const r = await fetch(BASE + "/rest/v1/rpc/mmh_p995j_take_attempt", {
    method: "POST", headers: adminHeaders(), cache: "no-store",
    body: JSON.stringify({ p_key: await keyHash(label),
      p_limit: limit, p_window_seconds: windowSeconds }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw Error("quota_unavailable");
  const value = await readJson(r);
  if (typeof value !== "boolean") throw Error("quota_unavailable");
  return value;
}
async function verifyCaptcha(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 2048) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: TURNSTILE, response: token }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw Error("siteverify_unavailable");
  const result = await readJson(r);
  // The token is single-use; Cloudflare enforces one-time validation.
  return result?.success === true &&
    result?.hostname === HOST && result?.action === "mmh_username_login";
}
async function verifiedMapping(name) {
  const r = await fetch(BASE +
    "/rest/v1/mmh_p995i_username_links?select=user_id&username=eq." +
    encodeURIComponent(name) + "&limit=2",
    { headers: adminHeaders(), cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Error("mapping_unavailable");
  const rows = await readJson(r);
  return Array.isArray(rows) && rows.length === 1 && rows[0]?.user_id === UID_B;
}
async function verifiedAccount() {
  const r = await fetch(BASE + "/auth/v1/admin/users/" + UID_B, {
    headers: adminHeaders(), cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw Error("account_unavailable");
  const u = await readJson(r);
  if (u?.id !== UID_B || typeof u?.email !== "string" ||
    !u?.email_confirmed_at || u?.is_anonymous === true) return null;
  return u.email;
}
async function authenticate(email, password) {
  const r = await fetch(BASE + "/auth/v1/token?grant_type=password", {
    method: "POST", cache: "no-store",
    headers: { ...publicHeaders(null), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const value = await readJson(r);
  return typeof value?.access_token === "string" &&
    typeof value?.refresh_token === "string" ? value : null;
}
async function verifyIssued(tokens) {
  const access = tokens.access_token;
  const u = await fetch(BASE + "/auth/v1/user", {
    headers: publicHeaders(access), cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!u.ok || (await readJson(u))?.id !== UID_B) return false;
  const rr = await fetch(BASE +
    "/rest/v1/mmh_p995k_session_protected_qa?select=user_id,fixture_name", {
      headers: publicHeaders(access), cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  const rows = await readJson(rr);
  return rr.ok && Array.isArray(rows) && rows.length === 1 &&
    rows[0]?.user_id === UID_B && rows[0]?.fixture_name === "P995K_OWNER_ONLY";
}
async function revoke(access) {
  if (!access) return false;
  try {
    const r = await fetch(BASE + "/auth/v1/logout?scope=local", {
      method: "POST", headers: publicHeaders(access),
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, {
    status: 204, headers: headers(origin),
  });
  if (origin !== ORIGIN) return respond(origin, 403, "origin_not_allowed");
  if (request.method !== "POST") return respond(origin, 405, "method_not_allowed");
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json"))
    return respond(origin, 415, "json_required");
  let data;
  try {
    const raw = await request.text();
    if (raw.length > 3000) return respond(origin, 413, "payload_too_large");
    data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("json");
  } catch { return respond(origin, 400, "bad_json"); }
  if (data.action === "preflight")
    return respond(origin, 200, "preflight_ok",
      { configured: CONFIGURED, enabled: loginReady(), scope: "staging_account_b_only" });
  if (data.action !== "login") return respond(origin, 400, "unsupported_action");
  // This must be checked before any password/identity validation.
  if (!loginReady()) return respond(origin, 503, "staging_n10a3_disabled");

  const name = typeof data.username === "string" ? data.username.trim().toLowerCase() : "";
  const password = data.password;
  if (!NAME_RE.test(name) || typeof password !== "string" ||
    password.length < 6 || password.length > 256)
    return respond(origin, 401, "invalid_credentials");
  let issued = null;
  let handedOff = false;
  try {
    // Atomic, private RPC, inaccessible to anon/authenticated.
    if (!await spendQuota("global", 60, 900)) return respond(origin, 429, "too_many_attempts");
    if (!await spendQuota("username:" + name, 8, 900))
      return respond(origin, 429, "too_many_attempts");
    if (!await verifyCaptcha(data.captcha_token))
      return respond(origin, 403, "verification_required");
    if (name !== NAME_B || !await verifiedMapping(name))
      return respond(origin, 401, "invalid_credentials");
    const email = await verifiedAccount();
    if (!email) return respond(origin, 401, "invalid_credentials");
    issued = await authenticate(email, password);
    if (!issued) return respond(origin, 401, "invalid_credentials");
    if (!await verifyIssued(issued))
      return respond(origin, 503, "qa_owner_check_failed");
    // A window may expire while Cloudflare, Auth and RLS calls are in flight.
    // This second check ensures no token is handed off after expiry.
    if (!loginReady()) return respond(origin, 503, "staging_window_closed");
    // Access and refresh tokens are returned to the authenticated QA browser
    // only after UID and RLS verification; the client keeps them in memory.
    const response = respond(origin, 200, "login_success", {
      access_token: issued.access_token,
      refresh_token: issued.refresh_token,
      token_type: "bearer",
      expires_in: issued.expires_in,
    });
    handedOff = true;
    return response;
  } catch {
    return respond(origin, 503, "staging_auth_unavailable");
  } finally {
    // Any failed validation after issuing a token must revoke the proof session.
    if (issued?.access_token && !handedOff) await revoke(issued.access_token);
  }
});