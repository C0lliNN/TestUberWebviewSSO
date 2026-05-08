// =========================================================================
//  BACKEND — Express Routes
// =========================================================================
//  Every route in this file runs on the SERVER.
//  The browser only ever receives:
//    • HTML pages  (login, callback, dashboard)
//    • JSON from   GET  /auth/start   (SDK config + nonce — no secrets)
//    • JSON from   POST /auth/token-exchange   (sanitized user — no tokens)
//    • JSON from   GET  /api/me   (sanitized user — no tokens)
//    • An HTTP-only session cookie (opaque ID — no tokens inside)
// =========================================================================

const path = require('path');
const express = require('express');
const { UBER }                           = require('./config');
const { generateState }                  = require('./pkce');
const { exchangeCodeForTokens,
        fetchUserInfo,
        getPreApprovalStatus }           = require('./uber-api');
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
//  OAuth2 / OIDC  routes
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

  console.log('[BE · /auth/start] nonce=%s… redirectUri=%s', nonce.substring(0, 8), UBER.redirectUri);

  // Tell the frontend which auth host to use.
  // "auth.uber.com" → use the WebSDK  |  anything else → manual redirect (sandbox)
  const authorizeEndpoint = `https://${UBER.authHost}${UBER.authorizePath}`;

  res.json({
    clientId:           UBER.clientId,
    redirectUri:        UBER.redirectUri,
    scope:              UBER.scopes,
    nonce,
    authorizeEndpoint,  // frontend decides SDK vs manual based on this
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
    //    This is a best-effort call. If it fails, the user is still
    //    authenticated (we have valid tokens). We just won't have profile data.
    let rawUserInfo = {};
    try {
      rawUserInfo = await fetchUserInfo(tokenData.access_token);
      console.log('[BE · /auth/token-exchange] User info fetched');
    } catch (userInfoErr) {
      console.warn('[BE · /auth/token-exchange] User info fetch failed (non-fatal):', userInfoErr.message);
    }

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

/**
 * POST /api/pre-approval-status
 *
 * Calls Uber's FinProd Issuance pre-approval-status endpoint:
 *   POST https://api.uber.com/v1/banking/issuance/pre-approval-status
 *
 * Body: { programType?: "MX_COBRAND_CC" }
 *
 * The encrypted user UUID is taken from the server-side session
 * (set during /auth/token-exchange from /v3/me) and is never accepted
 * from the client.
 *
 * Requires:
 *   • An authenticated session (uses req.session.accessToken).
 *   • The access token must include the `banking.events.issuance` scope.
 *   • UBER_CLIENT_ID env var (sent as x-api-application-id).
 */
router.post('/api/pre-approval-status', async (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: 'not_authenticated', message: 'Please log in first.' });
  }

  if (req.session.expiresAt && Date.now() > req.session.expiresAt) {
    return res.status(401).json({ error: 'token_expired', message: 'Session expired. Please log in again.' });
  }

  const uberUserUUID = req.session.userInfoFull && req.session.userInfoFull.sub;
  if (!uberUserUUID) {
    return res.status(500).json({ error: 'missing_user_uuid', message: 'No user UUID in session.' });
  }

  const { programType } = req.body || {};

  try {
    const result = await getPreApprovalStatus(req.session.accessToken, uberUserUUID, programType);
    res.json(result);
  } catch (err) {
    console.error('[BE · /api/pre-approval-status] Exception:', err.message);
    res.status(502).json({ error: 'preapproval_failed', message: err.message });
  }
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
