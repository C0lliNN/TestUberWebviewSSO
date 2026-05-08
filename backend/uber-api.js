// =========================================================================
//  BACKEND — Uber API  (server-to-server calls)
// =========================================================================
//  These functions make HTTPS requests from our server directly to Uber.
//  The browser is NEVER involved — tokens and user data stay on the server.
// =========================================================================

const https = require('https');
const { UBER } = require('./config');

/**
 * Exchange an authorization code for tokens using client_secret.
 *
 *   POST https://auth.uber.com/oauth/v2/token
 *   Body: client_id, client_secret, grant_type, redirect_uri, code
 *
 * NOTE: The Uber WebSDK's signin() does not send a PKCE code_challenge
 * to the authorize endpoint, so we do NOT send code_verifier here.
 * The exchange is secured by the client_secret (confidential client).
 *
 * Returns: { access_token, refresh_token, token_type, expires_in, id_token, ... }
 * This response is NEVER forwarded to the browser.
 */
function exchangeCodeForTokens(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id:     UBER.clientId,
      client_secret: UBER.clientSecret,
      grant_type:    'authorization_code',
      redirect_uri:  UBER.redirectUri,
      code,
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
 * Fetch user profile from Uber's Consumer Identity API.
 *
 *   GET https://api.uber.com/v3/me
 *   Header: Authorization: Bearer <access_token>
 *
 * Docs: https://developer.uber.com/docs/consumer-identity/references/api/v3/me-get
 *
 * The response contains the encrypted user UUID — it MUST stay on the server.
 */
function fetchUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: UBER.apiHost,
      path:     UBER.userInfoPath,
      method:   'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept':        'application/json',
      },
    };

    console.log('[BE · userinfo] GET', `https://${UBER.apiHost}${UBER.userInfoPath}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('[BE · userinfo] HTTP %d — %d bytes', res.statusCode, data.length);

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('Userinfo HTTP ' + res.statusCode + ': ' + data.substring(0, 200)));
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse userinfo response: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch the user's co-brand credit card pre-approval status.
 *
 *   POST https://api.uber.com/v1/banking/issuance/pre-approval-status
 *   Header: Authorization: Bearer <access_token>
 *   Header: x-api-application-id: <UBER_API_APPLICATION_ID>
 *   Body: { uberUserUUID: <encrypted>, programType: "MX_COBRAND_CC" }
 *
 * Requires the `banking.events.issuance` OAuth scope on the access token.
 *
 * NOTE: `uberUserUUID` must be the encrypted form — the API decrypts it
 * server-side. Sending a raw UUID will fail.
 */
function getPreApprovalStatus(accessToken, encryptedUuid, programType) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      uberUserUUID: encryptedUuid,
      programType:  programType || 'MX_COBRAND_CC',
    });

    const options = {
      hostname: UBER.apiHost,
      path:     UBER.preApprovalStatusPath,
      method:   'POST',
      headers: {
        'Authorization':       `Bearer ${accessToken}`,
        'x-api-application-id': UBER.clientId,
        'Content-Type':         'application/json',
        'Content-Length':       Buffer.byteLength(body),
        'Accept':               'application/json',
      },
    };

    console.log('[BE · pre-approval-status] POST', `https://${UBER.apiHost}${UBER.preApprovalStatusPath}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('[BE · pre-approval-status] HTTP %d — %d bytes', res.statusCode, data.length);

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('PreApprovalStatus HTTP ' + res.statusCode + ': ' + data.substring(0, 500)));
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse pre-approval-status response: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { exchangeCodeForTokens, fetchUserInfo, getPreApprovalStatus };
