import 'dotenv/config'; // Load env variables
// Cache Bust: 2026-02-15 10:45 AM - Force new build
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config/env';
import { initializeDatabase } from './config/database';
import { apiLimiter } from './middleware/rateLimiter';
import { authenticate, AuthRequest, requirePayment } from './middleware/auth';
import postRoutes from './routes/posts';
import userRoutes from './routes/users';
import chatRoomRoutes from './routes/chatrooms';
import adminRoutes from './routes/admin';
import pitchRoutes from './routes/pitch';
import notificationRoutes from './routes/notifications';
import uploadRoutes from './routes/upload';
import paymentRoutes from './routes/payment';
import metaRoutes from './routes/meta';

// ── Environment Flag ─────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

const app = express();

// ── Proxy Trust ──────────────────────────────────────────────
// Always trust the proxy in Docker env (since Nginx is always used there)
app.set('trust proxy', 1);

// ── Development-only origins ─────────────────────────────────
// These are ONLY needed when running `npm run dev` locally.
const DEV_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://192.168.31.152:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://192.168.31.152:5000',
    'http://localhost',
];

const DEV_WS_ORIGINS = [
    'ws://localhost:5000',
    'ws://127.0.0.1:5000',
    'ws://192.168.31.152:5000',
    'ws://localhost:5173',
    'ws://127.0.0.1:5173',
    'ws://192.168.31.152:5173',
];

// ── Build the CSP connectSrc list based on environment ───────
const connectSrc: string[] = [
    "'self'",
    "https://api.razorpay.com",
    "https://lumberjack.razorpay.com",
    "capacitor://localhost",
    // Browser Push Notification Services
    "https://*.googleapis.com",      // Chrome/Android
    "https://*.push.apple.com",       // Safari/iOS
    "https://push.services.mozilla.com", // Firefox
    "https://*.notify.windows.com",   // Edge/Windows
];

if (isProd) {
    // Production: ONLY allow the configured domain (HTTP + HTTPS + WSS)
    connectSrc.push(config.corsOrigin);
    if (config.corsOrigin.startsWith('https')) {
        connectSrc.push(config.corsOrigin.replace('https', 'wss'));
        connectSrc.push(config.corsOrigin.replace('https://', '')); // Also allow naked domain for some web sockets
    }
} else {
    // Development: allow all local dev servers and WebSocket connections
    connectSrc.push(...DEV_ORIGINS, ...DEV_WS_ORIGINS);
    connectSrc.push(config.corsOrigin);
}

// ── Security Middleware ──────────────────────────────────────
app.disable('x-powered-by'); // Hide Express
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
            mediaSrc: ["'self'", "https://*.amazonaws.com"],
            scriptSrc: ["'self'", "https://checkout.razorpay.com", "'unsafe-inline'"],
            frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
            connectSrc: connectSrc, // Connect sources based on env
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    xssFilter: true,
    noSniff: true,
}));

// ── CORS ─────────────────────────────────────────────────────
// Production: strict — only the configured production origin.
// Development: permissive — all localhost variations for hot-reload.
app.use(cors({
    origin: (origin, callback) => {
        // No origin = same-origin request, server-to-server, or mobile app — always allow
        if (!origin) {
            return callback(null, true);
        }

        if (isProd) {
            // Production: STRICT check against configured domain
            if (origin === config.corsOrigin) {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        }

        // Development: allow all
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Mobile-App'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// ── Global Rate Limiter (production only) ────────────────────
if (isProd) {
    app.use('/api', apiLimiter);
}

// ── Global Image Cache Middleware (Aggressive) ──────────────
app.use((req, res, next) => {
    if (req.method === 'GET' && /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(req.path)) {
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    }
    next();
});

// ── API Routes ──────────────────────────────────────────────
import authRoutes from './routes/auth';
app.use('/api/auth', authRoutes);

// Apply Global Payment Lock check to all other functional routes
app.use('/api/posts', authenticate, requirePayment, postRoutes);
app.use('/api/users', authenticate, requirePayment, userRoutes);
app.use('/api/chatrooms', authenticate, requirePayment, chatRoomRoutes);
app.use('/api/admin', adminRoutes); // Admin routes handle their own auth/check
app.use('/api/pitch', authenticate, requirePayment, pitchRoutes);
app.use('/api/notifications', authenticate, requirePayment, notificationRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/upload', authenticate, requirePayment, uploadRoutes);
app.use('/api/payment', paymentRoutes); // Payment routes must be public to allow paying!

// ── Health Check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Public Settings (no auth) ───────────────────────────────
app.get('/api/settings/public', async (_req, res) => {
    try {
        const Setting = (await import('./models/Setting')).default;
        const paymentSetting = await Setting.findOne({ key: 'registration_payment_required' });
        const amountSetting = await Setting.findOne({ key: 'registration_payment_amount' });
        const pitchPaymentSetting = await Setting.findOne({ key: 'pitch_request_payment_required' });
        const pitchAmountSetting = await Setting.findOne({ key: 'pitch_request_payment_amount' });
        const androidUrl = await Setting.findOne({ key: 'android_app_url' });
        const iosUrl = await Setting.findOne({ key: 'ios_app_url' });

        res.json({
            registration_payment_required: paymentSetting?.value === 'true',
            registration_payment_amount: parseInt(amountSetting?.value || '950', 10),
            pitch_request_payment_required: pitchPaymentSetting?.value === 'true',
            pitch_request_payment_amount: parseInt(pitchAmountSetting?.value || '950', 10),
            android_app_url: androidUrl?.value || '',
            ios_app_url: iosUrl?.value || '',
        });
    } catch (err) {
        console.error('Public settings error:', err);
        res.json({
            registration_payment_required: true,
            registration_payment_amount: 950,
            pitch_request_payment_required: true,
            pitch_request_payment_amount: 950,
            android_app_url: '',
            ios_app_url: ''
        });
    }
});

// ── 404 handler ─────────────────────────────────────────────
app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ── Global Error Handler ────────────────────────────────────
// Production: hide internal details. Development: show full error message.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({
        error: isProd ? 'Internal server error' : err.message,
    });
});

// ── Initialize DB & Start Server ────────────────────────────
import { createServer } from 'http';
import { socketService } from './services/socket';
import { startEmailWorker } from './services/email';

const httpServer = createServer(app);

async function start() {
    await initializeDatabase();

    // Start Email Worker (Background Thread)
    startEmailWorker();

    // Migration: Set existing users as verified and init preferences
    try {
        const User = (await import('./models/User')).default;
        await User.updateMany(
            { is_email_verified: { $exists: false } },
            {
                $set: {
                    is_email_verified: true,
                    email_preferences: { likes: true, comments: true, mentions: true, broadcasts: true }
                }
            }
        );
        console.log('✅ User migration check complete.');
    } catch (e) {
        console.error('Migration failed:', e);
    }

    // Initialize WebSockets
    socketService.initialize(httpServer);

    // Start Subscription Monitor (Daily Check)
    const runSubscriptionCheck = async () => {
        try {
            const User = (await import('./models/User')).default;
            const { emailService } = await import('./services/email');

            const now = new Date();
            const todayStart = new Date(now.setHours(0, 0, 0, 0));
            const todayEnd = new Date(now.setHours(23, 59, 59, 999));

            // Helper to check range
            const checkAndNotify = async (start: Date, end: Date, days: number) => {
                const users = await User.find({
                    premium_expiry: { $gte: start, $lte: end },
                    payment_status: days === -1 ? { $ne: 'expired' } : 'completed'
                });
                for (const user of users) {
                    if (days === -1) {
                        user.payment_status = 'expired';
                        await user.save();
                    }
                    await emailService.sendSubscriptionExpiryWarning(user.email, user.display_name, days);
                }
            };

            // -1 Day (Expired Yesterday)
            const yestStart = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);
            const yestEnd = new Date(todayEnd); yestEnd.setDate(yestEnd.getDate() - 1);
            await checkAndNotify(yestStart, yestEnd, -1);

            // 0 Days (Today)
            await checkAndNotify(todayStart, todayEnd, 0);

            // 30 Days Before
            const monthStart = new Date(todayStart); monthStart.setDate(monthStart.getDate() + 30);
            const monthEnd = new Date(todayEnd); monthEnd.setDate(monthEnd.getDate() + 30);
            await checkAndNotify(monthStart, monthEnd, 30);

        } catch (e) {
            console.error('Subscription monitor error:', e);
        }
    };

    // Run once on startup (with delay to let DB connect) then every 24h
    setTimeout(runSubscriptionCheck, 10000);
    setInterval(runSubscriptionCheck, 24 * 60 * 60 * 1000);

    httpServer.listen(config.port, () => {
        console.log(`
  ╔══════════════════════════════════════════╗
  ║   🚀 StartupHub API Server Running      ║
  ║   Version: v6 (PAYMENT FIX)                       ║
  ║   Port: ${config.port}                            ║
  ║   Mode: ${process.env.NODE_ENV || 'development'}                    ║
  ║   CORS: ${config.corsOrigin || 'ALL'}                     ║
  ║   S3 Bucket: ${config.aws.bucketName ? '✅ ' + config.aws.bucketName : '❌ MISSING'}            ║
  ║   Razorpay: ${config.razorpay.keyId ? '✅ Configured' : '❌ MISSING'}            ║
  ║   Email Worker: ✅ Running (Thread)               ║
  ║   Web Push: ${config.vapid.publicKey ? '✅ Ready' : '❌ NOT CONFIGURED'}            ║
  ╚══════════════════════════════════════════╝
    `);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

export default app;
