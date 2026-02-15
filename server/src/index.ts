import 'dotenv/config'; // Load env variables
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config/env';
import { initializeDatabase } from './config/database';
import { apiLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import postRoutes from './routes/posts';
import userRoutes from './routes/users';
import chatRoomRoutes from './routes/chatrooms';
import adminRoutes from './routes/admin';
import pitchRoutes from './routes/pitch';
import uploadRoutes from './routes/upload';
import paymentRoutes from './routes/payment';

// ── Force restart to pick up .env changes ────────────────────
const app = express();

// Trust the Nginx reverse proxy (needed for rate limiting & X-Forwarded-For)
app.set('trust proxy', 1);

// ── Security Middleware ──────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://*.amazonaws.com", "https://*.razorpay.com"],
            mediaSrc: ["'self'", "https://*.amazonaws.com"],
            scriptSrc: ["'self'", "https://checkout.razorpay.com", "'unsafe-inline'"],
            frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
            connectSrc: [
                "'self'",
                "https://api.razorpay.com",
                "https://lumberjack.razorpay.com",
                ...(process.env.NODE_ENV === 'production' ? [] : [
                    "ws://localhost:5000",
                    "ws://127.0.0.1:5000",
                    "ws://192.168.31.152:5000",
                    "ws://localhost:5173",
                    "ws://127.0.0.1:5173",
                    "ws://192.168.31.152:5173",
                    "http://localhost:5000",
                    "http://127.0.0.1:5000",
                    "http://192.168.31.152:5000",
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "http://192.168.31.152:5173",
                ]),
                "http://localhost",
                "capacitor://localhost",
                ...(config.corsOrigin.startsWith('https') ? [config.corsOrigin, config.corsOrigin.replace('https', 'wss')] : [config.corsOrigin])
            ],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://192.168.31.152:5173',
            'http://localhost',
            'capacitor://localhost',
            config.corsOrigin
        ];
        // Allow requests with no origin (same-origin, server-to-server, mobile apps)
        if (!origin) {
            callback(null, true);
        } else if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// ── Global Rate Limiter (production only) ────────────────────
if (process.env.NODE_ENV === 'production') {
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
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chatrooms', chatRoomRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pitch', pitchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);

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
        res.json({
            registration_payment_required: paymentSetting?.value === 'true',
            registration_payment_amount: parseInt(amountSetting?.value || '950', 10),
        });
    } catch (err) {
        console.error('Public settings error:', err);
        res.json({ registration_payment_required: true, registration_payment_amount: 950 });
    }
});

// ── 404 handler ─────────────────────────────────────────────
app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ── Global Error Handler ────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
    });
});

// ── Initialize DB & Start Server ────────────────────────────
import { createServer } from 'http';
import { socketService } from './services/socket';

const httpServer = createServer(app);

async function start() {
    await initializeDatabase();

    // Initialize WebSockets
    socketService.initialize(httpServer);

    httpServer.listen(config.port, '0.0.0.0', () => {
        console.log(`
  ╔══════════════════════════════════════════╗
  ║   🚀 StartupHub API Server Running      ║
  ║   Port: ${config.port}                            ║
  ║   Mode: ${process.env.NODE_ENV || 'development'}                    ║
  ╚══════════════════════════════════════════╝
    `);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

export default app;
