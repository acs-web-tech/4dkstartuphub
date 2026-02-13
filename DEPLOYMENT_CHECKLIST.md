# StartupHub Deployment Checklist 🚀

Follow these steps to ensure a secure and successful production deployment.

## 1. Environment Variables (`.env`)
Update your production `.env` file with secure values. **Never** use development defaults in production.

- [ ] **JWT_SECRET**: Generate a long random string (e.g., `openssl rand -base64 48`).
- [ ] **JWT_REFRESH_SECRET**: Generate another unique long random string.
- [ ] **NODE_ENV**: Set to `production`.
- [ ] **CORS_ORIGIN**: Set to your actual frontend domain (e.g., `https://startuphub.com`).
- [ ] **MONGODB_URI**: Use a secure connection string with authentication.
- [ ] **RAZORPAY**: Switch `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to Live keys.
- [ ] **AWS S3**: Use an IAM user with restricted access to only the specific bucket.

## 2. Security Headers (CSP)
The application uses `helmet` for Security Headers. I have configured it to:
- Disable development-only origins (localhost/IPs) when `NODE_ENV=production`.
- Force `wss://` and `https://` if your `CORS_ORIGIN` starts with `https`.

## 3. Infrastructure & HTTPS
- [ ] **SSL/TLS**: You **MUST** use HTTPS. PWAs, Service Workers, and Browser Notifications will be disabled by browsers on non-secure connections.
- [ ] **Proxy**: If using Nginx/Apache as a reverse proxy, ensure `X-Forwarded-For` and `X-Forwarded-Proto` headers are correctly set so the server detects the client's real IP for rate-limiting.

## 4. Database
- [ ] **Indexes**: Ensure MongoDB indexes are created (Mongoose does this automatically on startup, but verify for large datasets).
- [ ] **Backups**: Set up automated database backups.

## 5. Build & Optimization
- [ ] **Frontend Build**: Run `npm run build` in the `client` directory and serve the `dist` folder via a static host or CDN.
- [ ] **Server Persistence**: Use a process manager like `pm2` to keep the backend running and auto-restart on crashes.

## 6. Post-Deployment Tests
- [ ] Verify login/register works with the new secrets.
- [ ] Verify real-time notifications still work (WebSockets).
- [ ] Verify file uploads to S3.
- [ ] Verify Razorpay payment flow with a small test amount or live test.

**Current Security Hardening Applied:**
- ✅ **ReDoS Protection**: All search queries now escape regex characters.
- ✅ **XSS Protection**: Robust HTML sanitization on all rich-text inputs.
- ✅ **Rate Limiting**: Brute-force protection on auth and upload routes.
- ✅ **Secure Cookies**: HttpOnly and SameSite=Lax enabled.
- ✅ **Admin Lockout**: Strict role-based access control.
