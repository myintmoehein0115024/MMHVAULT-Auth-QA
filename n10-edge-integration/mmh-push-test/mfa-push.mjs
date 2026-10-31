// N10 Push Test: pure conditional-MFA decision after the SAME bearer JWT
// has been validated by /auth/v1/user; NOT an independent JWT verifier.
// Fail closed if factor state or JWT identity cannot be established.
// The verified-factor state must come from a trusted server-side query.
export function evaluatePushMfa(factorState, verifiedUserId, claims) {
  if (typeof factorState !== "boolean" || !verifiedUserId ||
      typeof verifiedUserId !== "string") return "unavailable";
  if (!claims || typeof claims !== "object" ||
      claims.sub !== verifiedUserId ||
      !claims.iss || typeof claims.iss !== "string" ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
    return "unavailable";
  }
  // The endpoint already validated this token against Auth; the JWT claims
  // are used ONLY to enforce the factor's assurance level, not trust client UID.
  if (factorState && claims.aal !== "aal2") return "required";
  return "allowed";
}

// Call ONLY after the SAME bearer token was verified by Supabase Auth /user.
// This parser does NOT verify JWT signatures; no trust should derive from it alone.
export function parseVerifiedBearerClaims(authHeader) {
  if (typeof authHeader !== "string") return null;
  const bearer = /^Bearer\s+(\S+)$/i.exec(authHeader.trim())?.[1];
  if (!bearer || bearer.length > 8192) return null;
  const parts = bearer.split(".");
  if (parts.length !== 3 || !parts[1] || parts[1].length > 8192) return null;
  try {
    const value = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(value + "=".repeat((4 - value.length % 4) % 4));
    const data = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(raw, char => char.charCodeAt(0))
    ));
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch (_) {
    return null;
  }
}
