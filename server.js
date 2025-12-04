const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8081;

// ============================================
// CONFIGURATION - Replace with your credentials
// ============================================
const CLIENT_ID = 'GLd7MAvJLchMHFjBl9a4Unieo13kCBi9';
const CLIENT_SECRET = '3S4TrbvcgIsY6LwvJrAfk0Sytsyq1JKlBKvrd9lq';  // Replace with your actual client secret
const REDIRECT_URI = 'http://localhost:8081/callback.html';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
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

      const postData = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code: code,
      }).toString();

      const options = {
        hostname: 'auth.uber.com',
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
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(tokenData);
        });
      });

      tokenReq.on('error', error => {
        console.error('Error exchanging code for token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'token_exchange_failed', error_description: error.message }));
      });

      tokenReq.write(postData);
      tokenReq.end();

    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_request', error_description: 'Invalid JSON body' }));
    }
  });
}

// Serve static files
function serveStaticFile(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found - serve index.html
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Server Error');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

const server = http.createServer((req, res) => {
  // Handle token exchange endpoint
  if (req.method === 'POST' && req.url === '/token-exchange') {
    handleTokenExchange(req, res);
    return;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Serve static files
  serveStaticFile(req, res);
});

server.listen(PORT, () => {
  console.log(`\n🚗 Uber Auth Demo running at http://localhost:${PORT}`);
  console.log(`\n⚠️  Make sure to set your CLIENT_SECRET in server.js\n`);
});
