const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;

// ============================================
// CONFIGURATION - Replace with your credentials
// ============================================
const CLIENT_ID = 'GLd7MAvJLchMHFjBl9a4Unieo13kCBi9';
const CLIENT_SECRET = '3S4TrbvcgIsY6LwvJrAfk0Sytsyq1JKlBKvrd9lq';
const REDIRECT_URI = 'https://c0llinn.github.io/TestUberWebviewSSO/callback';
const TOKEN_ENDPOINT = 'sandbox-login.uber.com';  // Sandbox environment
const API_ENDPOINT = 'test-api.uber.com';  // Sandbox Riders API

// CORS headers helper
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle token exchange with Uber
function handleTokenExchange(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const { code } = JSON.parse(body);
      console.log('Token exchange request received for code:', code.substring(0, 10) + '...');

      const postData = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code: code,
      }).toString();

      console.log('Sending token request to:', TOKEN_ENDPOINT);

      const options = {
        hostname: TOKEN_ENDPOINT,
        path: '/oauth/v2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const tokenReq = https.request(options, tokenRes => {
        let tokenData = '';

        tokenRes.on('data', chunk => {
          tokenData += chunk;
        });

        tokenRes.on('end', () => {
          console.log('Token response status:', tokenRes.statusCode);
          console.log('Token response:', tokenData);
          res.writeHead(tokenRes.statusCode, {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          });
          res.end(tokenData);
        });
      });

      tokenReq.on('error', error => {
        console.error('Error exchanging code for token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ error: 'token_exchange_failed', error_description: error.message }));
      });

      tokenReq.write(postData);
      tokenReq.end();

    } catch (error) {
      console.error('Parse error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ error: 'invalid_request', error_description: 'Invalid JSON body' }));
    }
  });
}

// Handle fetching user info from Uber API
function handleUserInfo(req, res) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const { access_token } = JSON.parse(body);
      console.log('Fetching user info with token:', access_token.substring(0, 10) + '...');

      const options = {
        hostname: API_ENDPOINT,
        path: '/v1.2/me',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept-Language': 'en_US',
          'Content-Type': 'application/json',
        },
      };

      const userReq = https.request(options, userRes => {
        let userData = '';

        userRes.on('data', chunk => {
          userData += chunk;
        });

        userRes.on('end', () => {
          console.log('User info response status:', userRes.statusCode);
          console.log('User info response:', userData);
          res.writeHead(userRes.statusCode, {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          });
          res.end(userData);
        });
      });

      userReq.on('error', error => {
        console.error('Error fetching user info:', error);
        res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ error: 'user_info_failed', error_description: error.message }));
      });

      userReq.end();

    } catch (error) {
      console.error('Parse error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ error: 'invalid_request', error_description: 'Invalid JSON body' }));
    }
  });
}

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS);
    res.end();
    return;
  }

  // Handle token exchange endpoint
  if (req.method === 'POST' && req.url === '/token-exchange') {
    handleTokenExchange(req, res);
    return;
  }

  // Handle user info endpoint
  if (req.method === 'POST' && req.url === '/user-info') {
    handleUserInfo(req, res);
    return;
  }

  // 404 for any other routes
  res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify({ error: 'not_found', error_description: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`\n🚗 Uber Auth API Server running at http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     POST /token-exchange - Exchange auth code for tokens`);
  console.log(`     POST /user-info - Fetch user info with access token`);
  console.log(`   Token endpoint: ${TOKEN_ENDPOINT}`);
  console.log(`   Redirect URI: ${REDIRECT_URI}\n`);
});
