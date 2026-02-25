// =========================================================================
//  FRONTEND — Login Script  (runs in the BROWSER, uses Uber WebSDK)
// =========================================================================
//  This script:
//    1. Calls  GET /auth/start  on our BACKEND to get PKCE + state params
//       (the code_verifier stays on the server — only code_challenge comes here)
//    2. Calls  UberAPI.auth.init(config)  with those params
//    3. Calls  UberAPI.auth.login()  to redirect to Uber SSO
//
//  If there's an ?error= in the URL, it shows the error and stops.
//
//  There is NO token handling in this file. The Uber WebSDK is used
//  solely to initiate the OIDC authorization redirect.
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
   *   1. Fetch PKCE params from our backend  (GET /auth/start)
   *   2. Initialize the Uber WebSDK          (UberAPI.auth.init)
   *   3. Trigger the SSO redirect            (UberAPI.auth.login)
   */
  function startLogin() {
    subtitle.textContent  = 'Initializing Uber SSO...';
    spinner.style.display = '';
    authBtn.style.display = 'none';

    // STEP 1 — Ask our BACKEND for PKCE challenge + state
    //          (the code_verifier is stored in the server session,
    //           we only receive the code_challenge here)
    fetch('/auth/start', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (authConfig) {
        console.log('[FE · login] Received auth config from backend');

        subtitle.textContent = 'Redirecting to Uber...';

        // STEP 2 — Initialize the Uber WebSDK
        //          The SDK is loaded via <script src="https://auth.uber.com/js/sdk.js">
        //          in login.html. It exposes the global  UberAPI  object.
        UberAPI.auth.init({
          clientId:            authConfig.clientId,
          redirectUri:         authConfig.redirectUri,
          scope:               authConfig.scope,
          responseType:        'code',
          state:               authConfig.state,
          codeChallenge:       authConfig.codeChallenge,
          codeChallengeMethod: authConfig.codeChallengeMethod,  // 'S256'
          isThirdParty:        true,
        });

        console.log('[FE · login] UberAPI.auth.init() called');

        // STEP 3 — Trigger the login redirect
        //          This navigates the browser to Uber's authorization page.
        //          After the user signs in, Uber redirects to our redirectUri
        //          (the callback page) with ?code=…&state=…
        UberAPI.auth.login();

        console.log('[FE · login] UberAPI.auth.login() called — redirecting…');
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
