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
