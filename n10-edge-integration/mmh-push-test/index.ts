// DRAFT — N10 conditional MFA review only. Not deployed.
import * as webpush from "jsr:@negrel/webpush@0.5.0";
import postgres from "npm:postgres@3.4.7";
import { evaluatePushMfa, parseVerifiedBearerClaims } from "./mfa-push.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function b64urlToBuffer(value: string): ArrayBuffer {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}
function bufferToB64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function vapidJwk(publicKey: string, privateKey: string) {
  const pub = new Uint8Array(b64urlToBuffer(publicKey));
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("Invalid VAPID public key");
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const d = new Uint8Array(b64urlToBuffer(privateKey));
  if (d.length !== 32) throw new Error("Invalid VAPID private key");
  return {
    publicKey: { kty: "EC", crv: "P-256", alg: "ES256", x: bufferToB64url(x), y: bufferToB64url(y), key_ops: ["verify"], ext: true },
    privateKey: { kty: "EC", crv: "P-256", alg: "ES256", x: bufferToB64url(x), y: bufferToB64url(y), d: bufferToB64url(d), key_ops: ["sign"], ext: true },
  };
}

async function authenticatedUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  let key = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!key) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      key = String(keys.default || "");
    } catch (_) {}
  }
  if (!key) throw new Error("Missing Supabase publishable key");
  const res = await fetch(url + "/auth/v1/user", {
    headers: { Authorization: auth, apikey: key },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? user : null;
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "POST required" }, 405);

    if (Deno.env.get("SUPABASE_URL") !== "https://ldivswlhtgmznzwhzsoi.supabase.co")
      return json({code:"QA_PROJECT_MISMATCH"},503);
    const user = await authenticatedUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    // N10 candidate: validate the bearer via Auth (above), then enforce enrolled
    // MFA against live server-owned factor state BEFORE privileged SQL access.
    // This file is review-only: do not deploy until signed-token staging tests pass.
    let mfaRequired: boolean;
    try {
      const factorState = await sql`
        select exists (
          select 1 from auth.mfa_factors
          where user_id=${user.id}::uuid and status::text='verified'
        ) as required
      `;
      if (typeof factorState?.[0]?.required !== "boolean") throw Error("factor_state_unavailable");
      mfaRequired = factorState[0].required;
    } catch (_) {
      return json({ code: "MFA_CHECK_UNAVAILABLE" }, 503);
    }
    // Decode claims ONLY after Auth has verified this exact bearer above.
    // The pure policy helper denies invalid/mismatched identities and enrolled AAL1.
    const jwtClaims = parseVerifiedBearerClaims(req.headers.get("Authorization") || "");
    const decision = evaluatePushMfa(mfaRequired, user.id, jwtClaims);
    if (decision === "unavailable") return json({ code: "MFA_CHECK_UNAVAILABLE" }, 503);
    if (decision === "required") return json({ code: "MFA_REQUIRED" }, 403);

    // QA ends after real candidate Auth, factor DB query and JWT gate.
    // No subscriptions, decrypted VAPID keys, message sends or updates.
    return json({code:"MFA_ALLOWED",qa_only:true,route:"push-test"});
    const body = await req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || "").trim();
    const lang = String(body?.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
    if (!endpoint || endpoint.length > 4096) return json({ error: "Invalid endpoint" }, 400);

    const subs = await sql`
      select id, endpoint, p256dh, auth
      from public.personal_push_subscriptions
      where user_id=${user.id}::uuid
        and endpoint=${endpoint}
        and enabled=true
      limit 1
    `;
    if (!subs.length) return json({ error: "This device is not registered for background alerts.", code: "NO_SUBSCRIPTION" }, 409);

    const [secretRow] = await sql`
      select
        max(case when name='mmh_push_vapid_public' then decrypted_secret end) as public_key,
        max(case when name='mmh_push_vapid_private' then decrypted_secret end) as private_key
      from vault.decrypted_secrets
      where name in ('mmh_push_vapid_public','mmh_push_vapid_private')
    `;
    if (!secretRow?.public_key || !secretRow?.private_key) return json({ error: "Push keys are not configured.", code: "PUSH_KEYS_MISSING" }, 503);

    const keys = vapidJwk(String(secretRow.public_key), String(secretRow.private_key));
    const vapidKeys = await webpush.importVapidKeys(keys, { extractable: false });
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: "https://myintmoehein0115024.github.io/MMHVAULT/",
      vapidKeys,
    });

    const row = subs[0];
    try {
      const subscriber = appServer.subscribe({
        endpoint: String(row.endpoint),
        keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
      });
      const url = "https://myintmoehein0115024.github.io/MMHVAULT/app.html?mmh_push_test=1";
      const title = lang === "zh" ? "MMHVAULT 后台提醒测试" : "MMHVAULT background alert test";
      const text = lang === "zh"
        ? "如果你看到这条通知，说明此设备的后台 Push 已经连接成功。"
        : "If you can see this notification, background Push is working on this device.";
      await subscriber.pushTextMessage(JSON.stringify({
        title,
        body: text,
        icon: "./images/icon-192.png",
        badge: "./images/icon-192.png",
        tag: "mmhvault-push-test",
        url,
        alert_id: "",
        target_page: "dashboard",
        severity: "info",
        app_badge: 1,
      }), { ttl: 120 });
      return json({ ok: true, sent: 1 });
    } catch (err) {
      const gone = err instanceof webpush.PushMessageError && err.isGone();
      if (gone) {
        await sql`update public.personal_push_subscriptions set enabled=false,updated_at=now() where id=${row.id}::uuid and user_id=${user.id}::uuid`;
      }
      const message = String(err instanceof Error ? err.message : err).slice(0, 500);
      return json({ error: message, code: gone ? "SUBSCRIPTION_GONE" : "PUSH_FAILED" }, gone ? 410 : 502);
    }
  },
};
