Build a full-stack POC Threads Post Scheduling Platform

## Agent Implementation Notes

- **Monorepo Management:** Use Turbopack to unify backend (Node.js + Express) and frontend (React) development, builds, and dependency management.
- **Backend Integration:** Extend the current frontend-only codebase by adding backend configuration and structure for API, scheduling, and worker processes.
- **Containerization:** Prefer Podman over Docker for local development, orchestration, and deployment.
- **UI Framework:** Use Shadcn UI components and TailwindCSS for a modern, maintainable, and rapid UI development experience.

## Tech Stack

- **Frontend:** React + Shadcn UI + TailwindCSS
- **Backend:** Node.js + Express
- **Database:** MongoDB (latest stable)
- **Queue/Scheduler:** Redis (latest stable) + BullMQ

## Functional Requirements

- Create and manage Threads posts from UI
- Import posts from Excel (.xlsx)
- Schedule posts to be published at a specific time
- Publish posts to Threads using Threads Graph API

### Excel Import Specification

- **Sheet name:** Danh Sách Bài Post
- **Columns (exact names, Vietnamese):**  
  ID, Chủ đề, Nội dung bài post, Trạng thái, Skip AI, Post ID, Loại bài viết, Comment, Link Video, Link ảnh 1–10, Gộp Link

#### Excel → Post Mapping Rules

1. Each row = 1 post
2. Link ảnh 1–10 + Link Video → `mediaUrls[]`
3. Loại bài viết → one of: `TEXT` | `IMAGE` | `CAROUSEL` | `VIDEO`

## Scheduling & Execution

- Each scheduled post is a delayed job in BullMQ
- A separate worker process consumes jobs and publishes posts
- Timezone: Asia/Ho_Chi_Minh
- Posts must be published from Vietnam IP (VN server or VN outbound proxy)

## Architecture Requirements

- **Platform Adapter Pattern:**  
  Implement a `ThreadsAdapter` first; design for easy addition of Facebook/TikTok adapters later without refactoring core logic.
- **Backend API:**  
  Handles CRUD posts, Excel import, and job scheduling.
- **Worker:**  
  Handles Threads API calls, media container creation, and post publishing.

## POC Scope

- Single user
- Threads only
- Basic UI
- No authentication, billing, analytics, or AI features

## Output Expected from Agent

- Project structure (React + Express, Turbopack monorepo)
- MongoDB schema/models
- Excel parsing & validation logic
- Scheduler & worker setup
- Threads adapter implementation
- Minimal runnable POC
