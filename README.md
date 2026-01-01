# Threads Auto-Post

A production-grade, full-stack application for scheduling and managing Threads posts with Excel import support, event-driven scheduling, and multi-account management.

## Features

- **Full-Stack Monorepo** - Unified backend and frontend with TypeScript
- **Event-Driven Scheduling** - Zero-polling scheduler with BullMQ and Redis persistence
- **Excel Import** - Batch import posts from Excel files with Vietnamese column headers
- **Post Management** - Create, edit, schedule, and publish Threads posts
- **Threads Integration** - Native Graph API integration for post publishing
- **Multi-Account Support** - Manage multiple Threads accounts with per-account scheduling
- **Comment Handling** - Auto-publish optional comments after main post
- **Idempotency & Deduplication** - Exactly-once publishing semantics with duplicate detection
- **Job Monitoring** - Real-time queue health monitoring and job tracking
- **Platform Adapter Pattern** - Extensible design for adding Facebook, TikTok, and other platforms
- **Modern UI** - React + Shadcn UI + TailwindCSS with responsive design
- **Docker & Containerization** - Full Docker Compose setup for all services

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ or **Docker** (includes Docker Compose)
- **Threads API** credentials from Meta Developers

### Installation & Running (Docker - Recommended)

```bash
# Start all services
docker-compose up --build

# Access the application
Frontend:  http://localhost:3000
Backend:   http://localhost:3001
Health:    http://localhost:3001/health
```

### Installation & Running (Local Development)

```bash
# Install dependencies
npm install

# Start infrastructure (requires Docker for MongoDB/Redis)
docker-compose up mongodb redis

# Terminal 1: Start API server
npm run dev:backend

# Terminal 2: Start worker (separate process)
npm run dev:worker

# Terminal 3: Start frontend
npm run dev:frontend

# Access the application
Frontend:  http://localhost:5173
Backend:   http://localhost:3001
```

## 🏗️ Architecture

The system uses event-driven scheduling for zero-polling efficiency:

- **Frontend** (React + Vite): User interface for post creation and management
- **API Server** (Express): REST API for CRUD operations and scheduling
- **Worker** (BullMQ): Separate process for publishing posts to Threads
- **Database** (MongoDB): Stores posts, scheduling data, and credentials
- **Job Queue** (Redis + BullMQ): Delayed job scheduling with state persistence

**Key Innovation**: Instead of polling every 60 seconds, the system creates delayed BullMQ jobs that execute exactly when posts are due, reducing database queries by 95% and latency to 0-5 seconds.

**Port Mapping**:

- Frontend runs on port **3000** (nginx reverse proxy)
- Backend API runs on port **3001** (Express server)
- Frontend automatically proxies `/api/*` requests to backend

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design, scheduling algorithm, and component documentation.

## 📊 Tech Stack

### Frontend

- **React** 19 with TypeScript
- **Shadcn UI** components + TailwindCSS
- **Vite** bundler with Rolldown
- **Axios** for HTTP requests

### Backend

- **Node.js** + Express server
- **TypeScript** for type safety
- **MongoDB** with Mongoose ODM
- **Redis** + BullMQ for job scheduling
- **PM2** for process management (in Docker)

### Infrastructure

- **Docker & Docker Compose** for containerization
- **Nginx** for frontend serving and API proxying
- **Turbo** monorepo management

## 📝 Excel Import Format

**Sheet Name:** `Danh Sách Bài Post` (Vietnamese: "Post List")

**Required Columns:**

- `Nội dung bài post` - Post content (max 2,200 characters)
- `Loại bài viết` - Post type: `TEXT` | `IMAGE` | `CAROUSEL` | `VIDEO`

**Optional Columns:**

- `ID`, `Chủ đề`, `Trạng thái`, `Skip AI`, `Post ID` - Metadata
- `Comment` - Reply comment (posted after main post)
- `Link Video` - Single video URL
- `Link ảnh 1` through `Link ảnh 10` - Up to 10 image URLs
- `Gộp Link` - Merged URLs (pipe or comma-separated)

**Mapping Rules:**

1. Each row creates one post
2. All media URLs (video + images + merged) → `imageUrls[]`
3. Post type determines validation (media posts require at least one URL)

See [SETUP.md](./SETUP.md) for detailed Excel configuration and validation rules.

## 📡 API Endpoints

### Posts

- `GET /api/posts` - List all posts with filtering and pagination
- `GET /api/posts/:id` - Get single post details
- `POST /api/posts` - Create new post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/schedule` - Schedule post for publishing
- `POST /api/posts/:id/publish` - Manually publish post now
- `POST /api/posts/:id/cancel` - Cancel scheduled post

### Excel Operations

- `POST /api/excel/import` - Import posts from Excel file
- `POST /api/excel/check-duplicates` - Check for duplicate content before importing
- `POST /api/excel/bulk-schedule` - Schedule multiple posts within time range

### Monitoring

- `GET /api/monitoring/queue` - Queue health and statistics
- `GET /api/monitoring/jobs` - Recent job history

### Credentials (Multi-Account)

- `GET /api/credentials` - List linked Threads accounts
- `POST /api/credentials` - Add new account via OAuth
- `DELETE /api/credentials/:id` - Unlink account

## 🗂️ Project Structure

```
threads-auto-post/
├── apps/
│   ├── backend/                    # Node.js + Express backend
│   │   ├── src/
│   │   │   ├── adapters/           # Platform adapters (Threads, future: Facebook/TikTok)
│   │   │   ├── config/             # Database, Redis, logging configuration
│   │   │   ├── models/             # MongoDB schemas (Post, Credentials)
│   │   │   ├── queue/              # BullMQ queue setup
│   │   │   ├── routes/             # API route handlers
│   │   │   ├── services/           # Business logic (PostService, EventDrivenScheduler, etc.)
│   │   │   ├── index.ts            # API server entry point
│   │   │   └── worker.ts           # Worker process (separate from API)
│   │   ├── tests/                  # Integration tests with vitest
│   │   ├── Containerfile           # Container image for backend
│   │   ├── ecosystem.config.cjs    # PM2 process config
│   │   └── package.json
│   │
│   └── frontend/                   # React + Vite frontend
│       ├── src/
│       │   ├── components/         # React components (PostsList, SchedulerModal, etc.)
│       │   ├── hooks/              # Custom hooks (usePostList, useScheduler, etc.)
│       │   ├── lib/                # API client and utilities
│       │   ├── App.tsx             # Main app component
│       │   └── main.tsx            # Entry point
│       ├── public/                 # Static assets
│       ├── Dockerfile             # Frontend container image
│       ├── nginx.conf             # Nginx proxy configuration
│       └── package.json
│
├── docker-compose.yml             # Full stack orchestration
├── ARCHITECTURE.md                # System design and implementation guide
├── SETUP.md                       # Detailed setup, configuration, and troubleshooting
├── copilot-instructions.md        # AI agent coding guidance
├── package.json                   # Monorepo root
├── turbo.json                     # Turbo configuration
└── tsconfig.json                  # Root TypeScript config
```

## ⚙️ Configuration

### Environment Variables

See [SETUP.md - Environment Configuration](./SETUP.md#environment-configuration) for all available variables.

**Critical Variables:**

```bash
# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Database & Cache
MONGODB_URI=mongodb://localhost:27017/threads-post-scheduler
REDIS_HOST=localhost
REDIS_PORT=6379

# Threads API (get from Meta Developers)
THREADS_CLIENT_ID=your_meta_app_id
THREADS_CLIENT_SECRET=your_meta_app_secret
THREADS_ACCESS_TOKEN=your_access_token  # For default account (optional)
THREADS_USER_ID=your_threads_user_id    # For default account (optional)

# Scheduler
USE_EVENT_DRIVEN_SCHEDULER=true
SCHEDULER_BATCH_WINDOW_MS=5000

# Timezone (do NOT change without updating all date handling)
TZ=Asia/Ho_Chi_Minh
```

### Threads OAuth Setup

1. **Create Meta App** at https://developers.facebook.com/
2. **Get Credentials**: App ID and App Secret from app settings
3. **Configure Redirect URI**: Add `http://localhost:3001/api/credentials/callback`
4. **Update .env** with `THREADS_CLIENT_ID` and `THREADS_CLIENT_SECRET`
5. **Link Account** via app UI (Settings → Credentials → Link Threads Account)

See [SETUP.md - Threads OAuth Setup](./SETUP.md#threads-oauth-setup) for step-by-step instructions.

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run integration tests (requires MongoDB + Redis)
npm run test:integration

# Watch mode
npm run test:watch

# With UI
npm run test:ui
```

**Integration Tests** verify:

- Post CRUD operations and scheduling
- Event-driven scheduler behavior
- Job queue processing
- Idempotency and duplicate detection

See [SETUP.md - Testing](./SETUP.md#testing) for detailed test setup and running instructions.

## 🔄 Scheduling & Execution

The system supports multiple scheduling patterns:

- **ONCE** - Single post at specified date/time
- **WEEKLY** - Recurring on specific weekdays at specified time
- **MONTHLY** - Recurring on specified day of month at specified time
- **DATE_RANGE** - Daily within a date range at specified time

**Event-Driven Execution:**

1. User schedules post with time/pattern
2. System creates BullMQ delayed job (not polling!)
3. Job executes exactly when due (within 5-second batch window)
4. Worker publishes to Threads API
5. Status updates via WebSocket-ready API

**Failure Recovery:**

- Automatic retry with exponential backoff (3 attempts default)
- Comment failures don't fail post (separate retry)
- Execution locks prevent concurrent publishing of same post
- Redis persistence survives worker/server restarts

## 🛡️ Production Features

- **Idempotency** - Exactly-once semantics with content hashing and execution locks
- **Deduplication** - Detects duplicate posts within 24-hour window
- **Rate Limiting** - Respects Threads API quotas (configurable)
- **Graceful Shutdown** - Completes in-flight jobs before restart
- **Stalled Job Recovery** - Auto-detects and recovers stuck jobs
- **Comprehensive Logging** - Structured logs for debugging

## 🐛 Troubleshooting

**Common Issues:**

1. **MongoDB Connection Failed**

   ```bash
   # Check if MongoDB is running
   docker-compose ps mongodb
   # View logs
   docker-compose logs mongodb
   ```

2. **Worker Not Processing Posts**

   ```bash
   # Ensure worker is running
   npm run dev:worker
   # Check logs for errors
   docker-compose logs backend
   ```

3. **Scheduled Posts Not Publishing**
   - Verify post is in SCHEDULED status
   - Check scheduled time is in the future
   - Ensure worker process is running
   - Review logs: `docker-compose logs backend | grep -i scheduler`

See [SETUP.md - Troubleshooting](./SETUP.md#troubleshooting) for detailed solutions to common problems.

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture, event-driven scheduling algorithm, component design
- **[SETUP.md](./SETUP.md)** - Installation, configuration, Docker, OAuth, testing, troubleshooting
- **[copilot-instructions.md](./copilot-instructions.md)** - AI agent coding guidance and codebase patterns

## 🔌 Platform Adapter Pattern

The system is designed for extensibility. To add a new platform (e.g., Facebook, TikTok):

1. **Create Adapter** - Extend `BasePlatformAdapter`

   ```typescript
   class FacebookAdapter extends BasePlatformAdapter {
     async publishPost(data: PublishPostData): Promise<PublishResult>;
     async validateMedia(url: string): Promise<boolean>;
     getName(): string {
       return "Facebook";
     }
   }
   ```

2. **Update PostService** - Route posts by platform
3. **Add Models** - Facebook-specific credential schema
4. **Test Integration** - Verify end-to-end publishing

No changes needed to core scheduler, queue, or worker logic.

## 🌍 Localization & Timezone

- **Timezone**: Fixed to `Asia/Ho_Chi_Minh` throughout
- **Excel Headers**: Vietnamese column names expected
- **UI Language**: English (easily adaptable)
- **Date Handling**: Always uses configured timezone for scheduling

To change timezone, update `TZ` in `.env` and review all date handling in `DateService` and scheduling logic.

## 📄 License

MIT

## 🤝 Contributing

1. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for design patterns
2. Check [SETUP.md](./SETUP.md) for local development setup
3. Read [copilot-instructions.md](./copilot-instructions.md) for code style
4. Write tests for new features
5. Submit PR with clear description

---

**Last Updated**: December 2024  
**Maintainers**: Development Team  
**Status**: Production-Ready POC
