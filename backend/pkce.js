// =========================================================================
//  BACKEND — PKCE Helpers  (RFC 7636)
// =========================================================================
//  PKCE (Proof Key for Code Exchange) prevents authorization-code
//  interception attacks. All values are generated and verified on the
//  SERVER — the browser never sees the code_verifier.
//
//  Flow:
//    1. Server generates a random  `code_verifier`  (stored in the session)
//    2. Server derives              `code_challenge = BASE64URL(SHA256(verifier))`
//    3. code_challenge is sent to Uber's /authorize endpoint
//    4. On callback, the server sends `code_verifier` to Uber's /token endpoint
//    5. Uber hashes the verifier and checks it matches the original challenge
// =========================================================================

const crypto = require('crypto');

/**
 * Generate a cryptographically random code_verifier.
 * 64 random bytes → 86 base64url characters (within the 43–128 char spec).
 */
function generateCodeVerifier() {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Derive the S256 code_challenge from a verifier:
 *   code_challenge = BASE64URL( SHA256( code_verifier ) )
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate a random `state` string for CSRF protection.
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { generateCodeVerifier, generateCodeChallenge, generateState };
