# Uber OIDC Authentication Demo

A reference implementation of **OAuth2 + OpenID Connect** authentication using the
[Uber WebSDK](https://developer.uber.com/docs/consumer-identity/oidc/web), with a
clear separation between **frontend** (browser) and **backend** (server).

All access tokens and the user's encrypted UUID are kept **exclusively on the server**.
The browser only receives an opaque HTTP-only session cookie.

---

## Architecture

```
 BROWSER (Frontend)                       SERVER (Backend)
 ──────────────────                       ────────────────
 Page loads  /
   │
   ├─ GET /auth/start ──────────────────► Generate nonce, store in session
   │                                      Return { clientId, redirectUri,
   │  ◄──────────────────────────────────           scope, nonce }
   │
   ├─ UberAPI.auth.init({ clientId, redirectURI, responseType:'code', ... })
   ├─ UberAPI.auth.signin()
   │   ↓
   │  Browser → Uber SSO  (auth.uber.com/oauth/v2/authorize)
   │  User signs in at Uber
   │  Uber → /callback?code=AUTH_CODE
   │
   ├─ POST /auth/token-exchange ────────► Verify session nonce
   │  Body: { code }                      POST auth.uber.com/oauth/v2/token
   │                                        + code + client_secret
   │                                      GET  api.uber.com/v3/me
   │                                        + Bearer access_token
   │                                      Store tokens + full user in session
   │  ◄──────────────────────────────────  Return { success, user: sanitized }
   │                                        ⚠️ NO tokens, NO UUID
   │
   └─ Redirect to /dashboard
        │
        ├─ GET /api/me ─────────────────► Return sanitized profile only
        │  ◄──────────────────────────────  { firstName, lastName, email, ... }
        │
        └─ POST /auth/logout ───────────► Destroy session + clear cookie
```

---

## Project Structure

```
server.js                    ← Entry point (wires backend + frontend)
│
├── backend/                 ← Runs on the SERVER
│   ├── config.js            — Environment variables, Uber endpoints, session config
│   ├── pkce.js              — Cryptographic helpers (nonce generation)
│   ├── uber-api.js          — Server-to-server calls (token exchange, /v3/me)
│   ├── sanitize.js          — Strips sensitive fields (UUID, tokens) before responding
│   └── routes.js            — All Express route handlers
│
└── frontend/                ← Runs in the BROWSER
    ├── pages/
    │   ├── login.html       — Loads Uber WebSDK, auto-triggers SSO
    │   ├── callback.html    — Receives auth code, sends to backend
    │   └── dashboard.html   — Displays sanitized user profile
    ├── js/
    │   ├── login.js         — Calls /auth/start, inits SDK, calls signin()
    │   ├── callback.js      — Extracts code from URL, POSTs to /auth/token-exchange
    │   └── dashboard.js     — Fetches /api/me, renders profile, logout button
    └── css/
        └── styles.css       — Shared styles for all pages
```

---

## What Runs Where

### Frontend (Browser)

| File | What it does |
|------|-------------|
| `login.js` | Fetches SDK config from `/auth/start`, calls `UberAPI.auth.init()` + `UberAPI.auth.signin()` |
| `callback.js` | Reads `?code=` from URL, sends it to `POST /auth/token-exchange` |
| `dashboard.js` | Calls `GET /api/me` to display the user profile, handles logout |

The frontend **never** has access to:
- Access tokens / refresh tokens / id tokens
- The user's encrypted UUID (`sub`)
- The `client_secret`

### Backend (Server)

| Route | What it does |
|-------|-------------|
| `GET /auth/start` | Generates a nonce (stored in session), returns SDK config to the frontend |
| `POST /auth/token-exchange` | Exchanges the authorization code for tokens using `client_secret` (server-to-server), fetches user profile from `api.uber.com/v3/me`, stores everything in the session, returns only sanitized user data |
| `GET /api/me` | Returns the sanitized user profile from the session (no tokens, no UUID) |
| `GET /api/session` | Returns non-sensitive session metadata (authenticated status, expiry) |
| `POST /auth/logout` | Destroys the session and clears the cookie |
| `GET /auth/logout` | Same as above, but redirects to `/` (convenience link) |

---

## Security Features

| Feature | How |
|---------|-----|
| **Tokens never leave the server** | Access tokens, refresh tokens, and id tokens are stored exclusively in the server-side session. The browser only receives an opaque session cookie. |
| **Encrypted UUID stays on the server** | The `sanitize.js` module strips `sub`, `uuid`, `rider_id`, and other sensitive fields before any data is returned to the frontend. |
| **HTTP-only session cookie** | The session cookie has `httpOnly: true`, so JavaScript on the page cannot read it. `sameSite: 'lax'` prevents it from being sent on cross-site requests. |
| **Nonce binding** | Each login flow generates a random nonce stored in the session. This ties the authorization request to the specific server session, preventing replay attacks. |
| **Confidential client** | Token exchange uses `client_secret` (server-to-server), so even if an attacker intercepts the authorization code, they cannot exchange it without the secret. |
| **No sensitive data in frontend JS** | The frontend code contains zero credentials. All config comes from the backend at runtime via `/auth/start`. |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | **Yes** | Public URL of the application (e.g. `https://my-app.onrender.com`). Used to derive the default `redirect_uri`. |
| `UBER_CLIENT_ID` | **Yes** | OAuth client ID from the [Uber Developer Dashboard](https://developer.uber.com/dashboard). |
| `UBER_CLIENT_SECRET` | **Yes** | OAuth client secret. **Never** commit this to source control. |
| `UBER_REDIRECT_URI` | No | Override the redirect URI. Defaults to `${BASE_URL}/callback`. |
| `UBER_AUTH_HOST` | No | Uber auth hostname. Defaults to `auth.uber.com`. |
| `UBER_API_HOST` | No | Uber API hostname. Defaults to `api.uber.com`. |
| `SESSION_SECRET` | No | Secret for signing session cookies. A random one is generated if not set. |
| `PORT` | No | Server port. Defaults to `8080`. |

The server **will not start** if `BASE_URL`, `UBER_CLIENT_ID`, or `UBER_CLIENT_SECRET` are missing.

---

## API Endpoints Used

| Uber Endpoint | Called by | Purpose |
|---------------|-----------|---------|
| `https://auth.uber.com/oauth/v2/authorize` | Uber WebSDK (frontend) | User authentication |
| `https://auth.uber.com/oauth/v2/token` | Backend (`uber-api.js`) | Exchange code for tokens |
| `https://api.uber.com/v3/me` | Backend (`uber-api.js`) | Fetch user profile |

---

## Resources

- [Uber Consumer Identity — OIDC Web](https://developer.uber.com/docs/consumer-identity/oidc/web)
- [Uber Consumer Identity — /v3/me API](https://developer.uber.com/docs/consumer-identity/references/api/v3/me-get)
- [Uber WebSDK Source](https://auth.uber.com/oauth/static/auth-v_1_2_0.js)
- [Uber Developer Dashboard](https://developer.uber.com/dashboard)
