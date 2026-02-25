// =========================================================================
//  BACKEND — User Info Sanitization
// =========================================================================
//  Before ANY user data is returned to the frontend, it passes through
//  this function. Fields that must never leave the server are stripped out.
// =========================================================================

/**
 * Sanitize the raw Uber user-info response so it is safe to send to the browser.
 *
 * KEPT  (safe to display):
 *   - first name, last name, full name
 *   - email
 *   - profile picture URL
 *   - locale
 *
 * REMOVED (must stay on the server):
 *   - sub           → encrypted user UUID (OIDC standard claim)
 *   - uuid          → Uber-specific user UUID
 *   - rider_id      → Uber rider identifier
 *   - mobile / phone → PII
 *   - any token-related fields
 */
function sanitizeUserInfo(raw) {
  const safe = {};

  if (raw.first_name)   safe.firstName = raw.first_name;
  if (raw.last_name)    safe.lastName  = raw.last_name;
  if (raw.given_name)   safe.firstName = safe.firstName || raw.given_name;
  if (raw.family_name)  safe.lastName  = safe.lastName  || raw.family_name;
  if (raw.name)         safe.name      = raw.name;
  if (raw.email)        safe.email     = raw.email;
  if (raw.picture)      safe.picture   = raw.picture;
  if (raw.locale)       safe.locale    = raw.locale;

  return safe;
}

module.exports = { sanitizeUserInfo };
