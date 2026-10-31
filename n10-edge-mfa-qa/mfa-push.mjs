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
