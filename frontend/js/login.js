// =========================================================================
//  FRONTEND — Login Script  (runs in the BROWSER, uses Uber WebSDK)
// =========================================================================
//  This script:
//    1. Calls  GET /auth/start  on our BACKEND to get SDK config + nonce
//    2. If production (auth.uber.com):
//       Uses  UberAPI.auth.init() + UberAPI.auth.signin()  from the WebSDK
//    3. If sandbox (sandbox-login.uber.com or any other host):
//       Builds the authorize URL manually and redirects (the SDK hardcodes
//       auth.uber.com and cannot be overridden)
//
//  SDK API (from https://auth.uber.com/oauth/static/auth-v_1_2_0.js):
//    • UberAPI.auth.init(config)       — initialize (must call first)
//    • UberAPI.auth.signin()           — authenticate (redirect to Uber)
//    • UberAPI.auth.requestTokens()    — exchange code for tokens (NOT USED —
//                                        we do this on the backend instead)
//
//  There is NO token handling in this file. Token exchange happens
//  exclusively on the backend using client_secret.
// =========================================================================

(function () {
  'use strict';

  var PRODUCTION_AUTHORIZE = 'https://auth.uber.com/oauth/v2/authorize';

  var params    = new URLSearchParams(window.location.search);
  var error     = params.get('error');
  var statusDiv = document.getElementById('status');
  var subtitle  = document.getElementById('subtitle');
  var spinner   = document.getElementById('spinner');
  var authBtn   = document.getElementById('authWithUber');

  // ── Display server-side error messages ────────────────────────────────
  if (error && statusDiv) {
    spinner.style.display = 'none';
    subtitle.textContent  = 'Something went wrong.';
    statusDiv.textContent = error;
    statusDiv.className   = 'status error';
    authBtn.style.display = 'flex';
    authBtn.addEventListener('click', function (e) {
      e.preventDefault();
      startLogin();
    });
    window.history.replaceState({}, document.title, '/');
    return;
  }

  // ── Auto-start SSO immediately ────────────────────────────────────────
  startLogin();

  /**
   * Start the login flow:
   *   1. Fetch config from backend  (GET /auth/start)
   *   2. Redirect to Uber via SDK (production) or manual URL (sandbox)
   */
  function startLogin() {
    subtitle.textContent  = 'Initializing Uber SSO...';
    spinner.style.display = '';
    authBtn.style.display = 'none';

    fetch('/auth/start', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (authConfig) {
        console.log('[FE · login] Received auth config from backend');
        console.log('[FE · login] authorizeEndpoint:', authConfig.authorizeEndpoint);
        console.log('[FE · login] redirectUri:', authConfig.redirectUri);

        subtitle.textContent = 'Redirecting to Uber...';

        var isProduction = authConfig.authorizeEndpoint === PRODUCTION_AUTHORIZE;

        if (isProduction && typeof UberAPI !== 'undefined') {
          // ── PRODUCTION: Use the Uber WebSDK ──────────────────────────
          loginWithSDK(authConfig);
        } else {
          // ── SANDBOX / FALLBACK: Manual redirect ──────────────────────
          //    The SDK hardcodes auth.uber.com and has no sandbox support.
          //    We replicate what the SDK does internally:
          //    build the authorize URL and set window.location.href.
          loginWithManualRedirect(authConfig);
        }
      })
      .catch(function (err) {
        console.error('[FE · login] Failed to start login:', err);
        spinner.style.display = 'none';
        subtitle.textContent  = 'Could not start authentication.';
        statusDiv.textContent = 'Failed to initialize. Please try again.';
        statusDiv.className   = 'status error';
        authBtn.style.display = 'flex';
        authBtn.addEventListener('click', function (e) {
          e.preventDefault();
          startLogin();
        });
      });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  PRODUCTION — Use the Uber WebSDK
  // ─────────────────────────────────────────────────────────────────────
  function loginWithSDK(authConfig) {
    console.log('[FE · login] Using Uber WebSDK (production)');

    UberAPI.auth.init({
      clientId:     authConfig.clientId,
      redirectURI:  authConfig.redirectUri,
      scope:        authConfig.scope,
      responseType: 'code',
      uxMode:       'redirect',
      nonce:        authConfig.nonce,
    });

    console.log('[FE · login] UberAPI.auth.init() called');

    UberAPI.auth.signin().then(function (response, error) {
      if (error) {
        console.error('[FE · login] signin error:', error);
        spinner.style.display = 'none';
        subtitle.textContent  = 'Uber sign-in failed.';
        statusDiv.textContent = error.message || 'Sign-in was cancelled or failed.';
        statusDiv.className   = 'status error';
        authBtn.style.display = 'flex';
        return;
      }
      console.log('[FE · login] signin resolved (redirect mode — unexpected)');
    });

    console.log('[FE · login] UberAPI.auth.signin() called — redirecting…');
  }

  // ─────────────────────────────────────────────────────────────────────
  //  SANDBOX — Manual redirect (replicates what the SDK does internally)
  // ─────────────────────────────────────────────────────────────────────
  function loginWithManualRedirect(authConfig) {
    console.log('[FE · login] Using manual redirect (sandbox / non-production)');

    var params = new URLSearchParams({
      client_id:     authConfig.clientId,
      nonce:         authConfig.nonce,
      response_type: 'code',
      redirect_uri:  authConfig.redirectUri,
      scope:         authConfig.scope,
      sdk:           'auth-js',
      sdk_version:   '1.2.0',
    });

    var url = authConfig.authorizeEndpoint + '?' + params.toString();
    console.log('[FE · login] Redirecting to:', url);

    window.location.href = url;
  }
})();
