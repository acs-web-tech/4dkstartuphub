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
import { emailService } from '../services/email';
import Razorpay from 'razorpay';

const router = Router();

// Initialize Razorpay
let razorpay: Razorpay | null = null;
if (config.razorpay.keyId && config.razorpay.keySecret) {
    razorpay = new Razorpay({
        key_id: config.razorpay.keyId,
        key_secret: config.razorpay.keySecret,
    });
}

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

// ── POST /api/auth/register-init ─────────────────────────────
router.post('/register-init', authLimiter, validate(registerSchema), async (req, res) => {
    try {
        const { username, email, password, displayName, userType } = req.body;

        // Check for existing user (completed or pending)
        let user = await User.findOne({
            $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }]
        });

        if (user && user.payment_status === 'completed') {
            res.status(409).json({ error: 'User already exists' });
            return;
        }

        // Verify payment is required
        const paymentSetting = await Setting.findOne({ key: 'registration_payment_required' });
        const paymentRequired = paymentSetting?.value === 'true';

        let orderId = '';
        let amount = 0;

        if (paymentRequired && razorpay) {
            const amountSetting = await Setting.findOne({ key: 'registration_payment_amount' });
            const amountInRupees = parseInt(amountSetting?.value || '950', 10);
            amount = amountInRupees * 100; // paise

            const options = {
                amount,
                currency: 'INR',
                receipt: `receipt_${Date.now()}_${email.substring(0, 5)}`,
                notes: { email, username } // Store for webhook context
            };
            const order = await razorpay.orders.create(options);
            orderId = order.id;
        }

        const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);
        const sanitizedName = sanitizeHtml(displayName);

        if (user) {
            // Update existing pending user
            user.username = username.toLowerCase();
            user.email = email.toLowerCase();
            user.password_hash = passwordHash;
            user.display_name = sanitizedName;
            user.user_type = userType || 'startup';
            user.razorpay_order_id = orderId;
            user.payment_status = paymentRequired ? 'pending' : 'completed';
            user.is_active = !paymentRequired;
            user.is_active = !paymentRequired;
            await user.save();
        } else {
            // Create new pending user
            user = await User.create({
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                password_hash: passwordHash,
                display_name: sanitizedName,
                user_type: userType || 'startup',
                payment_status: paymentRequired ? 'pending' : 'completed',
                razorpay_order_id: orderId,
                is_active: !paymentRequired,
                is_email_verified: false
            });
        }

        if (!paymentRequired) {
            const { accessToken, refreshToken } = generateTokens(user._id.toString(), 'user');
            setTokenCookies(res, accessToken, refreshToken);

            try {
                // await emailService.sendWelcomeEmail(user.email, user.display_name);
            } catch (e) { }

            res.json({
                message: 'Registration successful',
                user: user.toJSON(),
                accessToken, refreshToken,
                paymentRequired: false
            });
            return;
        }

        res.json({
            orderId,
            keyId: config.razorpay.keyId,
            amount,
            currency: 'INR',
            userId: user._id,
            paymentRequired: true
        });

    } catch (err) {
        console.error('Registration Init error:', err);
        res.status(500).json({ error: 'Failed to initiate registration' });
    }
});

// ── POST /api/auth/register-finalize ─────────────────────────
router.post('/register-finalize', authLimiter, async (req, res) => {
    try {
        const { order_id, payment_id, signature } = req.body;

        if (!order_id || !payment_id || !signature) {
            res.status(400).json({ error: 'Missing payment details' });
            return;
        }

        const user = await User.findOne({ razorpay_order_id: order_id });
        if (!user) {
            res.status(404).json({ error: 'User not found for this order' });
            return;
        }

        const shasum = crypto.createHmac('sha256', config.razorpay.keySecret || '');
        shasum.update(`${order_id}|${payment_id}`);
        const digest = shasum.digest('hex');

        if (digest !== signature) {
            res.status(400).json({ error: 'Invalid payment signature' });
            return;
        }

        const validitySetting = await Setting.findOne({ key: 'membership_validity_months' });
        const validityMonths = parseInt(validitySetting?.value || '12', 10);
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + validityMonths);

        user.payment_status = 'completed';
        user.razorpay_payment_id = payment_id;
        user.premium_expiry = expiryDate;
        user.is_active = true;

        const verifySetting = await Setting.findOne({ key: 'registration_email_verification_required' });
        const isVerificationRequired = verifySetting?.value === 'true';

        if (isVerificationRequired) {
            const token = crypto.randomBytes(32).toString('hex');
            user.email_verification_token = token;
            await user.save();
            try {
                await emailService.sendVerificationEmail(user.email, user.display_name, token);
            } catch (e) { console.error('Verification email failed', e); }

            res.status(201).json({
                message: 'Payment successful! Verification email sent.',
                requireVerification: true
            });
            return;
        } else {
            user.is_email_verified = true;
            await user.save();
            try {
                await emailService.sendWelcomeEmail(user.email, user.display_name);
            } catch (e) { console.error('Welcome email failed', e); }
        }

        const { accessToken, refreshToken } = generateTokens(user._id.toString(), 'user');
        setTokenCookies(res, accessToken, refreshToken);

        res.json({
            message: 'Registration complete!',
            user: user.toJSON(),
            accessToken, refreshToken
        });

    } catch (err) {
        console.error('Finalize error:', err);
        res.status(500).json({ error: 'Failed to complete registration' });
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

        // Check for Email Verification Setting
        const verifySetting = await Setting.findOne({ key: 'registration_email_verification_required' });
        const isVerificationRequired = verifySetting?.value === 'true';

        let emailVerified = false;
        let verificationToken = undefined;

        if (isVerificationRequired) {
            verificationToken = crypto.randomBytes(32).toString('hex');
            // Send email immediately
        } else {
            emailVerified = true; // Auto-verify if not required
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
            premium_expiry: expiryDate,
            is_email_verified: emailVerified,
            email_verification_token: verificationToken
        });

        // Send notifications/emails async
        if (isVerificationRequired && verificationToken) {
            try {
                await emailService.sendVerificationEmail(newUser.email, newUser.display_name, verificationToken);
            } catch (e) {
                console.error("Failed to send verification email", e);
            }
        } else {
            try {
                // No verification required, send welcome email
                await emailService.sendWelcomeEmail(newUser.email, newUser.display_name);
            } catch (e) {
                console.error("Failed to send welcome email", e);
            }
        }

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

        if (isVerificationRequired) {
            res.status(201).json({
                message: 'Registration successful. A verification email has been sent to your inbox. Please verify to login.',
                requireVerification: true
            });
            return;
        }

        const { accessToken, refreshToken } = generateTokens(newUser._id.toString(), 'user');
        setTokenCookies(res, accessToken, refreshToken);

        const isMobile = req.headers['x-mobile-app'] === 'true';

        res.status(201).json({
            message: 'Registration successful',
            accessToken: isMobile ? accessToken : undefined,
            refreshToken: isMobile ? refreshToken : undefined,
            user: {
                id: newUser._id.toString(),
                username: newUser.username,
                email: newUser.email,
                displayName: newUser.display_name,
                role: 'user',
                userType: newUser.user_type,
                paymentStatus: newUser.payment_status,
                premiumExpiry: newUser.premium_expiry,
                isEmailVerified: newUser.is_email_verified
            },
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ── GET /api/auth/verify-email ───────────────────────────────
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            res.status(400).json({ error: 'Token required' });
            return;
        }

        const user = await User.findOne({ email_verification_token: token });

        if (!user) {
            res.status(400).json({ error: 'Invalid or expired verification token' });
            return;
        }

        user.is_email_verified = true;
        user.email_verification_token = undefined;
        await user.save();

        try {
            await emailService.sendWelcomeEmail(user.email, user.display_name);
        } catch (e) {
            console.error("Failed to send welcome email after verification", e);
        }

        // Redirect to login with specific query param
        const frontendUrl = config.corsOrigin;
        res.redirect(`${frontendUrl}/login?verified=true`);
    } catch (err) {
        console.error('Verify email error:', err);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({ error: 'Email required' });
            return;
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            user.reset_password_token = token;
            user.reset_password_expires = new Date(Date.now() + 3600000); // 1 hour
            await user.save({ validateModifiedOnly: true });

            // Send email async (don't block response too long, or await ensures delivery)
            await emailService.sendPasswordResetEmail(user.email, user.display_name, token);
        }

        // Always return success to prevent user enumeration
        res.json({ message: 'If an account exists, a password reset email has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Request failed' });
    }
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password', authLimiter, async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            res.status(400).json({ error: 'Token and password required' });
            return;
        }

        const user = await User.findOne({
            reset_password_token: token,
            reset_password_expires: { $gt: Date.now() }
        });

        if (!user) {
            res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
            return;
        }

        user.password_hash = bcrypt.hashSync(password, config.bcryptRounds);
        user.reset_password_token = undefined;
        user.reset_password_expires = undefined;
        await user.save({ validateModifiedOnly: true });

        res.json({ message: 'Password has been reset successfully. Please login.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Reset failed' });
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

        // Check if email verification is enabled and user is verified
        const verifySetting = await Setting.findOne({ key: 'registration_email_verification_required' });
        if (verifySetting?.value === 'true' && !user.is_email_verified) {
            res.status(403).json({ error: 'Please verify your email address before logging in.' });
            return;
        }

        const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role);
        setTokenCookies(res, accessToken, refreshToken);

        const isMobile = req.headers['x-mobile-app'] === 'true';

        res.json({
            message: 'Login successful',
            accessToken: isMobile ? accessToken : undefined,
            refreshToken: isMobile ? refreshToken : undefined,
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
    const refreshTokenCookie = req.cookies?.refresh_token || req.body.refreshToken;

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

        const isMobile = req.headers['x-mobile-app'] === 'true';

        res.json({
            message: 'Tokens refreshed',
            accessToken: isMobile ? accessToken : undefined,
            refreshToken: isMobile ? refreshToken : undefined
        });
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
