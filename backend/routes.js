// =========================================================================
//  BACKEND — Express Routes
// =========================================================================
//  Every route in this file runs on the SERVER.
//  The browser only ever receives:
//    • HTML pages  (login, callback, dashboard)
//    • JSON from   GET  /auth/start   (PKCE challenge + state — no secrets)
//    • JSON from   POST /auth/token-exchange   (sanitized user — no tokens)
//    • JSON from   GET  /api/me   (sanitized user — no tokens)
//    • An HTTP-only session cookie (opaque ID — no tokens inside)
// =========================================================================

const path = require('path');
const express = require('express');
const { UBER }                           = require('./config');
const { generateState }                  = require('./pkce');
const { exchangeCodeForTokens,
        fetchUserInfo }                  = require('./uber-api');
const { sanitizeUserInfo }               = require('./sanitize');

const router = express.Router();

// Parse JSON request bodies (for POST /auth/token-exchange)
router.use(express.json());

// Path to the frontend pages folder
const PAGES = path.join(__dirname, '..', 'frontend', 'pages');

// ─────────────────────────────────────────────
//  Page routes  (serve static HTML to browser)
// ─────────────────────────────────────────────

/** Serve the login page (loads the Uber WebSDK). */
router.get('/', (_req, res) => {
  res.sendFile(path.join(PAGES, 'login.html'));
});

/** Serve the OAuth callback page (receives the authorization code). */
router.get('/callback', (_req, res) => {
  res.sendFile(path.join(PAGES, 'callback.html'));
});

/** Serve the dashboard (requires an active session). */
router.get('/dashboard', (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/?error=' + encodeURIComponent('Please log in first.'));
  }
  res.sendFile(path.join(PAGES, 'dashboard.html'));
});

// ─────────────────────────────────────────────
//  OAuth2 / OIDC + PKCE  routes
// ─────────────────────────────────────────────

/**
 * GET /auth/start
 *
 * Called by the FRONTEND before it calls UberAPI.auth.signin().
 *
 * What happens here (on the SERVER):
 *   1. Generate a random  nonce  (session-binding / replay protection)
 *   2. Store the nonce in the server-side session
 *   3. Return the SDK configuration to the frontend:
 *      { clientId, redirectUri, scope, nonce }
 *
 * NOTE on PKCE:
 *   The Uber WebSDK only generates PKCE internally when requestTokens()
 *   is called. Since we use signin() + server-side token exchange with
 *   client_secret (confidential client), PKCE is not part of this flow.
 *   The client_secret provides equivalent protection against unauthorized
 *   code exchange.
 *
 * NOTE on state:
 *   The SDK does not send a `state` parameter. We use `nonce` (which the
 *   SDK does send) to tie the request to this server session.
 */
router.get('/auth/start', (req, res) => {
  const nonce = generateState();   // reuse the random generator for nonce

  // Store nonce in the session for verification on callback
  req.session.oauthNonce = nonce;

  console.log('[BE · /auth/start] nonce generated (nonce=%s…)', nonce.substring(0, 8));

  // Return the SDK configuration (no secrets, no code_verifier)
  res.json({
    clientId:    UBER.clientId,
    redirectUri: UBER.redirectUri,
    scope:       UBER.scopes,
    nonce,
  });
});

/**
 * POST /auth/token-exchange
 *
 * Called by the FRONTEND callback page after Uber redirects back with a code.
 *
 * Body: { code: "..." }
 *
 * What happens here (on the SERVER):
 *   1. Verify the session has an active nonce (request was initiated by us)
 *   2. Exchange `code` + `client_secret` → tokens  (server-to-server HTTPS)
 *   3. Use the access_token to fetch user info      (server-to-server HTTPS)
 *   4. Store tokens + full user info in the session
 *   5. Store a *sanitized* copy (no UUID) for the frontend
 *   6. Return { success: true, user: sanitizedUser }
 *
 * NOTE: The Uber WebSDK's signin() does not send PKCE code_challenge,
 * so we don't send code_verifier here. The token exchange is secured by
 * the client_secret (confidential client).
 *
 * The browser NEVER receives any token or encrypted UUID.
 */
router.post('/auth/token-exchange', async (req, res) => {
  const { code } = req.body;

  // ── Verify this request originated from a valid session ───────────────
  if (!req.session.oauthNonce) {
    console.error('[BE · /auth/token-exchange] No nonce in session — session expired or forged request');
    return res.status(403).json({ error: 'invalid_session', message: 'Session expired. Please try again.' });
  }

  if (!code) {
    return res.status(400).json({ error: 'missing_code', message: 'No authorization code provided.' });
  }

  // Clean up one-time nonce
  delete req.session.oauthNonce;

  try {
    // ── Exchange code → tokens  (server ↔ Uber, secured by client_secret) ─
    const tokenData = await exchangeCodeForTokens(code);

    if (tokenData.error) {
      console.error('[BE · /auth/token-exchange] Token error:', tokenData.error);
      return res.status(400).json({ error: tokenData.error, message: tokenData.error_description || tokenData.error });
    }

    console.log('[BE · /auth/token-exchange] Token exchange succeeded');

    // Store tokens in session (NEVER sent to browser)
    req.session.accessToken  = tokenData.access_token;
    req.session.refreshToken = tokenData.refresh_token || null;
    req.session.tokenType    = tokenData.token_type;
    req.session.expiresAt    = Date.now() + (tokenData.expires_in || 3600) * 1000;
    req.session.idToken      = tokenData.id_token || null;

    // ── Fetch user info  (server ↔ Uber) ───────────────────────────────
    const rawUserInfo = await fetchUserInfo(tokenData.access_token);
    console.log('[BE · /auth/token-exchange] User info fetched');

    // Full copy stays on the server (contains encrypted UUID)
    req.session.userInfoFull = rawUserInfo;

    // Sanitized copy is the only thing the frontend can access
    req.session.userInfoSafe    = sanitizeUserInfo(rawUserInfo);
    req.session.isAuthenticated = true;

    // Return sanitized result to the frontend (NO tokens, NO UUID)
    res.json({
      success: true,
      user:    req.session.userInfoSafe,
    });

  } catch (err) {
    console.error('[BE · /auth/token-exchange] Exception:', err.message);
    res.status(500).json({ error: 'exchange_failed', message: 'Authentication failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────
//  API routes  (JSON responses)
// ─────────────────────────────────────────────

/**
 * GET /api/me
 *
 * Returns ONLY the sanitized user profile to the frontend.
 * Access tokens and encrypted UUIDs are NEVER included in the response.
 */
router.get('/api/me', (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: 'not_authenticated', message: 'Please log in first.' });
  }

  if (req.session.expiresAt && Date.now() > req.session.expiresAt) {
    return res.status(401).json({ error: 'token_expired', message: 'Session expired. Please log in again.' });
  }

  res.json({
    authenticated: true,
    user: req.session.userInfoSafe,   // ← sanitized, no tokens, no UUID
  });
});

/**
 * GET /api/session
 *
 * Returns non-sensitive session metadata.
 */
router.get('/api/session', (req, res) => {
  res.json({
    authenticated: !!req.session.isAuthenticated,
    expiresAt:     req.session.expiresAt || null,
  });
});

// ─────────────────────────────────────────────
//  Logout
// ─────────────────────────────────────────────

/** POST /auth/logout — called by the frontend JS. */
router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('__uber_sid');
    res.json({ success: true });
  });
});

/** GET /auth/logout — convenience link (redirects to login). */
router.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('__uber_sid');
    res.redirect('/');
  });
});

module.exports = router;
