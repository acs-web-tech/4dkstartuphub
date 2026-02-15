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

# Install Nginx only (certbot runs in its own container)
RUN apk add --no-cache nginx

# Create directory for Certbot challenges (served by Nginx)
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

# 3. Copy Nginx Configurations
# Main SSL config + initial HTTP-only config for first-time cert setup
COPY nginx.conf /etc/nginx/http.d/ssl.conf
COPY nginx-initial.conf /etc/nginx/http.d/initial.conf

# 4. Create Start Script
RUN printf '#!/bin/sh\n\
DOMAIN="startup.4dk.in"\n\
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"\n\
\n\
# --- Step 1: Choose Nginx config based on SSL cert availability ---\n\
if [ -f "$CERT_PATH" ]; then\n\
  echo "✅ SSL certificate found. Starting Nginx with HTTPS..."\n\
  cp /etc/nginx/http.d/ssl.conf /etc/nginx/http.d/default.conf\n\
else\n\
  echo "⚠️  No SSL certificate yet. Starting Nginx in HTTP-only mode..."\n\
  echo "   Run: docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d $DOMAIN --agree-tos -m your@email.com"\n\
  echo "   Then: docker compose restart app"\n\
  cp /etc/nginx/http.d/initial.conf /etc/nginx/http.d/default.conf\n\
fi\n\
# Clean up named configs\n\
rm -f /etc/nginx/http.d/ssl.conf /etc/nginx/http.d/initial.conf\n\
nginx\n\
\n\
# --- Step 2: Start Backend Server ---\n\
echo "🚀 Starting Backend Server..."\n\
cd /app/server\n\
# With rootDir: ./src in tsconfig, the output is GUARANTEED to be at dist/index.js\n\
ENTRY=dist/index.js\n\
if [ -f "$ENTRY" ]; then\n\
  echo "Found entry: $ENTRY"\n\
  node "$ENTRY"\n\
else\n\
  echo "❌ ERROR: Cannot find $ENTRY"\n\
  echo "Debug: Listing dist contents:"\n\
  ls -R dist/\n\
  exit 1\n\
fi\n' > /app/start.sh && chmod +x /app/start.sh

# Environment Variables
ENV NODE_ENV=production
ENV PORT=5000
ENV MONGODB_URI=mongodb://mongodb:27017/stphub

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Execute the start script
CMD ["/app/start.sh"]
