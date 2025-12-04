// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  clientId: 'GLd7MAvJLchMHFjBl9a4Unieo13kCBi9',
  redirectURI: 'https://c0llinn.github.io/TestUberWebviewSSO/callback',
  scope: 'profile',
  authorizationEndpoint: 'https://sandbox-login.uber.com/oauth/v2/authorize',
};

// Redirect to Uber SSO
function redirectToUberSSO() {
  const state = generateRandomString();
  localStorage.setItem('uber_auth_state', state);

  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    response_type: 'code',
    redirect_uri: CONFIG.redirectURI,
    scope: CONFIG.scope,
    state: state,
  });

  const authUrl = `${CONFIG.authorizationEndpoint}?${params.toString()}`;
  window.location.href = authUrl;
}

// Generate random string for state parameter (CSRF protection)
function generateRandomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

// DOM Elements
const authButton = document.getElementById('authWithUber');
const statusDiv = document.getElementById('status');
const userInfoDiv = document.getElementById('userInfo');
const userInfoContent = document.getElementById('userInfoContent');

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
}

// Show user info
function showUserInfo(data) {
  userInfoContent.textContent = JSON.stringify(data, null, 2);
  userInfoDiv.classList.add('visible');
}

// Handle authentication button click - redirect to Uber authorization
authButton.addEventListener('click', redirectToUberSSO);

// Check if we have tokens from callback (stored in sessionStorage)
function checkForTokens() {
  const accessToken = sessionStorage.getItem('uber_access_token');
  const error = sessionStorage.getItem('uber_auth_error');

  if (error) {
    showStatus('Authentication failed: ' + error, 'error');
    sessionStorage.removeItem('uber_auth_error');
    return;
  }

  if (accessToken) {
    showStatus('✓ Authentication successful!', 'success');

    const tokenData = {
      access_token: accessToken,
      token_type: sessionStorage.getItem('uber_token_type') || 'Bearer',
      expires_in: sessionStorage.getItem('uber_expires_in') || 'N/A',
    };

    showUserInfo(tokenData);
    console.log('Access Token:', accessToken);
  }
}

// Check for tokens on page load
checkForTokens();

// Auto-redirect to SSO if origin=uber query param is present
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('origin') === 'uber') {
  redirectToUberSSO();
}
