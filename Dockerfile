# --- Stage 1: Build Frontend (React) ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
# Set production flag for build
ENV VITE_API_URL=/api
RUN npm run build

# --- Stage 2: Build Backend (Node.js) ---
FROM node:20-alpine AS backend-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# --- Stage 3: Final Production Image (Node + Nginx) ---
FROM node:20-alpine

# Install Nginx
RUN apk add --no-cache nginx

WORKDIR /app

# 1. Copy Backend
COPY --from=backend-builder /app/server/dist ./server/dist
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev && mkdir -p uploads

# 2. Copy Frontend to Nginx directory
COPY --from=frontend-builder /app/client/dist /usr/share/nginx/html

# 3. Copy Nginx Configuration
# We use a custom config that proxies to localhost:5000
COPY nginx.conf /etc/nginx/http.d/default.conf

# 4. Create Start Script to run both Node and Nginx
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "🚀 Starting Nginx..."' >> /app/start.sh && \
    echo 'nginx' >> /app/start.sh && \
    echo 'echo "🚀 Starting Backend Server..."' >> /app/start.sh && \
    echo 'cd /app/server && node dist/src/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Environment Variables
ENV NODE_ENV=production
ENV PORT=5000
ENV MONGODB_URI=mongodb://mongodb:27017/stphub

# Expose only the Nginx port (80)
EXPOSE 80

# Execute the start script
CMD ["/app/start.sh"]
