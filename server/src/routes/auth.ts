import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import { registerSchema, loginSchema } from '../validators/schemas';
import { sanitizeHtml } from '../utils/sanitize';
import User from '../models/User';
import Setting from '../models/Setting';
import Notification from '../models/Notification';
import crypto from 'crypto';
import mongoose from 'mongoose';

const router = Router();

// ── Helper: Generate tokens ──────────────────────────────────
function generateTokens(userId: string, role: string) {
    const accessToken = jwt.sign(
        { userId, role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
    );

    const refreshToken = jwt.sign(
        { userId, role },
        config.jwtRefreshSecret,
        { expiresIn: config.jwtRefreshExpiresIn }
    );

    return { accessToken, refreshToken };
}

function setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('access_token', accessToken, {
        ...config.cookieOptions,
        maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', refreshToken, {
        ...config.cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/auth/refresh',
    });
}

// ── POST /api/auth/check-availability ────────────────────────
router.post('/check-availability', async (req, res) => {
    try {
        const { username, email } = req.body;

        if (username) {
            const existingUser = await User.findOne({ username: username.toLowerCase() });
            if (existingUser) {
                res.status(409).json({ error: 'Username already exists' });
                return;
            }
        }

        if (email) {
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                res.status(409).json({ error: 'Email already exists' });
                return;
            }
        }

        res.json({ available: true });
    } catch (err) {
        console.error('Check availability error:', err);
        res.status(500).json({ error: 'Check failed' });
    }
});

// ── POST /api/auth/register ──────────────────────────────────
router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
    try {
        const { username, email, password, displayName, userType, payment } = req.body;

        // Check existing user
        const existingUser = await User.findOne({
            $or: [
                { email: email.toLowerCase() },
                { username: username.toLowerCase() }
            ]
        });

        if (existingUser) {
            res.status(409).json({ error: 'Email or username already exists' });
            return;
        }

        // Payment Verification Logic
        let paymentStatus = 'free';
        let razorpayPaymentId = '';
        let razorpayOrderId = '';

        // Check admin setting for whether payment is required
        const paymentSetting = await Setting.findOne({ key: 'registration_payment_required' });
        const paymentRequired = paymentSetting?.value === 'true';

        if (paymentRequired && config.razorpay.keySecret && config.razorpay.keyId) {
            if (!payment || !payment.razorpay_order_id || !payment.razorpay_payment_id || !payment.razorpay_signature) {
                res.status(400).json({ error: 'Payment completion required for registration' });
                return;
            }

            const shasum = crypto.createHmac('sha256', config.razorpay.keySecret);
            shasum.update(`${payment.razorpay_order_id}|${payment.razorpay_payment_id}`);
            const digest = shasum.digest('hex');

            if (digest !== payment.razorpay_signature) {
                res.status(400).json({ error: 'Invalid payment signature. Registration denied.' });
                return;
            }

            paymentStatus = 'completed';
            razorpayPaymentId = payment.razorpay_payment_id;
            razorpayOrderId = payment.razorpay_order_id;
        }

        const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);
        const sanitizedName = sanitizeHtml(displayName);

        // Fetch membership validity setting
        const validitySetting = await Setting.findOne({ key: 'membership_validity_months' });
        const validityMonths = parseInt(validitySetting?.value || '12', 10);

        let expiryDate: Date | null = null;
        if (paymentStatus === 'completed') {
            const date = new Date();
            date.setMonth(date.getMonth() + validityMonths);
            expiryDate = date;
        }

        const newUser = await User.create({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            password_hash: passwordHash,
            display_name: sanitizedName,
            user_type: userType || 'startup',
            payment_status: paymentStatus,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_order_id: razorpayOrderId,
            premium_expiry: expiryDate
        });

        // Create welcome notification
        const welcomeTitle = await Setting.findOne({ key: 'welcome_notification_title' });
        const welcomeContent = await Setting.findOne({ key: 'welcome_notification_content' });
        const welcomeVideo = await Setting.findOne({ key: 'welcome_notification_video_url' });

        let finalContent = welcomeContent?.value || 'Complete your profile to get started.';
        if (welcomeVideo?.value) {
            finalContent += `<div class="broadcast-video"><a href="${welcomeVideo.value}" target="_blank" rel="noopener noreferrer">🎬 Watch Video</a></div>`;
        }

        await Notification.create({
            user_id: newUser._id,
            type: 'welcome',
            title: welcomeTitle?.value || 'Welcome to StartupHub! 🚀',
            content: finalContent
        });

        const { accessToken, refreshToken } = generateTokens(newUser._id.toString(), 'user');
        setTokenCookies(res, accessToken, refreshToken);

        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: newUser._id.toString(),
                username: newUser.username,
                email: newUser.email,
                displayName: newUser.display_name,
                role: 'user',
                userType: newUser.user_type,
                paymentStatus: newUser.payment_status,
                premiumExpiry: newUser.premium_expiry,
            },
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        if (!user.is_active) {
            res.status(403).json({ error: 'Account has been deactivated. Contact admin.' });
            return;
        }

        const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role);
        setTokenCookies(res, accessToken, refreshToken);

        res.json({
            message: 'Login successful',
            user: {
                id: user._id.toString(),
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                role: user.role,
                avatarUrl: user.avatar_url,
                bio: user.bio,
                userType: user.user_type,
                paymentStatus: user.payment_status,
                premiumExpiry: user.premium_expiry,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// ── POST /api/auth/refresh ───────────────────────────────────
router.post('/refresh', async (req, res) => {
    const refreshTokenCookie = req.cookies?.refresh_token;

    if (!refreshTokenCookie) {
        res.status(401).json({ error: 'Refresh token required' });
        return;
    }

    try {
        const decoded = jwt.verify(refreshTokenCookie, config.jwtRefreshSecret) as { userId: string; role: string };

        // Handle legacy integer IDs from SQLite
        if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'Invalid session format' });
            return;
        }

        // Verify user still exists and is active
        const user = await User.findById(decoded.userId);

        if (!user || !user.is_active) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'User not found or deactivated' });
            return;
        }

        const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role);
        setTokenCookies(res, accessToken, refreshToken);

        res.json({ message: 'Tokens refreshed' });
    } catch {
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post('/logout', (_req, res) => {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
    res.json({ message: 'Logged out successfully' });
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await User.findById(req.user!.userId);

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Logic to check and handle premium expiry
        if (user.payment_status === 'completed' && user.premium_expiry) {
            if (user.premium_expiry < new Date()) {
                console.log(`⚠️ User ${user.id} premium has expired. Updating status.`);
                user.payment_status = 'expired';
                await user.save();
            }
        }

        res.json({
            user: user.toJSON()
        });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

export default router;
