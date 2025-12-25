# Threads Post Scheduler — Implementation Summary

This document is a concise, bullet-focused summary of the Threads Post Scheduler POC: what was built, how to run it, key features, the technical stack, and a short migration guide for moving n8n workflow logic into this project.

## Quick Highlights

- Monorepo (backend + frontend) with working Excel import, post management UI, and scheduling worker
- BullMQ + Redis job queue with worker for delayed posts
- Platform adapter pattern with a `ThreadsAdapter` implementation
- Excel import that supports Vietnamese column names and maps media URLs

## Quick Start

- Install dependencies: `./install.sh`
- Configure Threads API: update `apps/backend/.env` with `THREADS_USER_ID` and `THREADS_ACCESS_TOKEN`
- Start infra: `podman-compose up -d mongodb redis`
- Run dev servers:
  - `npm run dev:backend` (API)
  - `npm run dev:worker` (worker)
  - `npm run dev:frontend` (UI)
- Frontend: http://localhost:5173 — Backend: http://localhost:3001

## What Has Been Implemented (by area)

- Architecture

  - Monorepo with turbopack-compatible layout
  - Separate backend, frontend, and worker processes

- Backend

  - Express + TypeScript API
  - Mongoose `Post` model with enums for post type/status
  - Excel import route with robust validation and media mapping
  - BullMQ + Redis job queue for scheduling
  - Worker process that publishes posts and updates status
  - Platform adapter pattern: `BasePlatformAdapter` + `ThreadsAdapter`

- Frontend

  - React + TypeScript UI with Shadcn + TailwindCSS
  - `ExcelImporter` and `PostsList` components
  - Posts table with multi-select, inline edit, bulk delete, export
  - UI controls for scheduling/canceling posts and viewing status

- Infrastructure
  - Podman compose file for MongoDB + Redis
  - Environment-driven configuration

## Key Features (bulleted)

- Excel import

  - Validates sheet name `Danh Sách Bài Post`
  - Maps Vietnamese column names to model fields
  - Supports image url columns (Link ảnh 1-10 → `mediaUrls[]`)
  - Reports row-level validation errors

- Post management

  - CRUD for posts
  - Filtering by status: `DRAFT`, `SCHEDULED`, `PUBLISHED`, `FAILED`
  - Schedule and cancel jobs; retry attempts (3)

- Scheduling & publishing

  - BullMQ delayed jobs handled by a worker
  - Asia/Ho_Chi_Minh timezone handling
  - Job tracking and status updates

- Platform adapter
  - `ThreadsAdapter` for TEXT, IMAGE, CAROUSEL, VIDEO
  - Media container creation and extensible adapter design

## Project Structure (top level)

```
Thread-auto-post/
├─ apps/
│  ├─ backend/
│  │  ├─ src/
│  │  │  ├─ adapters/ (BasePlatformAdapter, ThreadsAdapter)
│  │  │  ├─ config/ (database, redis)
│  │  │  ├─ models/ (Post.ts)
│  │  │  ├─ queue/ (postQueue.ts)
│  │  │  ├─ routes/ (posts.ts, excel.ts)
│  │  │  ├─ index.ts
│  │  │  └─ worker.ts
│  ├─ frontend/ (React + components, ExcelImporter, PostsList)
├─ podman-compose.yml
├─ install.sh
├─ SETUP.md
```

## Tech Stack

- Frontend: React, TypeScript, Vite, TailwindCSS, Shadcn UI, Axios
- Backend: Node.js, Express, TypeScript, Mongoose
- Queue: BullMQ + Redis
- Excel parsing: XLSX / ExcelJS
- Infra: Podman (MongoDB + Redis)

## Known Issues / Notes

- TypeScript lint warnings due to monorepo `tsconfig` roots and missing `node_modules` (run `npm run install:all`)
- Backend pagination UI exists — backend endpoint needs `skip/limit` implementation

## Short Migration Guide (migrating n8n workflow → this project)

Your project already provides the core building blocks (posts model, scheduling, Excel import). To migrate the n8n automation logic:

- Backend implementation

  - Add Threads API integration using the existing `Post` model and routes
  - Implement token management (store tokens in DB instead of Sheets)
  - Create a `ThreadsService` that routes by post type (text/image/carousel/video)
  - Use BullMQ jobs for scheduled posting rather than n8n schedules
  - Move media helpers (URL fixes, type detection) into `lib/utils` helpers

- Recommended API endpoints to add

  - `POST /posts/:id/publish` — trigger immediate publish for a post
  - `POST /threads/token/refresh` — handle token exchange/refresh
  - `GET /posts/scheduled` — return next scheduled post(s) (migrate selection logic from Sheets)

- Frontend updates

  - Add a "Publish to Threads" action in `PostsList`
  - Display publishing progress and status in the UI
  - Optional: richer scheduling controls (recurrence, timezone)

- Config & deployment
  - Move hardcoded endpoints/credentials to environment variables
  - Replace any Google Sheets logic with DB queries
  - Test against Threads API sandbox + add robust error logging

Start by implementing text-only posts, confirm job/worker flow, then incrementally add image/carousel/video handling.

## Next Steps (priority)

1. Implement backend pagination (`skip` / `limit` in posts query)
2. Add `ThreadsService` and token persistence
3. Wire `POST /posts/:id/publish` and integrate into worker job flow
4. Refactor `PostsList.tsx` into smaller components (`PostsTable`, `PostRow`, `LinksModal`)

---

If you want, I can now implement one of the next steps: add backend pagination to `apps/backend/src/routes/posts.ts` or scaffold the `ThreadsService`. Which should I start with?
