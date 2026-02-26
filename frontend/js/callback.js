// =========================================================================
//  FRONTEND — Callback Script  (runs in the BROWSER)
// =========================================================================
//  Uber redirects the browser here after the user signs in:
//    /callback?code=AUTH_CODE&state=STATE
//
//  This script:
//    1. Extracts  code  and  state  from the URL query params
//    2. Sends them to our BACKEND  →  POST /auth/token-exchange
//    3. The backend uses the server-stored code_verifier to exchange
//       the authorization code for tokens (server-to-server with Uber)
//    4. The backend returns { success: true, user: { sanitized } }
//    5. This script redirects the browser to /dashboard
//
//  IMPORTANT — This script NEVER sees:
//    • Access tokens, refresh tokens, or id tokens
//    • The PKCE code_verifier (it was generated + stored on the server)
//    • The user's encrypted UUID (sub)
//
//  The only sensitive value in the URL is the authorization code,
//  which is single-use and immediately consumed by the backend.
// =========================================================================

(function () {
  'use strict';

  var spinner   = document.getElementById('spinner');
  var title     = document.getElementById('title');
  var subtitle  = document.getElementById('subtitle');
  var statusDiv = document.getElementById('status');

  function showError(message) {
    spinner.style.display = 'none';
    title.textContent     = 'Sign-In Failed';
    subtitle.textContent  = '';
    statusDiv.textContent = message;
    statusDiv.className   = 'status error';
  }

  // ── Extract params from the redirect URL ──────────────────────────────
  var params = new URLSearchParams(window.location.search);
  var code   = params.get('code');
  var error  = params.get('error');
  var errMsg = params.get('error_description');

  // ── Handle Uber-side errors ───────────────────────────────────────────
  if (error) {
    showError(errMsg || error);
    return;
  }

  if (!code) {
    showError('No authorization code received.');
    return;
  }

  // ── Send the code to the BACKEND for token exchange ───────────────────
  //    POST /auth/token-exchange
  //    Body: { code }
  //
  //    The backend:
  //      • Verifies the session has a valid nonce (request originated from us)
  //      • Sends  code + client_secret  to Uber  (server-to-server)
  //      • Stores the returned tokens in the session
  //      • Returns sanitized user info only
  subtitle.textContent = 'Exchanging authorization code...';

  fetch('/auth/token-exchange', {
    method:      'POST',
    credentials: 'same-origin',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ code: code }),
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        showError(data.message || data.error);
        return;
      }

      console.log('[FE · callback] Token exchange succeeded, redirecting to dashboard');

      // Success — the backend now has the tokens in the session.
      // Redirect to dashboard (the session cookie handles authentication).
      window.location.href = '/dashboard';
    })
    .catch(function (err) {
      console.error('[FE · callback] Token exchange failed:', err);
      showError('Failed to complete authentication. Please try again.');
    });
})();
