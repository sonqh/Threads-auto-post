# 🔧 Environment Configuration Guide

This document explains all environment variables used in the Threads Auto-Post application and how to configure them properly.

## Quick Start

The `.env` file has been created at `apps/backend/.env` with sensible defaults. For development, you only need to update:

```bash
THREADS_USER_ID=your_threads_user_id_here
THREADS_ACCESS_TOKEN=your_threads_access_token_here
```

## Configuration Loading

Environment variables are loaded in the following order (highest priority first):

1. **Command-line environment variables** (if set before running the app)
2. **.env file** (at `apps/backend/.env`)
3. **Hardcoded defaults** in the config module

All configuration is centralized in `apps/backend/src/config/env.ts` and exported as a typed `appConfig` object.

## Environment Variables Reference

### Server Configuration

| Variable      | Default                 | Required | Description                                         |
| ------------- | ----------------------- | -------- | --------------------------------------------------- |
| `PORT`        | `3001`                  | No       | Express server port                                 |
| `NODE_ENV`    | `development`           | No       | Environment: `development`, `production`, or `test` |
| `CORS_ORIGIN` | `http://localhost:5173` | No       | Allowed CORS origin for frontend                    |

**Example:**

```bash
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

---

### MongoDB Configuration

| Variable      | Default                                            | Required | Description               |
| ------------- | -------------------------------------------------- | -------- | ------------------------- |
| `MONGODB_URI` | `mongodb://localhost:27017/threads-post-scheduler` | No       | MongoDB connection string |

**Local MongoDB:**

```bash
MONGODB_URI=mongodb://localhost:27017/threads-post-scheduler
```

**MongoDB Atlas (Cloud):**

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/threads-post-scheduler?retryWrites=true&w=majority
```

---

### Redis Configuration

| Variable         | Default     | Required | Description                       |
| ---------------- | ----------- | -------- | --------------------------------- |
| `REDIS_HOST`     | `localhost` | No       | Redis server hostname             |
| `REDIS_PORT`     | `6379`      | No       | Redis server port                 |
| `REDIS_PASSWORD` | (empty)     | No       | Redis password (if auth required) |

**Local Redis:**

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

**Redis with Password:**

```bash
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

---

### Threads API Configuration ⭐

The Threads API uses **OAuth 2.0 authentication**. You need two sets of credentials:

#### 1. OAuth App Credentials (Required for login flow)

| Variable                | Required | Description                          |
| ----------------------- | -------- | ------------------------------------ |
| `THREADS_CLIENT_ID`     | **YES**  | Your Meta app ID                     |
| `THREADS_CLIENT_SECRET` | **YES**  | Your Meta app secret (keep private!) |
| `THREADS_REDIRECT_URI`  | No       | OAuth callback URL                   |

#### 2. Access Credentials (Set after OAuth authentication)

| Variable                | Required          | Description                           |
| ----------------------- | ----------------- | ------------------------------------- |
| `THREADS_USER_ID`       | Yes (after OAuth) | Your Threads user ID                  |
| `THREADS_ACCESS_TOKEN`  | Yes (after OAuth) | Access token for API calls            |
| `THREADS_REFRESH_TOKEN` | No                | Refresh token for long-lived access   |
| `THREADS_API_VERSION`   | No                | Threads API version (default: `v1.0`) |

**How to get OAuth credentials:**

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create or select your app
3. Add "Threads" product to your app
4. Go to **Settings > Basic**
5. Copy:
   - **App ID** → set as `THREADS_CLIENT_ID`
   - **App Secret** → set as `THREADS_CLIENT_SECRET` **Keep this private!**
6. Set **Valid OAuth Redirect URIs** in app settings to: `http://localhost:3001/api/credentials/callback`

**How to get access credentials:**

After setting up OAuth, users authenticate through your app:

1. User clicks "Login with Threads" on frontend
2. Frontend redirects to OAuth authorization URL
3. User approves your app's permissions
4. Backend receives authorization code
5. Backend exchanges code for `THREADS_ACCESS_TOKEN` and `THREADS_USER_ID`
6. Credentials are stored securely in database

**Development example:**

```bash
# OAuth App Credentials (from Meta Console)
THREADS_CLIENT_ID=123456789
THREADS_CLIENT_SECRET=abcdef1234567890secret
THREADS_REDIRECT_URI=http://localhost:3001/api/credentials/callback

# User Access (obtained after OAuth login)
THREADS_USER_ID=987654321
THREADS_ACCESS_TOKEN=EAABsbCS1iHgBO...
THREADS_REFRESH_TOKEN=EAABsbCS1iHgBO...
THREADS_API_VERSION=v1.0
```

**Production example:**

```bash
# Use strong secret from environment
THREADS_CLIENT_ID=${PROD_CLIENT_ID}
THREADS_CLIENT_SECRET=${PROD_CLIENT_SECRET}
THREADS_REDIRECT_URI=https://yourdomain.com/api/credentials/callback

# User credentials from database (encrypted)
THREADS_USER_ID=${DB_THREADS_USER_ID}
THREADS_ACCESS_TOKEN=${DB_THREADS_TOKEN}
```

---

### File Upload Configuration

| Variable        | Default           | Required | Description                       |
| --------------- | ----------------- | -------- | --------------------------------- |
| `MAX_FILE_SIZE` | `10485760` (10MB) | No       | Maximum upload file size in bytes |
| `UPLOAD_DIR`    | `./uploads`       | No       | Directory to store uploaded files |

```bash
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

---

### Application Settings

| Variable | Default            | Required | Description             |
| -------- | ------------------ | -------- | ----------------------- |
| `TZ`     | `Asia/Ho_Chi_Minh` | No       | Timezone for scheduling |

```bash
TZ=Asia/Ho_Chi_Minh
```

---

### Logging Configuration

| Variable    | Default | Required | Description                                 |
| ----------- | ------- | -------- | ------------------------------------------- |
| `LOG_LEVEL` | `info`  | No       | Log level: `debug`, `info`, `warn`, `error` |

```bash
LOG_LEVEL=info
```

---

### Job Queue Configuration

| Variable             | Default | Required | Description                      |
| -------------------- | ------- | -------- | -------------------------------- |
| `WORKER_CONCURRENCY` | `5`     | No       | Number of concurrent job workers |
| `JOB_TIMEOUT`        | `30000` | No       | Job timeout in milliseconds      |

```bash
WORKER_CONCURRENCY=5
JOB_TIMEOUT=30000
```

---

## Configuration Profiles

### Development Configuration

```bash
# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Database
MONGODB_URI=mongodb://localhost:27017/threads-post-scheduler

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Threads OAuth Credentials (from Meta Developer Console)
THREADS_CLIENT_ID=your_app_id
THREADS_CLIENT_SECRET=your_app_secret
THREADS_REDIRECT_URI=http://localhost:3001/api/credentials/callback

# Threads Access Credentials (after OAuth login)
THREADS_USER_ID=your_user_id
THREADS_ACCESS_TOKEN=your_access_token
THREADS_REFRESH_TOKEN=your_refresh_token

# Application
TZ=Asia/Ho_Chi_Minh
LOG_LEVEL=debug
WORKER_CONCURRENCY=5
```

### Production Configuration

```bash
# Server
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com

# Database (use Atlas or managed service)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/threads-post-scheduler?retryWrites=true&w=majority

# Redis (use managed service like ElastiCache or Redis Cloud)
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=strong_password_here

# Threads OAuth Credentials (from Meta Developer Console - Production)
THREADS_CLIENT_ID=${PROD_CLIENT_ID}
THREADS_CLIENT_SECRET=${PROD_CLIENT_SECRET}
THREADS_REDIRECT_URI=https://yourdomain.com/api/credentials/callback

# Threads Access Credentials (from database - encrypted)
THREADS_USER_ID=${DB_THREADS_USER_ID}
THREADS_ACCESS_TOKEN=${DB_THREADS_TOKEN}
THREADS_REFRESH_TOKEN=${DB_REFRESH_TOKEN}

# Redis (use managed service like ElastiCache)
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=strong_password_here

# Threads API
THREADS_USER_ID=your_production_user_id
THREADS_ACCESS_TOKEN=your_production_token

# Application
TZ=UTC
LOG_LEVEL=warn
WORKER_CONCURRENCY=10
```

---

## Configuration Validation

The application validates configuration at startup. If validation fails, you'll see errors like:

```
Configuration validation errors:
  - Invalid PORT: must be between 1 and 65535
  - MONGODB_URI is required
```

If Threads credentials are missing, you'll see a warning:

```
THREADS_USER_ID and THREADS_ACCESS_TOKEN are not configured.
Some features will not work without them.
```

---

## Setting Configuration

### Method 1: Edit .env File (Recommended for development)

```bash
# Edit the file
nano apps/backend/.env

# Update values
THREADS_USER_ID=your_actual_user_id
THREADS_ACCESS_TOKEN=your_actual_token
```

### Method 2: Environment Variables (Recommended for production)

```bash
# Export before running
export PORT=3000
export THREADS_USER_ID=your_user_id
export THREADS_ACCESS_TOKEN=your_token

npm run dev:backend
```

### Method 3: .env.local (For local overrides without committing)

```bash
# Create a local file that's gitignored
cp apps/backend/.env apps/backend/.env.local

# Edit .env.local with your personal credentials
# This file will override .env when dotenv loads it
```

---

## Troubleshooting Configuration

### "MongoDB connection error"

- Check `MONGODB_URI` is correct
- Verify MongoDB is running: `podman-compose ps`
- Test connection: `mongosh "mongodb://localhost:27017"`

### "Redis connection error"

- Check `REDIS_HOST` and `REDIS_PORT`
- Verify Redis is running: `podman-compose ps`
- Test connection: `redis-cli ping`

### "Threads credentials not configured"

- This is a warning, not an error
- Update `THREADS_USER_ID` and `THREADS_ACCESS_TOKEN` in `.env`
- Restart the backend: `npm run dev:backend`

### "Invalid PORT"

- Ensure PORT is between 1-65535
- Check if port is already in use: `lsof -i :3001`
- Change to a free port and update `PORT` in `.env`

---

## Security Best Practices

1. **Never commit `.env` to version control**

   - `.env` file is already in `.gitignore`

2. **Use strong, unique tokens for production**

   - Rotate tokens regularly
   - Use different tokens for development and production

3. **Protect your Threads credentials**

   - Don't share your access tokens
   - Use environment variables in production, not .env files

4. **Use HTTPS in production**

   - Ensure secure connections to API endpoints

5. **Validate and sanitize inputs**
   - The config module validates types and ranges

---

## Loading Configuration in Code

All environment variables are loaded through the centralized config module:

```typescript
import { appConfig } from "./config/env.js";

// Access configuration
console.log(appConfig.server.port); // 3001
console.log(appConfig.database.mongodbUri); // mongodb://...
console.log(appConfig.threads.userId); // your_user_id
console.log(appConfig.redis.host); // localhost
```

This provides:

- Type safety (TypeScript)
- Validation at startup
- Centralized configuration
- Easy testing with test configs

---

## Next Steps

1. Update your Threads credentials in `apps/backend/.env`
2. Start MongoDB and Redis: `podman-compose up -d`
3. Start the backend: `npm run dev:backend`
4. Verify in logs: " MongoDB connected" and " Redis connected"

See [SETUP.md](../SETUP.md) for detailed setup instructions.
