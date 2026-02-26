// =========================================================================
//  BACKEND — Cryptographic Helpers
// =========================================================================
//  Utility functions for generating cryptographically secure random values
//  used in the OAuth2 flow (nonce for session binding).
//
//  NOTE: The Uber WebSDK's signin() does not use PKCE. PKCE is only
//  generated internally by the SDK when requestTokens() is called.
//  Since we exchange tokens on the backend using client_secret
//  (confidential client), PKCE is not needed in this flow.
//  The generateCodeVerifier / generateCodeChallenge functions are kept
//  here for reference but are not used by the current routes.
// =========================================================================

const crypto = require('crypto');

/**
 * Generate a cryptographically random code_verifier.
 * 64 random bytes → 86 base64url characters (within the 43–128 char spec).
 * Not used in the current flow — kept for reference.
 */
function generateCodeVerifier() {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Derive the S256 code_challenge from a verifier:
 *   code_challenge = BASE64URL( SHA256( code_verifier ) )
 * Not used in the current flow — kept for reference.
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate a cryptographically random string.
 * Used as a nonce to bind the auth request to the server session.
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { generateCodeVerifier, generateCodeChallenge, generateState };
