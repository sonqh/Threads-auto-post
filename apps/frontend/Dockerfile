FROM docker.io/library/node:20-alpine AS builder

WORKDIR /app

# Copy package files (root and workspace)
COPY package*.json ./
COPY turbo.json ./
COPY apps/frontend/package*.json ./apps/frontend/
COPY apps/backend/package*.json ./apps/backend/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the frontend
RUN npm run build --workspace=@thread-auto-post/frontend

# Production stage
FROM docker.io/library/nginx:alpine

# Copy nginx config
COPY apps/frontend/nginx.conf /etc/nginx/nginx.conf

# Copy built app from builder
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
