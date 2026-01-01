# Threads Auto-Post Codebase Guide

## Architecture Overview

This is a **Turbo monorepo** with separate backend worker and API server processes:

- **apps/backend**: Express API + BullMQ worker (separate processes)
- **apps/frontend**: React + Vite + Shadcn UI
- **Infrastructure**: MongoDB (posts), Redis (job queue), Docker Compose

### Critical Separation: API Server vs Worker

The backend runs **two separate processes**:

- `npm run dev`: API server ([src/index.ts](../apps/backend/src/index.ts)) - handles HTTP requests
- `npm run worker`: Job worker ([src/worker.ts](../apps/backend/src/worker.ts)) - consumes BullMQ jobs

**Never** call `threadsAdapter.publishPost()` from API routes. Publishing happens exclusively in the worker to maintain rate-limiting and retry logic. See [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed diagrams.

## Post Publishing & Comment Handling

Publishing is **two-phase**:

1. **Main post**: Worker calls `ThreadsAdapter.publishPost()`, waits for Threads API confirmation
2. **Comment (optional)**: After main post succeeds, if `post.comment` exists:
   - Post data includes `commentStatus` enum: `NONE`, `PENDING`, `POSTING`, `POSTED`, `FAILED`
   - Comment posts as reply to published post
   - If comment fails, post still succeeds (comment failure ≠ post failure)
   - Comments can be retried separately via `commentOnlyRetry` job flag

See [worker.ts](../apps/backend/src/worker.ts) `handleCommentOnlyRetry()` function for recovery logic and [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed flow diagrams.

## ThreadsAdapter Media Flow

[ThreadsAdapter.ts](../apps/backend/src/adapters/ThreadsAdapter.ts) handles media publishing:

1. **Image/video validation**: `validateMedia()` checks URL accessibility
2. **Container creation**: Creates temporary Threads media containers
3. **Status polling**: Waits for container `FINISHED` status (with timeout)
4. **Post creation**: Calls `threads_publish` endpoint with container IDs
5. **Link splitting**: Comments with multiple links split into separate posts (Threads limit)

See [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed flow diagrams.

## Adapter Pattern Implementation

[BasePlatformAdapter.ts](../apps/backend/src/adapters/BasePlatformAdapter.ts) defines the contract. `ThreadsAdapter` implements it. When adding Facebook/TikTok:

1. Create new adapter extending `BasePlatformAdapter`
2. Implement `publishPost()`, `validateMedia()`, `getName()`
3. Update [PostService.ts](../apps/backend/src/services/PostService.ts) to route by platform field

**Do not** modify core queue or scheduling logic when adding platforms.

## Scheduling Architecture

Two scheduler implementations work together:

**[EventDrivenScheduler.ts](../apps/backend/src/services/EventDrivenScheduler.ts)** (primary, zero-polling):

- Uses BullMQ delayed jobs - only triggers when posts are due
- Batch window: 5 seconds (executes all posts due within window together)
- No polling overhead; efficient for large post volumes
- Called from `PostService` when schedules are created/updated

**[SchedulerService.ts](../apps/backend/src/services/SchedulerService.ts)** (fallback, legacy):

- Polls every 60 seconds as safety net
- Finds posts with `status: SCHEDULED` and `scheduledAt <= now`
- Supports recurring patterns: `ONCE`, `WEEKLY`, `MONTHLY`, `DATE_RANGE`

Timezone is hardcoded to `Asia/Ho_Chi_Minh` throughout. Do not change without updating all date handling.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed scheduler diagrams and state machine.

## Idempotency & Duplicate Prevention

[IdempotencyService.ts](../apps/backend/src/services/IdempotencyService.ts) ensures exactly-once publishing:

- **Content hashing**: Detects duplicate posts (same content + media within 24h window)
- **Execution locks**: Prevents concurrent workers from publishing same post
- **Idempotency keys**: Survive worker crashes and job retries
- Lock timeout: 5 minutes default (configurable via `EXECUTION_LOCK_TIMEOUT_MS`)
- Duplication window: 24 hours default (configurable via `DUPLICATION_WINDOW_HOURS`)

Called early in worker job to prevent duplicate/concurrent execution. See [worker.ts](../apps/backend/src/worker.ts) lines ~30-80 and [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed flow diagrams.

## Excel Import Contract

Sheet: **"Danh Sách Bài Post"** (exact name, Vietnamese)

Headers (normalized to lowercase, single spaces):

- `nội dung bài post` → `content` (required)
- `loại bài viết` → `postType` (TEXT/IMAGE/CAROUSEL/VIDEO)
- `link ảnh 1` through `link ảnh 10` → `imageUrls[]`
- `link video` → `videoUrl`
- `comment` → `comment` (reply posted after main post)

See [ExcelService.ts](../apps/backend/src/services/ExcelService.ts) for full mapping. Headers must match exactly after normalization.

## Environment Configuration

Critical config order: [dotenv.config.ts](../apps/backend/src/config/dotenv.config.ts) **must** load before any imports referencing `process.env`. See [index.ts](../apps/backend/src/index.ts) lines 1-5.

Key variables (see [env.ts](../apps/backend/src/config/env.ts)):
- `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN`: API credentials
- `MONGODB_URI`: Database connection
- `REDIS_HOST`, `REDIS_PORT`: Queue backend
- `TZ=Asia/Ho_Chi_Minh`: Hardcoded timezone (do not change)

For complete setup instructions, see [SETUP.md](../SETUP.md).

## MongoDB Model Conventions

[Post.ts](../apps/backend/src/models/Post.ts) uses:

- Enums for `PostStatus`, `PostType`, `SchedulePattern` (uppercase values)
- `scheduledAt: Date` for one-time schedules
- `scheduleConfig: ScheduleConfig` for recurring patterns
- `publishingProgress` object tracks worker execution state

When querying, use enum values directly: `Post.find({ status: PostStatus.DRAFT })`.

## Frontend Data Fetching

Hooks pattern ([hooks/](../apps/frontend/src/hooks/)):

- `usePostList`: Pagination, filtering, bulk operations
- `usePost`: Single post CRUD
- `useScheduler`: Schedule UI logic
- `useThreadsPublish`: Manual publish triggers

All API calls go through [lib/api.ts](../apps/frontend/src/lib/api.ts). Never hardcode backend URLs in components.

## Development Workflow

**Start all services:**

```bash
npm run dev              # Both frontend + backend API (Turbo parallel)
npm run dev:worker       # Separate terminal - starts BullMQ worker
```

**With Docker:**

```bash
docker-compose up --build  # Full stack
```

The worker **must** run for scheduled posts to publish. API alone won't process jobs.

For complete setup instructions, see [SETUP.md](../SETUP.md).

## Testing

**Run tests:**

```bash
npm run test                    # Run all tests (Turbo)
cd apps/backend && npm test     # Run backend tests only
npm run test:integration        # Integration tests (requires MongoDB, Redis)
```

**Test setup** ([tests/integration/setup.ts](../apps/backend/tests/integration/setup.ts)):

- Uses `.env.test` for test database/Redis config
- Vitest framework with integration test patterns
- See [EventDrivenScheduler.test.ts](../apps/backend/tests/integration/EventDrivenScheduler.test.ts), [PostService.test.ts](../apps/backend/tests/integration/PostService.test.ts)

When adding new scheduler/worker logic, write integration tests that verify actual BullMQ job behavior.

## Rate Limiting & Retries

Worker config ([worker.ts](../apps/backend/src/worker.ts)):

- Concurrency: 5 jobs parallel
- Rate limit: 10 requests/minute
- Retries: 3 attempts with exponential backoff (2s base)

Do not increase rate limits without checking Threads API quotas.

## Documentation Policy

- **Skip auto-generated documentation** unless explicitly requested in the chat
- Only create documents when the user specifically asks for documentation, guides, or summaries
- Focus on code implementation first

## Code Modification Policy

- **Ask before making major changes** to existing code
- Describe what changes will be made and wait for confirmation if:
  - Refactoring core business logic
  - Changing data flow or architecture
  - Modifying API contracts
  - Altering database schema
- Small bug fixes and minor improvements can be applied directly without asking

## Code Organization Principles

- **Modular First**: Separate concerns into focused modules
  - One responsibility per function/component
  - Reusable utilities in separate files
  - Clear interfaces between modules
- **Business Logic First**: Organize code around business requirements
  - Domain logic before infrastructure
  - Business entities as primary design focus
  - Technical patterns serve business needs, not vice versa
- **Scalability**: Design for growth
  - Easy to extend without modifying existing code
  - Clear dependency paths
  - Testable in isolation

## Code Style

- Follow existing patterns in the codebase
- Use TypeScript strict mode
- Prefer composition over inheritance
- Keep functions/components small and focused
- Use meaningful names that reflect business intent
