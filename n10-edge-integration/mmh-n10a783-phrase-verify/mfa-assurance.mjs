// N10 MFA assurance evaluator — review-only Edge candidate; NOT deployed.
// Invoke only after Supabase Auth verifies the provided access token.
// Supabase's JWT-aware MFA API returns a nextLevel based on verified factors.
// The current level may be null for older signed tokens; nextLevel MUST be known.
export function evaluateMfaAssurance(assurance, authHasVerifiedFactor = false) {
  if (!assurance || typeof assurance !== "object") return "unavailable";
  const { currentLevel, nextLevel } = assurance;
  if (currentLevel !== null && currentLevel !== "aal1" && currentLevel !== "aal2")
    return "unavailable";
  // Missing, unknown or null nextLevel is NOT proof there is no MFA.
  if (nextLevel !== "aal1" && nextLevel !== "aal2") return "unavailable";

  // Auth's verified-factor list is a defense-in-depth cross-check when present.
  if (authHasVerifiedFactor === true && nextLevel !== "aal2") return "unavailable";
  if (nextLevel === "aal2") {
    return currentLevel === "aal2" ? "allowed" : "required";
  }
  // Either un-enrolled AAL1 or an old signed AAL2 JWT after unenrollment.
  return "allowed";
}


/**
 * Only call AFTER /auth/v1/user or auth.getUser(jwt) has validated this
 * exact JWT. JWT payload decoding here is NOT signature verification.
 * Factors are from that Auth-validated user, not client-supplied metadata.
 * The separate SDK assurance API may report missing/stale nextLevel in
 * Edge/no-persist sessions; never use that as the source of enrollment truth.
 */
export function evaluateVerifiedAuthUserMfa(jwt, verifiedUser, supabaseBase) {
  if (typeof jwt !== "string" || jwt.length > 8192 ||
      typeof verifiedUser?.id !== "string" ||
      verifiedUser.is_anonymous === true ||
      !Array.isArray(verifiedUser.factors) ||
      typeof supabaseBase !== "string") return "unavailable";
  const segments = jwt.split(".");
  if (segments.length !== 3 || !segments[1] || segments[1].length > 8192)
    return "unavailable";
  try {
    const input = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(input + "=".repeat((4 - input.length % 4) % 4));
    const payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(raw, c => c.charCodeAt(0))
    ));
    if (!payload || typeof payload !== "object" ||
        payload.sub !== verifiedUser.id ||
        payload.iss !== supabaseBase.replace(/\/$/, "") + "/auth/v1" ||
        !Number.isSafeInteger(payload.exp) ||
        payload.exp <= Math.floor(Date.now() / 1000)) return "unavailable";
    const current = payload.aal == null ? "aal1" : payload.aal;
    if (current !== "aal1" && current !== "aal2") return "unavailable";
    const hasVerified = verifiedUser.factors.some(
      f => f?.status === "verified"
    );
    return evaluateMfaAssurance({
      currentLevel: current,
      nextLevel: hasVerified ? "aal2" : "aal1"
    }, hasVerified);
  } catch (_) {
    return "unavailable";
  }
}
