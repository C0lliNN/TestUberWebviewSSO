# Uber OIDC Authentication Demo

A simple vanilla JavaScript web application for authenticating with Uber using their OIDC (OpenID Connect) flow.

## Setup

### 1. Register Your Uber App

1. Go to [Uber Developer Dashboard](https://developer.uber.com/dashboard)
2. Create a new application or select an existing one
3. Note your **Client ID**

### 2. Configure Redirect URIs

In your Uber Developer Dashboard, add the following:

- **Redirect URI**: `http://localhost:8080/callback.html` (for local development)
- **Origin URI**: `http://localhost:8080`

For production, replace with your actual domain.

### 3. Update Configuration

Open `index.html` and update the configuration:

```javascript
const CONFIG = {
  clientId: 'YOUR_CLIENT_ID',  // Replace with your actual Client ID
  redirectURI: window.location.origin + '/callback.html',
  scope: 'openid profile',
};
```

## Running the Application

### Using Node.js (Recommended)

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Then open `http://localhost:8080` in your browser.

### Alternative Methods

**Using Python:**
```bash
python -m http.server 8080
```

**Using npx (no install):**
```bash
npx serve -p 8080
```

## How It Works

1. User clicks "Auth with Uber" button
2. Uber's authentication popup opens
3. User logs in with their Uber credentials
4. Upon successful authentication, an ID token is returned
5. The ID token is parsed to display user information

## Files

- `index.html` - Main application with auth button and styling
- `callback.html` - Handles the OAuth redirect callback

## Configuration Options

In `index.html`, you can configure:

- `clientId` - Your Uber application's Client ID
- `redirectURI` - Where Uber redirects after authentication
- `scope` - OAuth scopes to request (e.g., `openid profile email`)
- `uxMode` - Either `'popup'` or `'redirect'`

## Security Notes

- The `state` parameter is automatically generated to prevent CSRF attacks
- The `nonce` parameter is included to prevent replay attacks
- Always validate tokens on your backend in production
- Never expose your Client Secret in frontend code

## Resources

- [Uber Developer Documentation](https://developer.uber.com/docs)
- [Uber Consumer Identity OIDC](https://developer.uber.com/docs/consumer-identity/oidc/web)
