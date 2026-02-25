// =========================================================================
//  BACKEND — Uber API  (server-to-server calls)
// =========================================================================
//  These functions make HTTPS requests from our server directly to Uber.
//  The browser is NEVER involved — tokens and user data stay on the server.
// =========================================================================

const https = require('https');
const { UBER } = require('./config');

/**
 * Exchange an authorization code + PKCE code_verifier for tokens.
 *
 *   POST https://sandbox-login.uber.com/oauth/v2/token
 *   Body: client_id, client_secret, grant_type, redirect_uri, code, code_verifier
 *
 * Returns: { access_token, refresh_token, token_type, expires_in, id_token, ... }
 * This response is NEVER forwarded to the browser.
 */
function exchangeCodeForTokens(code, codeVerifier) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id:     UBER.clientId,
      client_secret: UBER.clientSecret,
      grant_type:    'authorization_code',
      redirect_uri:  UBER.redirectUri,
      code,
      code_verifier: codeVerifier,   // ← PKCE: proves WE started this flow
    }).toString();

    const options = {
      hostname: UBER.authHost,
      path:     UBER.tokenPath,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length':  Buffer.byteLength(body),
      },
    };

    console.log('[BE · token-exchange] POST', `${UBER.authHost}${UBER.tokenPath}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse token response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Fetch user info from Uber's OIDC UserInfo endpoint.
 *
 *   GET https://sandbox-login.uber.com/oauth/v2/userinfo
 *   Header: Authorization: Bearer <access_token>
 *
 * Returns: { sub, name, email, picture, ... }
 * The `sub` field contains the encrypted user UUID — it MUST stay on the server.
 */
function fetchUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: UBER.authHost,
      path:     UBER.userInfoPath,
      method:   'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept':        'application/json',
      },
    };

    console.log('[BE · userinfo] GET', `${UBER.authHost}${UBER.userInfoPath}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse userinfo response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = { exchangeCodeForTokens, fetchUserInfo };
