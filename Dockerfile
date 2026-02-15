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

# Install Nginx only
RUN apk add --no-cache nginx

# Forward Nginx logs to Docker logs (Crucial for debugging)
RUN ln -sf /dev/stdout /var/log/nginx/access.log && \
    ln -sf /dev/stderr /var/log/nginx/error.log

# Create directory for Certbot challenges
RUN mkdir -p /var/www/certbot

WORKDIR /app

# 1. Copy Backend
COPY --from=backend-builder /app/server/dist ./server/dist
# Debug: show what was built
RUN echo "=== Backend dist contents ===" && find /app/server/dist -name "*.js" -type f | head -20
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev && mkdir -p uploads

# 2. Copy Frontend to Nginx directory
COPY --from=frontend-builder /app/client/dist /usr/share/nginx/html

# 3. Copy Nginx Configurations to TEMPLATES directory (not http.d)
RUN mkdir -p /etc/nginx/templates
COPY nginx.conf /etc/nginx/templates/ssl.conf
COPY nginx-initial.conf /etc/nginx/templates/initial.conf

# 4. Create Start Script
RUN printf '#!/bin/sh\n\
DOMAIN="startup.4dk.in"\n\
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"\n\
\n\
# Clear default configs to avoid conflicts\n\
rm -f /etc/nginx/http.d/*.conf\n\
\n\
# --- Step 1: Choose Nginx config based on SSL cert availability ---\n\
if [ -f "$CERT_PATH" ]; then\n\
  echo "✅ SSL certificate found. Starting Nginx with HTTPS..."\n\
  cp /etc/nginx/templates/ssl.conf /etc/nginx/http.d/default.conf\n\
else\n\
  echo "⚠️  No SSL certificate yet. Starting Nginx in HTTP-only mode..."\n\
  cp /etc/nginx/templates/initial.conf /etc/nginx/http.d/default.conf\n\
fi\n\
\n\
# Start Nginx in background\n\
nginx\n\
\n\
# --- Step 2: Start Backend Server ---\n\
echo "🚀 Starting Backend Server..."\n\
cd /app/server\n\
\n\
# ROBUST AUTO-DETECT: Check all possible locations\n\
if [ -f dist/index.js ]; then\n\
  ENTRY=dist/index.js\n\
elif [ -f dist/src/index.js ]; then\n\
  ENTRY=dist/src/index.js\n\
else\n\
  echo "❌ ERROR: Cannot find index.js. Listing dist contents:"\n\
  ls -R dist/\n\
  exit 1\n\
fi\n\
\n\
echo "✅ Found entry point: $ENTRY"\n\
node "$ENTRY"\n' > /app/start.sh && chmod +x /app/start.sh

# Environment Variables
ENV BUILD_VERSION=v5
ENV NODE_ENV=production
ENV PORT=5000
ENV MONGODB_URI=mongodb://mongodb:27017/stphub

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Execute the start script
CMD ["/app/start.sh"]
