# Threads Auto-Post

Production-ready post scheduler for Meta Threads with multi-account support, Excel import, and zero-polling event-driven scheduling.

---

## 🚀 Quick Start

**Docker (Recommended)**:
```bash
docker-compose up --build
```

**Local Development**:
```bash
npm install
docker-compose up mongodb redis -d
npm run dev:backend   # Terminal 1
npm run dev:worker    # Terminal 2
npm run dev:frontend  # Terminal 3
```

Access: **Frontend** http://localhost:3000 | **API** http://localhost:3001

---

## ✨ Features

- **Zero-Polling Scheduler** - Event-driven job execution reduces DB queries by 95%
- **Multi-Account** - OAuth 2.0 credential management for unlimited accounts
- **Excel Import** - Batch create posts from spreadsheet
- **Recurring Posts** - ONCE, WEEKLY, MONTHLY, DATE_RANGE patterns
- **Production-Ready** - Idempotency, retries, monitoring, graceful shutdown

---

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical design, setup, testing, troubleshooting
- **[BUSINESS_FEATURES.md](./BUSINESS_FEATURES.md)** - Feature implementation, data flows, UI/UX

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Shadcn UI, Tailwind |
| Backend | Node.js 20+, Express, TypeScript |
| Database | MongoDB (Mongoose) |
| Queue | Redis + BullMQ |
| Infrastructure | Docker, Docker Compose, PM2 |
| Monorepo | Turbo |

---

## 📋 Configuration

**Backend** (`apps/backend/.env`):
```bash
PORT=3001
MONGODB_URI=mongodb://localhost:27017/threads-post-scheduler
REDIS_HOST=localhost
REDIS_PORT=6379
TZ=Asia/Ho_Chi_Minh

# Threads OAuth
THREADS_CLIENT_ID=your_meta_app_id
THREADS_CLIENT_SECRET=your_meta_app_secret
THREADS_REDIRECT_URI=http://localhost:3001/api/credentials/callback

# Scheduler
USE_EVENT_DRIVEN_SCHEDULER=true
SCHEDULER_BATCH_WINDOW_MS=5000
```

**Frontend** (`apps/frontend/.env`):
```bash
VITE_API_URL=http://localhost:3001
```

---

## 🔧 Setup

### 1. Threads OAuth

1. Create app at [Meta Developers](https://developers.facebook.com/)
2. Add "Threads API" product
3. Set permissions: `threads_basic`, `threads_content_publish`
4. Configure redirect URI: `http://localhost:3001/api/credentials/callback`
5. Copy App ID/Secret to `.env`

### 2. Link Account

1. Navigate to **Settings → Accounts**
2. Click **"Link Threads Account"**
3. Complete OAuth flow

---

## 📖 Usage

### Create Posts

**Manual**: Posts tab → Create Post → Fill form → Save

**Excel**: Import tab → Upload file → Review → Import

**Excel Format**:
- Sheet: `Danh Sách Bài Post`
- Columns: `Nội dung bài post`, `Loại bài viết`, `Link ảnh 1-10`, `Comment`

### Schedule Posts

1. Select post → Click **Schedule**
2. Choose pattern (ONCE/WEEKLY/MONTHLY/DATE_RANGE)
3. Set date/time
4. Select account
5. Confirm

### Bulk Operations

- Select multiple posts (checkboxes)
- Use toolbar: **Bulk Schedule**, **Edit Status**, **Delete**, **Cancel**

---

## 🧪 Testing

```bash
npm run test                # All tests
npm run test:integration    # Integration tests
npm run test:watch          # Watch mode
npm run test:ui             # Vitest UI
```

---

## 🐛 Troubleshooting

**MongoDB connection failed**:
```bash
docker-compose ps mongodb
docker-compose logs mongodb
docker-compose restart mongodb
```

**Worker not processing**:
```bash
npm run dev:worker
docker-compose logs backend | grep -i worker
```

**Posts stuck in PUBLISHING**:
```bash
cd apps/backend
npm run cleanup-stuck-posts
```

**OAuth callback fails**:
- Verify `THREADS_REDIRECT_URI` matches Meta app settings
- Check `THREADS_CLIENT_ID` and `THREADS_CLIENT_SECRET`

See [ARCHITECTURE.md → Troubleshooting](./ARCHITECTURE.md#troubleshooting) for more solutions.

---

## 📂 Project Structure

```
apps/
├── backend/          # Express API + Worker
│   ├── src/
│   │   ├── adapters/      # Threads integration
│   │   ├── services/      # Business logic
│   │   ├── routes/        # API endpoints
│   │   ├── models/        # MongoDB schemas
│   │   ├── queue/         # BullMQ setup
│   │   ├── index.ts       # API server
│   │   └── worker.ts      # Job processor
│   └── tests/        # Integration tests
│
└── frontend/         # React + Vite UI
    └── src/
        ├── components/    # UI components
        ├── hooks/         # Custom hooks
        ├── context/       # State management
        └── lib/           # API client
```

---

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  React UI   │────▶│  Express    │────▶│  MongoDB    │
│  (Port 5173)│     │  API (3001) │     │  (27017)    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  BullMQ +   │
                    │  Redis      │
                    │  (6379)     │
                    └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Worker     │────▶│  Threads    │
                    │  Process    │     │  API        │
                    └─────────────┘     └─────────────┘
```

**Event-Driven Scheduling**: Delayed BullMQ jobs eliminate polling, reducing latency to 0-5 seconds and database load by 95%.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design.

---

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details

---

## 📞 Support

- **Technical**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Features**: [BUSINESS_FEATURES.md](./BUSINESS_FEATURES.md)
- **Issues**: [GitHub Issues](<your-repo>/issues)

---

**Version**: 2.0  
**Last Updated**: February 2026  
**Status**: Production-Ready
