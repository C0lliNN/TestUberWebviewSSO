// =========================================================================
//  BACKEND — Configuration
// =========================================================================
//  This file lives on the SERVER. It contains credentials and endpoints
//  that must NEVER be exposed to the browser.
// =========================================================================

const crypto = require('crypto');

const PORT     = process.env.PORT     || 8080;
const BASE_URL = process.env.BASE_URL || '';   // e.g. "https://my-app.example.com"

/**
 * Uber OIDC / OAuth2 configuration.
 *
 * ALL credentials and URLs must come from environment variables.
 * The server will refuse to start if UBER_CLIENT_ID or UBER_CLIENT_SECRET
 * are missing (see validation at the bottom of this file).
 */
const UBER = {
  clientId:     process.env.UBER_CLIENT_ID     || '',
  clientSecret: process.env.UBER_CLIENT_SECRET || '',
  redirectUri:  process.env.UBER_REDIRECT_URI  || (BASE_URL ? `${BASE_URL}/callback` : ''),
  scopes:       'profile',

  // Uber OIDC endpoints  (swap "sandbox-" prefix for production)
  authHost:      process.env.UBER_AUTH_HOST || 'sandbox-login.uber.com',
  authorizePath: '/oauth/v2/authorize',
  tokenPath:     '/oauth/v2/token',
  userInfoPath:  '/oauth/v2/userinfo',
};

// ── Validate required env vars at startup ────────────────────────────────
const missing = [];
if (!UBER.clientId)     missing.push('UBER_CLIENT_ID');
if (!UBER.clientSecret) missing.push('UBER_CLIENT_SECRET');
if (!BASE_URL)          missing.push('BASE_URL');
if (missing.length > 0) {
  console.error('');
  console.error('  ✖  Missing required environment variables:');
  missing.forEach(function (v) { console.error('       • ' + v); });
  console.error('');
  console.error('  Example:');
  console.error('    BASE_URL=https://my-app.example.com \\');
  console.error('    UBER_CLIENT_ID=xxx \\');
  console.error('    UBER_CLIENT_SECRET=yyy \\');
  console.error('    node server.js');
  console.error('');
  process.exit(1);
}

/**
 * Session configuration.
 *
 * The session cookie is the ONLY thing the browser ever receives.
 * Tokens, UUIDs, and secrets stay inside this server process.
 */
const SESSION = {
  secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
  cookieName: '__uber_sid',
  cookie: {
    httpOnly:  true,               // JavaScript on the page CANNOT read this cookie
    secure:    false,              // Set to `true` when serving over HTTPS
    sameSite:  'lax',              // Prevents the cookie from being sent on cross-site requests
    maxAge:    30 * 60 * 1000,     // 30 minutes
  },
};

module.exports = { PORT, BASE_URL, UBER, SESSION };
