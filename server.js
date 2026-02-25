// =========================================================================
//  SERVER ENTRY POINT
// =========================================================================
//  This file wires together:
//    • backend/   — Express routes, OAuth2+PKCE logic, session, Uber API calls
//    • frontend/  — Static HTML pages, CSS, and browser-side JS
//
//  See the folder structure below for a clear FE / BE split.
//
//  Project Structure:
//  ┌──────────────────────────────────────────────────────────────────────┐
//  │                                                                      │
//  │  server.js  ← you are here (entry point — wires everything)          │
//  │                                                                      │
//  │  backend/                  ← runs on the SERVER                      │
//  │    config.js               — Uber credentials, session config        │
//  │    pkce.js                 — PKCE code_verifier / code_challenge      │
//  │    uber-api.js             — server-to-server Uber API calls          │
//  │    sanitize.js             — strips sensitive fields before sending   │
//  │    routes.js               — Express route handlers                   │
//  │                                                                      │
//  │  frontend/                 ← runs in the BROWSER                     │
//  │    pages/                                                             │
//  │      login.html            — login page (links to /auth/login)       │
//  │      dashboard.html        — authenticated profile page               │
//  │    js/                                                                │
//  │      login.js              — error display + auto-redirect            │
//  │      dashboard.js          — fetches /api/me, renders profile         │
//  │    css/                                                               │
//  │      styles.css            — shared styles for both pages             │
//  │                                                                      │
//  └──────────────────────────────────────────────────────────────────────┘
// =========================================================================

const express = require('express');
const session = require('express-session');
const path    = require('path');

const { PORT, BASE_URL, SESSION } = require('./backend/config');
const routes                      = require('./backend/routes');

// ── Create Express app ──────────────────────────────────────────────────
const app = express();

// ── Session middleware ──────────────────────────────────────────────────
//    The session cookie is the ONLY thing the browser receives.
//    Tokens, code_verifier, and user UUID live exclusively in server memory.
app.use(session({
  secret:            SESSION.secret,
  name:              SESSION.cookieName,
  resave:            false,
  saveUninitialized: false,
  cookie:            SESSION.cookie,
}));

// ── Serve frontend static assets (JS, CSS) ──────────────────────────────
//    Files in  frontend/js/   → available at  /js/*
//    Files in  frontend/css/  → available at  /css/*
app.use('/js',  express.static(path.join(__dirname, 'frontend', 'js')));
app.use('/css', express.static(path.join(__dirname, 'frontend', 'css')));

// ── Mount backend routes ────────────────────────────────────────────────
app.use(routes);

// ── Start ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  Uber OIDC + OAuth2 + PKCE  Demo Server');
  console.log('══════════════════════════════════════════════');
  console.log('');
  console.log('  BACKEND  routes (run on the server):');
  console.log('    GET  /auth/start          → generate PKCE + state, return to FE SDK');
  console.log('    POST /auth/token-exchange  → exchange code + code_verifier for tokens');
  console.log('    GET  /api/me              → return sanitized user (no tokens/UUID)');
  console.log('    GET  /api/session         → return session metadata');
  console.log('    POST /auth/logout         → destroy session');
  console.log('');
  console.log('  FRONTEND pages (rendered in the browser, use Uber WebSDK):');
  console.log(`    ${BASE_URL}/           → login (loads SDK, auto-triggers SSO)`);
  console.log(`    ${BASE_URL}/callback   → receives auth code, sends to BE`);
  console.log(`    ${BASE_URL}/dashboard  → authenticated user profile`);
  console.log('');
  console.log('  Security:');
  console.log('    ✓ Uber WebSDK handles the authorization redirect');
  console.log('    ✓ PKCE (S256) — code_verifier generated + stored server-side only');
  console.log('    ✓ Tokens stored server-side only (HTTP-only session cookie)');
  console.log('    ✓ Encrypted UUID never sent to the browser');
  console.log('    ✓ State parameter for CSRF protection');
  console.log('══════════════════════════════════════════════');
  console.log('');
});
