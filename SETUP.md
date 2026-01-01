# Threads Auto-Post: Complete Setup Guide

This comprehensive guide covers everything needed to set up, configure, and run the Threads Auto-Post application.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Environment Configuration](#environment-configuration)
4. [Installation](#installation)
5. [Running the Application](#running-the-application)
6. [Docker Setup](#docker-setup)
7. [Threads OAuth Setup](#threads-oauth-setup)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

**macOS/Linux:**

```bash
chmod +x start-docker.sh
./start-docker.sh --build
```

**Windows:**

```bash
start-docker.bat
```

Or directly:

```bash
docker-compose up --build
```

Access at: **Frontend** http://localhost | **API** http://localhost:3001

---

## Prerequisites

### System Requirements

- Docker Desktop (includes Docker & Docker Compose)
- OR Node.js 20+ with npm
- Git

### Verify Installation

```bash
docker --version          # Docker 24.0+
docker-compose --version  # Docker Compose 2.0+
# OR
node --version           # Node 20+
npm --version            # npm 9+
```

### Ports Required

- **80** (Frontend - Nginx)
- **3001** (Backend API)
- **27017** (MongoDB)
- **6379** (Redis)

If ports conflict, modify `docker-compose.yml`.

---

## Environment Configuration

### Backend Environment Variables

Create `apps/backend/.env`:

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

# Timezone (DO NOT CHANGE without updating all date handling)
TZ=Asia/Ho_Chi_Minh

# Scheduling
USE_EVENT_DRIVEN_SCHEDULER=true
SCHEDULER_BATCH_WINDOW_MS=5000

# Rate Limiting
WORKER_CONCURRENCY=5
JOB_TIMEOUT=30000

# Threads API (Set after OAuth configuration)
THREADS_USER_ID=your_threads_user_id
THREADS_ACCESS_TOKEN=your_access_token
THREADS_CLIENT_ID=your_meta_app_id
THREADS_CLIENT_SECRET=your_meta_app_secret
THREADS_REDIRECT_URI=http://localhost:3001/api/credentials/callback
```

### Quick Configuration

**For Local Development:**

- Use defaults for MongoDB/Redis (local containers)
- Get Threads credentials below

**For Production:**

- Use MongoDB Atlas: `mongodb+srv://user:pass@cluster.mongodb.net/db`
- Use managed Redis service
- Set `NODE_ENV=production`

---

## Installation

### Option A: Using Docker (Recommended)

No Node.js installation needed!

```bash
cd /Users/sonquach/Documents/tools/threads-auto-post
docker-compose up --build
```

All services start automatically.

### Option B: Local Development

Install dependencies:

```bash
# Root
npm install

# Or individual workspaces
cd apps/backend && npm install
cd apps/frontend && npm install
```

Build TypeScript:

```bash
npm run build
```

---

## Running the Application

### Docker (Recommended)

```bash
# Start all services
docker-compose up --build

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Local Development (Without Docker)

**Terminal 1 - Infrastructure:**

```bash
docker-compose up mongodb redis
```

**Terminal 2 - API Server:**

```bash
npm run dev
```

**Terminal 3 - Worker:**

```bash
npm run dev:worker
```

**Terminal 4 - Frontend:**

```bash
npm run dev:frontend
```

---

## Docker Setup

### Architecture

```
Port 80 (Nginx Frontend)
  ├─ Serves React app
  └─ Proxies /api/* → backend:3001

Port 3001 (Express Backend + PM2)
  ├─ API Server
  └─ BullMQ Worker

MongoDB + Redis
  └─ Data persistence & job queue
```

### Services

| Service  | Port  | Image          | Health |
| -------- | ----- | -------------- | ------ |
| Frontend | 80    | nginx:alpine   | ✅     |
| Backend  | 3001  | node:20-alpine | ✅     |
| MongoDB  | 27017 | mongo:latest   | ✅     |
| Redis    | 6379  | redis:latest   | ✅     |

### Common Docker Commands

```bash
# Build without cache
docker-compose build --no-cache

# Start in background
docker-compose up -d

# Watch status
docker-compose ps

# Resource usage
docker stats

# Clean everything (keep volumes)
docker-compose down

# Clean everything (remove volumes)
docker-compose down -v

# Run command in container
docker-compose exec backend npm run build
```

### Rebuild Individual Services

```bash
# Backend only
docker-compose build backend --no-cache
docker-compose up backend

# Frontend only
docker-compose build frontend --no-cache
docker-compose up frontend

# All
docker-compose build --no-cache
docker-compose up
```

### View Logs

```bash
# All services
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100 backend

# Specific service
docker-compose logs -f backend
docker-compose logs -f mongodb
```

### Check Backend Processes

The backend runs both API and Worker via PM2:

```bash
# View running processes
docker-compose exec backend pm2 status

# View logs from PM2
docker-compose exec backend pm2 logs

# Restart a process
docker-compose exec backend pm2 restart api-server
```

---

## Threads OAuth Setup

### Step 1: Create Meta App

1. Go to [Meta Developers](https://developers.facebook.com/)
2. Create a new app (type: Business)
3. Add "Threads" product to the app
4. Get your **App ID** and **App Secret**

### Step 2: Configure OAuth

1. Go to Settings → Basic

   - Copy **App ID** → `THREADS_CLIENT_ID`
   - Copy **App Secret** → `THREADS_CLIENT_SECRET`

2. Go to Settings → Advanced

   - Add to "Valid OAuth Redirect URIs": `http://localhost:3001/api/credentials/callback`

3. Go to Threads → Basic Display
   - Enable "Threads API"
   - Add redirect URIs

### Step 3: Update .env

```bash
THREADS_CLIENT_ID=your_app_id_from_meta
THREADS_CLIENT_SECRET=your_app_secret_from_meta
THREADS_REDIRECT_URI=http://localhost:3001/api/credentials/callback
```

### Step 4: Get Access Token

1. User logs in via app UI (Credentials page)
2. OAuth flow redirects back with authorization code
3. Backend exchanges for access token
4. Token stored securely in MongoDB

### Token Refresh

Tokens expire after 60 days. To refresh:

```bash
# Manual refresh script
node apps/backend/scripts/refresh-token.js

# Or use UI: Settings → Credentials → Refresh
```

---

## Testing

### Run Tests

```bash
# All tests
npm run test

# Backend only
cd apps/backend && npm test

# Integration tests (requires MongoDB + Redis)
npm run test:integration

# Watch mode
npm run test:watch

# With UI
npm run test:ui
```

### Test Configuration

Tests use `.env.test`:

```bash
MONGODB_URI=mongodb://localhost:27017/threads-post-scheduler-test
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=test
```

### Writing Tests

Location: `apps/backend/tests/integration/`

Example:

```typescript
import { describe, it, beforeAll, afterAll } from "vitest";
import { testSetup } from "./setup";

describe("My Feature", () => {
  beforeAll(async () => await testSetup.setup());
  afterAll(async () => await testSetup.teardown());

  it("should do something", async () => {
    const post = await testSetup.createMockPost();
    // ... test logic
  });
});
```

---

## Troubleshooting

### Docker Won't Start

```bash
# Check Docker daemon
docker ps

# If fails, restart Docker Desktop

# View detailed errors
docker-compose logs
```

### Ports Already in Use

**Find what's using port:**

```bash
lsof -i :80   # Frontend
lsof -i :3001 # Backend
lsof -i :27017 # MongoDB
```

**Kill process (macOS/Linux):**

```bash
kill -9 <PID>
```

**Or change port in docker-compose.yml:**

```yaml
ports:
  - "8080:80" # Use 8080 instead of 80
```

### Services Won't Connect

```bash
# Check if services are healthy
docker-compose ps

# Wait 30 seconds and try again (health checks take time)

# View detailed logs
docker-compose logs mongodb
docker-compose logs redis
```

### MongoDB Connection Failed

```bash
# Check MongoDB is running
docker-compose ps mongodb

# View MongoDB logs
docker-compose logs -f mongodb

# Verify connection string
echo $MONGODB_URI
```

### Redis Connection Failed

```bash
# Check Redis is running
docker-compose ps redis

# View Redis logs
docker-compose logs -f redis

# Test Redis connection
docker-compose exec redis redis-cli ping
# Should return: PONG
```

### Database Locked

```bash
# Reset everything
docker-compose down -v

# Start fresh
docker-compose up --build
```

### Worker Not Processing Posts

```bash
# Check worker is running
docker-compose logs backend | grep -i worker

# Check for errors
docker-compose logs backend | grep -i error

# Verify scheduler is initialized
docker-compose logs backend | grep -i "scheduler"
```

### Frontend Blank Page

```bash
# Check Nginx logs
docker-compose logs frontend

# Verify React build succeeded
docker-compose logs frontend | grep -i build

# Rebuild
docker-compose build frontend --no-cache
docker-compose up frontend
```

---

## Next Steps

1. ✅ Start application (Docker or local)
2. ✅ Configure Threads OAuth credentials
3. ✅ Create first post via UI
4. ✅ Test scheduling a post
5. ✅ Monitor worker logs for publishing

For detailed architecture information, see [ARCHITECTURE.md](ARCHITECTURE.md).

### 2. Start Infrastructure (Podman)

```bash
# Start MongoDB and Redis
podman-compose up -d mongodb redis
```

### 3. Start Development Servers

```bash
# Terminal 1: Start backend API
npm run dev:backend

# Terminal 2: Start worker process
npm run dev:worker

# Terminal 3: Start frontend
npm run dev:frontend
```

Or use Turbopack to run all in parallel:

```bash
npm run dev
```

### 4. Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- API Health Check: http://localhost:3001/health

## Project Structure

```
Thread-auto-post/
├── apps/
│   ├── backend/          # Express backend
│   │   ├── src/
│   │   │   ├── adapters/    # Platform adapters (Threads, etc.)
│   │   │   ├── config/      # Database & Redis config
│   │   │   ├── models/      # Mongoose models
│   │   │   ├── queue/       # BullMQ queue setup
│   │   │   ├── routes/      # Express routes
│   │   │   ├── index.ts     # Main server
│   │   │   └── worker.ts    # Worker process
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/         # React frontend
│       ├── src/
│       │   ├── components/  # UI components
│       │   ├── lib/         # API client & utilities
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       └── vite.config.ts
├── podman-compose.yml    # Container orchestration
├── turbo.json            # Turbopack configuration
└── package.json          # Root package.json
```

## API Endpoints

### Posts

- `GET /api/posts` - List all posts
- `GET /api/posts/:id` - Get single post
- `POST /api/posts` - Create new post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/schedule` - Schedule a post
- `POST /api/posts/:id/cancel` - Cancel scheduled post

### Excel Import

- `POST /api/excel/import` - Import posts from Excel file
- `POST /api/excel/bulk-schedule` - Bulk schedule imported posts

## Excel Format

The Excel file must have a sheet named "Danh Sách Bài Post" with these columns:

- ID
- Chủ đề
- Nội dung bài post (required)
- Trạng thái
- Skip AI
- Post ID
- Loại bài viết (required: TEXT | IMAGE | CAROUSEL | VIDEO)
- Comment
- Link Video
- Link ảnh 1 through Link ảnh 10
- Gộp Link

**Note:** All media links (Link Video + Link ảnh 1..10 + Gộp Link) are merged into a single `imageUrls` array during import for unified media handling.

## Troubleshooting

### MongoDB Connection Issues

```bash
# Check if MongoDB is running
podman ps | grep mongodb

# View MongoDB logs
podman logs threads-mongodb
```

### Redis Connection Issues

```bash
# Check if Redis is running
podman ps | grep redis

# Test Redis connection
podman exec -it threads-redis redis-cli ping
```

### Worker Not Processing Jobs

1. Check Redis connection
2. Verify environment variables are set
3. Check worker logs for errors
4. Ensure scheduled time is in the future

## Production Deployment

### Using Podman

```bash
# Build and start all services
podman-compose up -d

# View logs
podman-compose logs -f

# Stop services
podman-compose down
```

### Environment Variables for Production

Update `podman-compose.yml` with your production credentials:

- THREADS_USER_ID
- THREADS_ACCESS_TOKEN
- MongoDB connection string
- Redis connection details

## License

MIT
