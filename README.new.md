# Threads Post Scheduler POC

A full-stack application for scheduling and managing Threads posts with Excel import support.

## Features

**Full-Stack Monorepo** - Turbopack for unified backend and frontend development  
 **Excel Import** - Import posts from Excel with Vietnamese column names  
 **Post Scheduling** - Schedule posts using BullMQ and Redis  
 **Threads Integration** - Publish to Threads using the Graph API  
 **Platform Adapter Pattern** - Extensible design for future platforms (Facebook, TikTok)  
 **Modern UI** - Built with React, Shadcn UI, and TailwindCSS  
 **Containerization** - Podman support for MongoDB and Redis

## Quick Start

### Prerequisites

- Node.js 20+
- Podman (or Docker)
- Threads API credentials

### Installation

```bash
# Run the installation script
./install.sh

# Or manually:
npm install
npm run install:all
```

### Configuration

1. Update `apps/backend/.env` with your Threads API credentials
2. See [SETUP.md](./SETUP.md) for detailed configuration

### Start Development

```bash
# Start infrastructure
podman-compose up -d mongodb redis

# Option 1: Run all services with Turbopack
npm run dev

# Option 2: Run services individually
npm run dev:backend  # Terminal 1
npm run dev:worker   # Terminal 2
npm run dev:frontend # Terminal 3
```

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **API Health**: http://localhost:3001/health

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   React UI  │────→│  Express API │────→│   MongoDB    │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                           ↓
                    ┌──────────────┐
                    │    BullMQ    │
                    │   (Redis)    │
                    └──────────────┘
                           │
                           ↓
                    ┌──────────────┐     ┌──────────────┐
                    │    Worker    │────→│  Threads API │
                    └──────────────┘     └──────────────┘
```

## Tech Stack

### Frontend

- React 19
- Shadcn UI + TailwindCSS
- Vite (Rolldown)
- TypeScript

### Backend

- Node.js + Express
- MongoDB (Mongoose)
- Redis + BullMQ
- TypeScript

### Infrastructure

- Podman (containerization)
- Turbopack (monorepo)

## Excel Import Format

Sheet name: **Danh Sách Bài Post**

Required columns:

- **Nội dung bài post** - Post content (required)
- **Loại bài viết** - Post type: TEXT | IMAGE | CAROUSEL | VIDEO (required)

Optional columns:

- ID, Chủ đề, Trạng thái, Skip AI, Post ID, Comment, Link Video
- Link ảnh 1 through Link ảnh 10, Gộp Link

## API Endpoints

### Posts

- `GET /api/posts` - List posts
- `POST /api/posts` - Create post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/schedule` - Schedule post
- `POST /api/posts/:id/cancel` - Cancel schedule

### Excel

- `POST /api/excel/import` - Import from Excel
- `POST /api/excel/bulk-schedule` - Bulk schedule posts

## Project Structure

```
Thread-auto-post/
├── apps/
│   ├── backend/           # Express backend
│   │   ├── src/
│   │   │   ├── adapters/  # Platform adapters
│   │   │   ├── config/    # DB & Redis config
│   │   │   ├── models/    # Mongoose models
│   │   │   ├── queue/     # BullMQ setup
│   │   │   ├── routes/    # API routes
│   │   │   ├── index.ts   # Server
│   │   │   └── worker.ts  # Worker process
│   │   └── package.json
│   └── frontend/          # React frontend
│       ├── src/
│       │   ├── components/
│       │   ├── lib/
│       │   └── App.tsx
│       └── package.json
├── podman-compose.yml
├── turbo.json
├── install.sh
├── SETUP.md
└── README.md
```

## Development

### Run Tests

```bash
npm run test
```

### Build for Production

```bash
npm run build
```

### Deploy with Podman

```bash
podman-compose up -d
```

## Environment Variables

See [SETUP.md](./SETUP.md) for complete environment configuration.

Key variables:

- `THREADS_USER_ID` - Your Threads user ID
- `THREADS_ACCESS_TOKEN` - Threads API access token
- `MONGODB_URI` - MongoDB connection string
- `REDIS_HOST` - Redis host
- `TZ` - Timezone (Asia/Ho_Chi_Minh)

## Platform Adapter Pattern

The application uses a platform adapter pattern for easy extensibility:

```typescript
// Current: Threads
class ThreadsAdapter extends BasePlatformAdapter {
  async publishPost(data: PublishPostData): Promise<PublishResult>
}

// Future: Facebook, TikTok
class FacebookAdapter extends BasePlatformAdapter { ... }
class TikTokAdapter extends BasePlatformAdapter { ... }
```

## Timezone

All scheduling uses **Asia/Ho_Chi_Minh** timezone. Posts are published from Vietnam IP as required.

## Troubleshooting

See [SETUP.md](./SETUP.md) for common issues and solutions.

## License

MIT

## Contributing

This is a POC project. For production use, consider adding:

- Authentication & authorization
- User management
- Analytics & reporting
- AI content generation
- Rate limiting
- Enhanced error handling
- Comprehensive testing
