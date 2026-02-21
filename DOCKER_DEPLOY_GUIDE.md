# 🐳 Unified StartupHub Docker Guide

Everything is in **one image**: Frontend, Backend, Nginx, and Certbot (for HTTPS).

---

## 🚀 Quick Deploy (On Your Server)

### 1. Prerequisites
- Docker and Docker Compose installed on your server.
- Your domain (`startup.4dk.in`) DNS must point to your server's IP address.

### 2. Clone and Build
```bash
git clone https://github.com/acs-web-tech/4dkstartuphub.git
cd 4dkstartuphub
docker build --no-cache -t stphub-app .
docker compose up -d
or
docker compose build app
docker compose up -d app

```

### 3. Get Your SSL Certificate (First Time Only)
After the containers are running (Nginx will start in HTTP-only mode first), run this command to generate your certificate using the dedicated Certbot container:

```bash
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  -d startup.4dk.in \
  --non-interactive \
  --agree-tos \
  -m admin@startup.4dk.in
```

### 4. Restart to Enable HTTPS
After the certificate is successfully generated, restart the app to switch Nginx to HTTPS mode:
```bash
docker compose restart app
```
That's it! Your site is now live at **https://startup.4dk.in** 🎉

---

## 🔄 Renewing the SSL Certificate

Let's Encrypt certificates expire every 90 days. To renew:
```bash
docker compose run --rm certbot renew
docker compose restart app
```

### Auto-Renewal (Recommended)
Add a cron job on your server to auto-renew:
```bash
crontab -e
```
Add this line (runs daily at 3 AM):
```
0 3 * * * cd /root/4dkstartuphub && docker compose run --rm certbot renew && docker compose restart app
```

---

## 🏗️ Architecture

| Component | Responsibility |
| :--- | :--- |
| **Nginx** | Port 80 (HTTP→HTTPS redirect) + Port 443 (serves React, proxies API/WebSocket) |
| **Certbot** | Manages Let's Encrypt SSL certificates inside the container |
| **Node.js** | Runs the backend on Port 5000 (internal only) |
| **MongoDB** | Separate container for database stability |

### Persistent Volumes
| Volume | Purpose |
| :--- | :--- |
| `certbot_certs` | SSL certificates (persist across restarts) |
| `certbot_www` | ACME challenge files |
| `stp_uploads` | User uploaded files |
| `mongodb_data` | Database storage |

---

## 🔧 Updating the Application

```bash
cd ~/4dkstartuphub
git pull origin main
docker build --no-cache -t stphub-app .
docker compose down
docker compose up -d
```
Your SSL certificates are stored in a Docker volume, so they survive rebuilds!

---

## 📝 Troubleshooting
- **Logs**: `docker logs -f stphub-unified`
- **Restart**: `docker compose restart app`
- **Stop everything**: `docker compose down`
- **Check SSL**: `docker exec stphub-unified certbot certificates`
- **Force renew SSL**: `docker exec stphub-unified certbot renew --force-renewal`
