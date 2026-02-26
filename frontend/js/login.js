// =========================================================================
//  FRONTEND — Login Script  (runs in the BROWSER, uses Uber WebSDK)
// =========================================================================
//  This script:
//    1. Calls  GET /auth/start  on our BACKEND to get SDK config + nonce
//    2. Calls  UberAPI.auth.init(config)  with those params
//    3. Calls  UberAPI.auth.signin()  to redirect to Uber SSO
//
//  SDK API (from https://auth.uber.com/oauth/static/auth-v_1_2_0.js):
//    • UberAPI.auth.init(config)       — initialize (must call first)
//    • UberAPI.auth.signin()           — authenticate (redirect to Uber)
//    • UberAPI.auth.requestTokens()    — exchange code for tokens (NOT USED —
//                                        we do this on the backend instead)
//
//  If there's an ?error= in the URL, it shows the error and stops.
//
//  There is NO token handling in this file. Token exchange happens
//  exclusively on the backend using client_secret.
// =========================================================================

(function () {
  'use strict';

  var params    = new URLSearchParams(window.location.search);
  var error     = params.get('error');
  var statusDiv = document.getElementById('status');
  var subtitle  = document.getElementById('subtitle');
  var spinner   = document.getElementById('spinner');
  var authBtn   = document.getElementById('authWithUber');

  // ── Display server-side error messages ────────────────────────────────
  //    If the backend redirected here with ?error=…, show the message
  //    and STOP — do not auto-redirect (would cause a loop).
  if (error && statusDiv) {
    spinner.style.display = 'none';
    subtitle.textContent  = 'Something went wrong.';
    statusDiv.textContent = error;
    statusDiv.className   = 'status error';
    // Show the manual login button as a retry option
    authBtn.style.display = 'flex';
    authBtn.addEventListener('click', function (e) {
      e.preventDefault();
      startLogin();
    });
    // Clean the URL so a page refresh doesn't re-show the error
    window.history.replaceState({}, document.title, '/');
    return;
  }

  // ── Auto-start SSO immediately ────────────────────────────────────────
  startLogin();

  /**
   * Start the login flow:
   *   1. Fetch SDK config from our backend  (GET /auth/start)
   *   2. Initialize the Uber WebSDK         (UberAPI.auth.init)
   *   3. Trigger the SSO redirect           (UberAPI.auth.signin)
   */
  function startLogin() {
    subtitle.textContent  = 'Initializing Uber SSO...';
    spinner.style.display = '';
    authBtn.style.display = 'none';

    // STEP 1 — Ask our BACKEND for SDK configuration
    //          (includes clientId, redirectURI, scope, nonce)
    fetch('/auth/start', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (authConfig) {
        console.log('[FE · login] Received auth config from backend');

        subtitle.textContent = 'Redirecting to Uber...';

        // STEP 2 — Initialize the Uber WebSDK
        //
        //   SDK config properties (from source):
        //     clientId     — OAuth client ID
        //     redirectURI  — where Uber sends the auth code (capital URI!)
        //     scope        — OAuth scopes
        //     responseType — "code" (auth code flow) or "id_token"
        //     uxMode       — "redirect" (full page) or "popup"
        //     nonce        — ties the request to our server session
        //     prompt       — optional, e.g. "login"
        //
        //   NOTE: The SDK does NOT accept codeChallenge / state params.
        //   PKCE is only used internally by requestTokens(), not signin().
        //   Since we're a confidential client (have client_secret on the
        //   backend), the server-side token exchange is already secure.
        //
        UberAPI.auth.init({
          clientId:     authConfig.clientId,
          redirectURI:  authConfig.redirectUri,    // SDK expects capital "URI"
          scope:        authConfig.scope,
          responseType: 'code',                    // Authorization code flow only
          uxMode:       'redirect',                // Full page redirect (not popup)
          nonce:        authConfig.nonce,           // Ties to server session
        });

        console.log('[FE · login] UberAPI.auth.init() called with redirectURI:', authConfig.redirectUri);

        // STEP 3 — Trigger the sign-in redirect
        //
        //   IMPORTANT: The method is  signin()  (all lowercase).
        //   This redirects the browser to Uber's authorization page.
        //   After the user signs in, Uber redirects to our redirectURI
        //   (the callback page) with ?code=…
        //
        //   We intentionally do NOT call requestTokens() — that would
        //   do the token exchange in the browser, exposing tokens.
        //   Instead, our callback page sends the code to the backend.
        //
        UberAPI.auth.signin().then(function (response, error) {
          // This callback normally never fires in redirect mode because
          // the page navigates away. It only runs in error/edge cases.
          if (error) {
            console.error('[FE · login] signin error:', error);
            spinner.style.display = 'none';
            subtitle.textContent  = 'Uber sign-in failed.';
            statusDiv.textContent = error.message || 'Sign-in was cancelled or failed.';
            statusDiv.className   = 'status error';
            authBtn.style.display = 'flex';
            return;
          }

          // DEFENSIVE: Do NOT log, store, or use any data from the response.
          // The only safe path is the redirect → /callback → backend flow.
          console.log('[FE · login] signin resolved (redirect mode — unexpected)');
        });

        console.log('[FE · login] UberAPI.auth.signin() called — redirecting…');
      })
      .catch(function (err) {
        console.error('[FE · login] Failed to start login:', err);
        spinner.style.display = 'none';
        subtitle.textContent  = 'Could not start authentication.';
        statusDiv.textContent = 'Failed to initialize. Please try again.';
        statusDiv.className   = 'status error';
        // Show manual retry button
        authBtn.style.display = 'flex';
        authBtn.addEventListener('click', function (e) {
          e.preventDefault();
          startLogin();
        });
      });
  }
})();
