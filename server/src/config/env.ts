import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from the server root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const isDev = process.env.NODE_ENV !== 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isDev ? 'dev-secret-key-change-in-prod' : crypto.randomBytes(64).toString('hex'));
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (isDev ? 'dev-refresh-secret-key-change-in-prod' : crypto.randomBytes(64).toString('hex'));

export const config = {
    port: parseInt(process.env.PORT || '5000', 10),
    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/stphub',
    jwtSecret: JWT_SECRET,
    jwtRefreshSecret: JWT_REFRESH_SECRET,
    jwtExpiresIn: '15m',
    jwtRefreshExpiresIn: '7d',
    bcryptRounds: 12,
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
    },
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    apiUrl: process.env.API_URL || 'http://localhost:5000/api',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    rateLimits: {
        auth: { windowMs: 15 * 60 * 1000, max: 200 },        // Increased to 200
        api: { windowMs: 15 * 60 * 1000, max: 5000 },       // Increased to 5000
        upload: { windowMs: 60 * 60 * 1000, max: 200 },      // Increased to 200
    },
    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        region: process.env.AWS_REGION || 'us-east-1',
        bucketName: process.env.AWS_BUCKET_NAME || '',
    },
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID || '',
        keySecret: process.env.RAZORPAY_KEY_SECRET || '',
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    },
    vapid: {
        publicKey: process.env.VAPID_PUBLIC_KEY || '',
        privateKey: process.env.VAPID_PRIVATE_KEY || '',
    },
    email: {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || 'StartupHub <noreply@startuphub.com>',
        secure: process.env.SMTP_SECURE === 'true',
    }
} as const;

// Enforce secrets in production
if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET) {
        throw new Error('❌ CRITICAL: JWT_SECRET must be set in production!');
    }
    if (!process.env.JWT_REFRESH_SECRET) {
        throw new Error('❌ CRITICAL: JWT_REFRESH_SECRET must be set in production!');
    }
}
