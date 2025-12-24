# Environment Configuration

## Backend

Create `apps/backend/.env` file:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/threads-post-scheduler

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Threads API Configuration
THREADS_USER_ID=your_threads_user_id
THREADS_ACCESS_TOKEN=your_threads_access_token
THREADS_API_VERSION=v1.0

# Timezone
TZ=Asia/Ho_Chi_Minh

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

## Getting Threads API Credentials

1. Visit [Meta for Developers](https://developers.facebook.com/)
2. Create an app or use an existing one
3. Add Threads API product to your app
4. Get your User ID and Access Token from the Threads API dashboard
5. Add the credentials to your `.env` file

## Installation and Setup

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install all workspace dependencies
npm run install:all
```

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
