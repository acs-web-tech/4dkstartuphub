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

# --- Stage 3: Final Production Image (Node + Nginx + Certbot) ---
FROM node:20-alpine

# Install Nginx and Certbot
RUN apk add --no-cache nginx certbot certbot-nginx

# Create directories for Certbot
RUN mkdir -p /var/www/certbot /etc/letsencrypt /var/lib/letsencrypt

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
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY nginx-initial.conf /etc/nginx/http.d/initial.conf

# 4. Create Start Script
RUN printf '#!/bin/sh\n\
DOMAIN="startup.4dk.in"\n\
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"\n\
\n\
# --- Step 1: Start Nginx ---\n\
if [ -f "$CERT_PATH" ]; then\n\
  echo "✅ SSL certificate found. Starting Nginx with HTTPS..."\n\
  cp /etc/nginx/http.d/default.conf /etc/nginx/http.d/active.conf\n\
else\n\
  echo "⚠️  No SSL certificate found. Starting Nginx in HTTP-only mode..."\n\
  cp /etc/nginx/http.d/initial.conf /etc/nginx/http.d/active.conf\n\
  echo "   Run this command inside the container to get your certificate:"\n\
  echo "   certbot certonly --webroot -w /var/www/certbot -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN"\n\
fi\n\
# Remove named configs, keep only the active one\n\
rm -f /etc/nginx/http.d/default.conf /etc/nginx/http.d/initial.conf\n\
mv /etc/nginx/http.d/active.conf /etc/nginx/http.d/default.conf\n\
nginx\n\
\n\
# --- Step 2: Start Backend Server ---\n\
echo "🚀 Starting Backend Server..."\n\
cd /app/server\n\
if [ -f dist/index.js ]; then\n\
  ENTRY=dist/index.js\n\
elif [ -f dist/src/index.js ]; then\n\
  ENTRY=dist/src/index.js\n\
else\n\
  echo "❌ ERROR: Cannot find index.js in dist/"\n\
  find dist/ -name "index.js" 2>/dev/null\n\
  exit 1\n\
fi\n\
echo "Found entry: $ENTRY"\n\
node "$ENTRY"\n' > /app/start.sh && chmod +x /app/start.sh

# Environment Variables
ENV NODE_ENV=production
ENV PORT=5000
ENV MONGODB_URI=mongodb://mongodb:27017/stphub

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Execute the start script
CMD ["/app/start.sh"]
