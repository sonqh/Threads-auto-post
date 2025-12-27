# 🔐 Threads OAuth Setup Guide

Quick reference for setting up Threads OAuth authentication.

## What You Need

| Credential            | Where to Get           | Purpose                               |
| --------------------- | ---------------------- | ------------------------------------- |
| **Client ID**         | Meta Developer Console | Identify your app to Meta             |
| **Client Secret**     | Meta Developer Console | Authenticate your app (keep private!) |
| **Redirect URI**      | Set in your app        | Where Meta redirects after user login |
| **User Access Token** | OAuth flow result      | Call Threads API on user's behalf     |
| **User ID**           | OAuth flow result      | Which user's account to post to       |

## Step 1: Create Meta App

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Log in or sign up
3. Click "My Apps" → "Create App"
4. Choose app type: **Business** or **Consumer**
5. Fill in app details
6. Your app is created!

## Step 2: Add Threads to Your App

1. In your app dashboard, click "Add Product"
2. Search for "Threads"
3. Click "Add" on the Threads card
4. Complete setup wizard

## Step 3: Get OAuth Credentials

1. Go to your app's **Settings > Basic**
2. Copy **App ID** → save as `THREADS_CLIENT_ID`
3. Copy **App Secret** → save as `THREADS_CLIENT_SECRET` (keep private)
4. You now have OAuth credentials

## Step 4: Set Redirect URI

1. In your app's Threads settings, find "Valid OAuth Redirect URIs"
2. Add your backend callback URL:
   - **Development:** `http://localhost:3001/api/credentials/callback`
   - **Production:** `https://yourdomain.com/api/credentials/callback`
3. Save settings

## Step 5: Update .env File

```bash
# apps/backend/.env

THREADS_CLIENT_ID=123456789
THREADS_CLIENT_SECRET=your_app_secret_here
THREADS_REDIRECT_URI=http://localhost:3001/api/credentials/callback
```

## Step 6: Test OAuth Flow

1. Start your backend: `npm run dev:backend`
2. Start your frontend: `npm run dev:frontend`
3. Click "Login with Threads" button
4. You'll be redirected to Meta login
5. Authorize your app
6. You'll be redirected back with a token
7. Check that `THREADS_USER_ID` and `THREADS_ACCESS_TOKEN` are in database

## Environment Variables Reference

### OAuth Credentials (Required for Login)

```bash
THREADS_CLIENT_ID=your_app_id
THREADS_CLIENT_SECRET=your_app_secret
THREADS_REDIRECT_URI=http://localhost:3001/api/credentials/callback
```

### User Access Credentials (After Login)

```bash
THREADS_USER_ID=user_id_from_oauth
THREADS_ACCESS_TOKEN=access_token_from_oauth
THREADS_REFRESH_TOKEN=refresh_token_from_oauth  # optional
```

### API Settings

```bash
THREADS_API_VERSION=v1.0
```

## OAuth Token Expiry

- **Access Token**: 1 hour
- **Refresh Token**: 60 days
- **Long-lived Access Token**: Can request in token exchange

## Database Storage

Credentials are encrypted and stored in MongoDB:

```typescript
// ThreadsCredential model
{
  clientId: string; // Your app ID
  clientSecret: string; // Your app secret (encrypted)
  accessToken: string; // Current access token (encrypted)
  refreshToken: string; // Refresh token (encrypted)
  threadsUserId: string; // User's Threads ID
  expiresAt: Date; // When access token expires
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}
```

## Troubleshooting

### "Invalid redirect URI"

- Check that your redirect URI exactly matches what's in Meta app settings
- Include protocol (http:// or https://)
- No trailing slashes unless in Meta settings

### "Client secret not found"

- Ensure `THREADS_CLIENT_SECRET` is set in `.env`
- Don't commit `.env` to git
- Use environment variables in production

### "User not authenticated"

- Check that tokens are being saved to database
- Verify tokens haven't expired
- Try refreshing token if available

### "API call returns 401 Unauthorized"

- Access token has expired
- Need to refresh using refresh token
- Or ask user to login again

## Production Checklist

- [ ] App approved by Meta (may need review)
- [ ] THREADS_CLIENT_SECRET securely stored (not in .env)
- [ ] Tokens encrypted in database
- [ ] HTTPS enabled for redirect URI
- [ ] Regular token refresh implemented
- [ ] Error handling for expired tokens
- [ ] User can refresh credentials
- [ ] Tokens never logged or exposed

## Useful Links

- [Meta Developer Console](https://developers.facebook.com/apps)
- [Threads API Documentation](https://developers.facebook.com/docs/threads)
- [OAuth 2.0 Spec](https://tools.ietf.org/html/rfc6749)
- [Threads Graph API Reference](https://developers.facebook.com/docs/threads/reference)

## Next Steps

1. Complete Meta app setup
2. Update `.env` with your credentials
3. Test the OAuth flow
4. Implement token refresh if needed
5. Deploy to production

See [CONFIG_GUIDE.md](./CONFIG_GUIDE.md) for more details on configuration options.
