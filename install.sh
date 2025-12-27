#!/bin/bash

echo "🚀 Installing Threads Post Scheduler POC..."
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

echo " Node.js found: $(node --version)"

# Check for Podman
if ! command -v podman &> /dev/null; then
    echo "Podman is not installed. Install it to run MongoDB and Redis containers."
    echo "   On macOS: brew install podman"
    echo "   On Linux: See https://podman.io/getting-started/installation"
fi

# Install root dependencies
echo ""
echo "📦 Installing root dependencies..."
npm install

# Install backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd apps/backend
npm install
cd ../..

# Install frontend dependencies
echo ""
echo "📦 Installing frontend dependencies..."
cd apps/frontend
npm install
cd ../..

# Create backend .env file if it doesn't exist
if [ ! -f apps/backend/.env ]; then
    echo ""
    echo "📝 Creating backend .env file..."
    cat > apps/backend/.env << 'EOF'
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
EOF
    echo " Created apps/backend/.env"
    echo "Please update THREADS_USER_ID and THREADS_ACCESS_TOKEN in apps/backend/.env"
else
    echo " apps/backend/.env already exists"
fi

echo ""
echo " Installation complete!"
echo ""
echo "Next steps:"
echo "1. Update apps/backend/.env with your Threads API credentials"
echo "2. Start MongoDB and Redis:"
echo "   podman-compose up -d mongodb redis"
echo "3. Start the backend API:"
echo "   npm run dev:backend"
echo "4. Start the worker (in a new terminal):"
echo "   npm run dev:worker"
echo "5. Start the frontend (in a new terminal):"
echo "   npm run dev:frontend"
echo ""
echo "Or use Turbopack to run all at once:"
echo "   npm run dev"
echo ""
echo "📖 See SETUP.md for detailed instructions"
