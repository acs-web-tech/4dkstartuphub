# 🚀 StartupHub Deployment & SSL Guide

This guide covers how to deploy the application, configure credentials (S3, Razorpay), and set up SSL using Certbot and Nginx.

## 1. Prerequisites
- A Linux server (Ubuntu/Debian recommended) with Docker and Docker Compose installed.
- A domain pointed to your server's IP (e.g., `startup.4dk.in`).
- Ports `80` (HTTP) and `443` (HTTPS) open in your firewall.

## 2. Setting Up Environment Variables
We use `docker-compose.yml` to inject environment variables into the container.

### Step 1: Open docker-compose.yml on your server
```bash
nano docker-compose.yml
```

### Step 2: Update the `app` service environment
Ensure your keys are correctly placed. **Do not use quotes for plain values, only for values with special characters.**

```yaml
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongodb:27017/stphub
      # AWS S3 Configuration (For file uploads)
      - "AWS_ACCESS_KEY_ID=YOUR_KEY"
      - "AWS_SECRET_ACCESS_KEY=YOUR_SECRET"
      - AWS_REGION=us-east-1
      - AWS_BUCKET_NAME=4dkstartups
      # Razorpay Configuration (For payments)
      - "RAZORPAY_KEY_ID=rzp_test_..."
      - "RAZORPAY_KEY_SECRET=..."
      # JWT & Security
      - "JWT_SECRET=some_long_random_string"
      - "JWT_REFRESH_SECRET=another_long_random_string"
      - CORS_ORIGIN=https://startup.4dk.in
```

## 3. Initial Deployment (Manual SSL setup)
If you are deploying for the first time without an SSL certificate, follow these steps:

1. **Build and Start (HTTP mode):**
   ```bash
   docker compose up -d --build
   ```
   *The container will detect no certificate and start Nginx in HTTP-only mode to allow Certbot to verify your domain.*

2. **Run Certbot (Dry Run first):**
   ```bash
   docker exec -it app certbot certonly --webroot -w /var/www/certbot -d startup.4dk.in --dry-run
   ```

3. **Run Certbot (Actual):**
   ```bash
   docker exec -it app certbot certonly --webroot -w /var/www/certbot -d startup.4dk.in
   ```

4. **Restart the Container:**
   ```bash
   docker compose restart app
   ```
   *The container will now detect the certificate and start Nginx in HTTPS mode.*

## 4. Maintenance & Updates
Whenever you push new code to the repository:

```bash
git pull origin main
docker compose build --no-cache
docker compose up -d
```

## 5. Troubleshooting
- **Check Server Logs:**
  ```bash
  docker logs -f app
  ```
  *Look for `[S3] Upload error` or `[S3] Download error` if images are broken.*
- **Verify Configuration:**
  On startup, the server prints a banner showing which services are configured. Look for:
  - `S3 Bucket: ✅ ...`
  - `Razorpay: ✅ Configured`

## 6. S3 Setup Checklist
If images are not loading:
1. Ensure the IAM user has `s3:PutObject`, `s3:GetObject`, and `s3:ListBucket` permissions.
2. Verify the `AWS_REGION` matches your bucket's actual region.
3. Ensure the bucket name is exactly correct.
