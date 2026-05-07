// =========================================================================
//  FRONTEND — Dashboard Script  (runs in the BROWSER)
// =========================================================================
//  This script:
//    1. Calls  GET /api/me  to get the user's SANITIZED profile
//    2. Renders the profile information on screen
//    3. Handles the "Sign Out" button  (POST /auth/logout)
//
//  IMPORTANT — What this script NEVER has access to:
//    • Access tokens, refresh tokens, or id tokens
//    • The user's encrypted UUID (sub field)
//    • The raw response from Uber's APIs
//
//  The backend returns only safe, display-ready fields (name, email,
//  picture, locale).  The session cookie is HTTP-only so JavaScript
//  cannot even read it.
// =========================================================================

(function () {
  'use strict';

  // ── DOM references ────────────────────────────────────────────────────
  var spinner          = document.getElementById('spinner');
  var title            = document.getElementById('title');
  var subtitle         = document.getElementById('subtitle');
  var statusDiv        = document.getElementById('status');
  var userInfoDiv      = document.getElementById('userInfo');
  var preApprovalDiv   = document.getElementById('preApprovalInfo');
  var preApprovedValue = document.getElementById('preApprovedValue');
  var preApprovalIdEl  = document.getElementById('preApprovalIdValue');
  var securityInfo     = document.getElementById('securityInfo');
  var deeplinkBtn      = document.getElementById('deeplinkBtn');
  var logoutBtn        = document.getElementById('logoutBtn');

  // ── UI helpers ────────────────────────────────────────────────────────
  function showError(message) {
    spinner.style.display = 'none';
    title.textContent     = 'Authentication Error';
    subtitle.textContent  = '';
    statusDiv.textContent = message;
    statusDiv.className   = 'status error';
  }

  function showProfile(user) {
    spinner.style.display = 'none';
    title.textContent     = 'Welcome' + (user.firstName ? ', ' + user.firstName : '') + '!';
    subtitle.textContent  = 'You are authenticated via Uber OIDC.';
    statusDiv.textContent = '✓ Authenticated securely';
    statusDiv.className   = 'status success';

    var html = '<h3>Your Profile</h3><div class="user-details">';

    if (user.picture) {
      html += '<img src="' + user.picture + '" alt="Profile" class="user-avatar">';
    }

    html += '<div class="user-fields">';
    if (user.name || user.firstName) {
      var displayName = user.name || ((user.firstName || '') + ' ' + (user.lastName || '')).trim();
      html += '<p><strong>Name:</strong> ' + displayName + '</p>';
    }
    if (user.email) {
      html += '<p><strong>Email:</strong> ' + user.email + '</p>';
    }
    if (user.locale) {
      html += '<p><strong>Locale:</strong> ' + user.locale + '</p>';
    }
    html += '</div></div>';

    userInfoDiv.innerHTML = html;
    userInfoDiv.classList.add('visible');
    securityInfo.style.display = 'block';
    deeplinkBtn.style.display  = 'block';
    logoutBtn.style.display    = 'block';
  }

  // ── Pre-approval status ───────────────────────────────────────────────
  //   The encrypted UUID lives server-side in the session; the backend
  //   reads it from /v3/me's `sub` claim. Nothing UUID-related is sent
  //   from the browser.
  function renderPreApproval(result) {
    preApprovedValue.textContent = (result && typeof result.preApproved === 'boolean')
      ? String(result.preApproved)
      : '—';
    preApprovalIdEl.textContent  = (result && result.preApprovalID) ? result.preApprovalID : '—';
    preApprovalDiv.style.display = 'block';
  }

  function renderPreApprovalError(message) {
    preApprovedValue.textContent = 'error';
    preApprovalIdEl.textContent  = message || 'failed to fetch';
    preApprovalDiv.style.display = 'block';
  }

  function fetchPreApprovalStatus() {
    fetch('/api/pre-approval-status', {
      method:      'POST',
      credentials: 'same-origin',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ programType: 'MX_COBRAND_CC' }),
    })
      .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
      .then(function (r) {
        if (r.status >= 200 && r.status < 300) {
          renderPreApproval(r.body);
        } else {
          renderPreApprovalError((r.body && (r.body.message || r.body.error)) || ('HTTP ' + r.status));
        }
      })
      .catch(function (err) {
        console.error('[FE · dashboard] pre-approval-status failed:', err);
        renderPreApprovalError(err.message);
      });
  }

  // ── Fetch the user profile from the BACKEND ───────────────────────────
  //    The backend reads the access token from the session (server-side),
  //    and returns only the sanitized fields. No token is sent over the wire.
  fetch('/api/me', { credentials: 'same-origin' })
    .then(function (res) {
      if (res.status === 401) {
        window.location.href = '/?error=' + encodeURIComponent('Session expired. Please log in again.');
        return null;
      }
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      if (data.error) {
        showError(data.message || data.error);
        return;
      }
      showProfile(data.user);
      fetchPreApprovalStatus();
    })
    .catch(function (err) {
      console.error('[FE · dashboard] Failed to fetch profile:', err);
      showError('Failed to load profile. Please try again.');
    });

  // ── Open Deeplink via native bridge ──────────────────────────────────
  deeplinkBtn.addEventListener('click', function () {
    var payload = JSON.stringify({
      messageID: String(Date.now()),
      type: 'openDeeplink',
      payload: JSON.stringify({ url: 'googlegmail:///co?to=test@example.com&subject=Hello&body=Test' })
    });

    if (
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers.cobrand_credit_card_web_flow_bridge
    ) {
      window.webkit.messageHandlers.cobrand_credit_card_web_flow_bridge.postMessage(payload);
      return;
    }

    if (
      window.cobrand_credit_card_web_flow_bridge &&
      typeof window.cobrand_credit_card_web_flow_bridge.postMessage === 'function'
    ) {
      window.cobrand_credit_card_web_flow_bridge.postMessage(payload);
      return;
    }

    console.warn('Native bridge not found. Deeplink action was not executed.');
  });

  // ── Logout ────────────────────────────────────────────────────────────
  logoutBtn.addEventListener('click', function () {
    fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function ()  { window.location.href = '/'; })
      .catch(function () { window.location.href = '/auth/logout'; });
  });
})();
