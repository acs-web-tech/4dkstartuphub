import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { authenticate, authenticatePending, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema, resetPasswordSchema, passwordSchema } from '../validators/schemas';
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
        maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.cookie('refresh_token', refreshToken, {
        ...config.cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/auth/refresh',
    });
}


/**
 * Trigger welcome email and in-app notification.
 * Checks for existing welcome notification to prevent duplicates.
 */
async function triggerWelcomeActions(user: any) {
    try {
        // Prevent duplicate welcome notifications
        const existingWelcome = await Notification.findOne({ user_id: user._id, type: 'welcome' });
        if (existingWelcome) return;

        // Send Welcome Email
        try {
            await emailService.sendWelcomeEmail(user.email, user.display_name);
        } catch (emailErr) {
            console.error('Failed to send welcome email:', emailErr);
        }

        // Create in-app welcome notification from settings
        const [welcomeTitle, welcomeContent, welcomeVideo, welcomeImage] = await Promise.all([
            Setting.findOne({ key: 'welcome_notification_title' }),
            Setting.findOne({ key: 'welcome_notification_content' }),
            Setting.findOne({ key: 'welcome_notification_video_url' }),
            Setting.findOne({ key: 'welcome_notification_image_url' })
        ]);

        let finalContent = welcomeContent?.value || 'Complete your profile to get started.';
        if (welcomeVideo?.value) {
            finalContent += `<div class="broadcast-video"><a href="${welcomeVideo.value}" target="_blank" rel="noopener noreferrer">🎬 Watch Video</a></div>`;
        }

        const notif = await Notification.create({
            user_id: user._id,
            type: 'welcome',
            title: welcomeTitle?.value || 'Welcome to StartupHub! 🚀',
            content: finalContent,
            image_url: welcomeImage?.value || '',
            sender_id: null,
            reference_id: 'welcome'
        });

        // Try to push real-time if they happen to be connected (unlikely during registration but possible on re-verify)
        const { socketService } = await import('../services/socket');
        socketService.sendNotification(user._id.toString(), {
            id: notif._id.toString(),
            type: 'welcome',
            title: notif.title,
            content: notif.content,
            isRead: false,
            createdAt: notif.created_at
        });

    } catch (e) {
        console.error('Welcome actions failed:', e);
    }
}


// ── Helper: Daily OTP limiting ───────────────────────────────
function hasReachedOtpLimit(user: any) {
    const today = new Date().toISOString().split('T')[0];
    if (user.otp_last_request_date === today) {
        return (user.otp_count || 0) >= 15;
    }
    return false;
}

function trackOtpRequest(user: any) {
    const today = new Date().toISOString().split('T')[0];
    if (user.otp_last_request_date === today) {
        user.otp_count = (user.otp_count || 0) + 1;
    } else {
        user.otp_last_request_date = today;
        user.otp_count = 1;
    }
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
router.post('/register', validate(registerSchema), async (req, res) => {
    try {
        const { username, email, password, displayName, userType } = req.body;

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

        const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);
        const sanitizedName = sanitizeHtml(displayName);

        // Check for Email Verification Setting
        const verifySetting = await Setting.findOne({ key: 'registration_email_verification_required' });
        const isVerificationRequired = verifySetting?.value !== 'false';

        // Never auto-set emailVerified — only true after actual verification
        let verificationOtp = undefined;

        if (isVerificationRequired) {
            verificationOtp = crypto.randomInt(100000, 999999).toString();
        }

        const newUser = await User.create({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            password_hash: passwordHash,
            display_name: sanitizedName,
            user_type: userType || 'startup',
            payment_status: 'free',
            razorpay_payment_id: '',
            razorpay_order_id: '',
            premium_expiry: null,
            is_email_verified: false, // Only true after actual verification
            is_active: !isVerificationRequired, // Active if verification is not currently required
            email_verification_otp: verificationOtp,
            email_verification_otp_expires: verificationOtp ? new Date(Date.now() + 10 * 60 * 1000) : undefined
        });

        if (verificationOtp) {
            trackOtpRequest(newUser);
            await newUser.save({ validateModifiedOnly: true });
        }

        // Send welcome email / notification if not requiring verification
        if (!isVerificationRequired) {
            await triggerWelcomeActions(newUser);
        } else if (verificationOtp) {
            try {
                await emailService.sendOTP(newUser.email, newUser.display_name, 'verification', verificationOtp);
            } catch (e) { console.error("Failed to send verification OTP", e); }
        }

        if (isVerificationRequired) {
            res.status(201).json({
                message: 'Registration successful. A verification code has been sent to your email.',
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
        user.is_active = true; // Ensure they are active
        user.email_verification_token = undefined;
        await user.save({ validateModifiedOnly: true });

        await triggerWelcomeActions(user);

        const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role);
        setTokenCookies(res, accessToken, refreshToken);

        // Redirect to feed directly
        const frontendUrl = config.corsOrigin;
        res.redirect(`${frontendUrl}/feed?auth=success`);
    } catch (err) {
        console.error('Verify email error:', err);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', async (req, res) => {
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
router.post('/reset-password', async (req, res) => {
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

        if (bcrypt.compareSync(password, user.password_hash)) {
            res.status(400).json({ error: 'New password cannot be the same as your old password.' });
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
router.post('/login', validate(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        if (!user.is_active) {
            if (user.is_banned) {
                console.warn(`🛑 Login blocked: User ${user.email} is BANNED.`);
                return res.status(403).json({ error: 'Account has been deactivated. Contact admin.' });
            }

            // Since registration payment lock is removed, any "pending" user from the old flow 
            // should just be converted to "free" and allowed to proceed.
            if (user.payment_status === 'pending') {
                user.payment_status = 'free';
            }

            // Heuristic for "Pending Registration" support (Registration lock era is over):
            // Auto-activate them since they are not banned. The email verification gate (below) will
            // still block them if they need to verify their email.
            user.is_active = true;
            await user.save({ validateModifiedOnly: true });
            console.log(`✅ Auto-activated user ${user.email} (legacy pending or inactive state resolved).`);
        }

        // Check if email verification is enabled and user is verified
        const verifySetting = await Setting.findOne({ key: 'registration_email_verification_required' });
        if (verifySetting?.value !== 'false' && !user.is_email_verified) {
            const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role);
            setTokenCookies(res, accessToken, refreshToken);

            const isMobile = req.headers['x-mobile-app'] === 'true';

            res.status(403).json({
                error: 'EMAIL_VERIFICATION_REQUIRED',
                message: 'Please verify your email address before logging in.',
                email: user.email,
                accessToken: isMobile ? accessToken : accessToken, // Ensure it's returned for web fallback
                refreshToken: isMobile ? refreshToken : refreshToken
            });
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
                isEmailVerified: user.is_email_verified,
                isActive: user.is_active,
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
        const decoded = jwt.verify(refreshTokenCookie, config.jwtRefreshSecret, { clockTolerance: 30 }) as { userId: string; role: string };

        // Handle legacy integer IDs from SQLite
        if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'Invalid session format' });
            return;
        }

        // Verify user still exists
        const user = await User.findById(decoded.userId);

        if (!user) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'User not found' });
            return;
        }

        if (!user.is_active) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'Account pending completion or deactivated. Please log in again.' });
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
    // Clear cookies on all possible paths
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
    res.clearCookie('access_token', { path: '/api' });
    res.clearCookie('refresh_token', { path: '/api' });
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

        if (!user.is_active) {
            res.status(401).json({ error: 'Account pending completion or deactivated. Please log in again.' });
            return;
        }

        // Logic to check and handle premium expiry
        if (user.payment_status === 'completed' && user.premium_expiry) {
            if (user.premium_expiry < new Date()) {

                user.payment_status = 'expired';
                await user.save({ validateModifiedOnly: true });
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

// ── NEW: OTP Routes ──────────────────────────────────────────

// Resend Verification OTP
router.post('/send-verification-otp', authenticatePending, async (req: AuthRequest, res) => {
    try {
        const user = await User.findById(req.user!.userId);
        if (!user) return;
        if (user.is_email_verified) {
            res.status(400).json({ error: 'Email already verified' });
            return;
        }

        if (hasReachedOtpLimit(user)) {
            res.status(400).json({ error: 'Daily OTP limit (15) reached. Please contact support.' });
            return;
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        user.email_verification_otp = otp;
        user.email_verification_otp_expires = new Date(Date.now() + 10 * 60 * 1000);
        trackOtpRequest(user);
        await user.save({ validateModifiedOnly: true });

        await emailService.sendOTP(user.email, user.display_name, 'verification', otp);
        res.json({ message: 'Verification code sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Verify Email OTP
router.post('/verify-email-otp', authenticatePending, async (req: AuthRequest, res) => {
    try {
        const { otp } = req.body;
        const user = await User.findById(req.user!.userId);

        if (!user || !user.email_verification_otp || !user.email_verification_otp_expires) {
            res.status(400).json({ error: 'Invalid request' });
            return;
        }

        if (user.is_email_verified) {
            res.json({ message: 'Already verified' });
            return;
        }

        if (new Date() > user.email_verification_otp_expires) {
            res.status(400).json({ error: 'OTP expired' });
            return;
        }

        if (user.email_verification_otp !== otp) {
            res.status(400).json({ error: 'Invalid OTP' });
            return;
        }

        user.is_email_verified = true;

        user.is_active = true;
        user.email_verification_otp = undefined;
        user.email_verification_otp_expires = undefined;
        await user.save({ validateModifiedOnly: true });

        if (user.is_active) {
            await triggerWelcomeActions(user);
        }

        const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role);
        setTokenCookies(res, accessToken, refreshToken);

        res.json({
            message: 'Email verified successfully',
            user: user.toJSON(),
            accessToken,
            refreshToken
        });
    } catch (err) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Forgot Password OTP
router.post('/forgot-password-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({ error: 'Email required' });
            return;
        }
        const user = await User.findOne({ email: email.toLowerCase() });
        if (user) {
            const today = new Date().toISOString().split('T')[0];

            // Check daily request limit (10)
            if (user.reset_record?.last_request_date === today) {
                if (user.reset_record.request_count >= 10) {
                    res.status(429).json({ error: 'Daily password reset request limit (10) reached. Try again tomorrow.' });
                    return;
                }
                user.reset_record.request_count += 1;
            } else {
                user.reset_record = {
                    last_request_date: today,
                    request_count: 1,
                    reset_count: 0
                };
            }

            if (hasReachedOtpLimit(user)) {
                res.status(400).json({ error: 'Daily OTP limit (15) reached. Please contact support.' });
                return;
            }

            const otp = crypto.randomInt(100000, 999999).toString();
            user.reset_password_otp = otp;
            user.reset_password_expires = new Date(Date.now() + 10 * 60 * 1000);
            trackOtpRequest(user);
            await user.save({ validateModifiedOnly: true });

            await emailService.sendOTP(user.email, user.display_name, 'reset', otp);
        }
        res.json({ message: 'If an account exists, a reset code has been sent.' });
    } catch (err) {
        res.status(500).json({ error: 'Request failed' });
    }
});

// Reset Password OTP
router.post('/reset-password-otp', validate(resetPasswordSchema), async (req, res) => {
    try {
        const { email, otp, password } = req.body;

        const user = await User.findOne({
            email: email.toLowerCase(),
            reset_password_otp: otp,
            reset_password_expires: { $gt: Date.now() }
        });

        if (!user) {
            res.status(400).json({ error: 'Invalid or expired OTP' });
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        // Check daily reset completion limit (10)
        if (user.reset_record?.last_request_date === today) {
            if (user.reset_record.reset_count >= 10) {
                res.status(429).json({ error: 'Daily password reset completion limit (10) reached. Try again tomorrow.' });
                return;
            }
        }

        if (bcrypt.compareSync(password, user.password_hash)) {
            res.status(400).json({ error: 'New password cannot be the same as your old password.' });
            return;
        }

        user.password_hash = bcrypt.hashSync(password, config.bcryptRounds);
        user.reset_password_otp = undefined;
        user.reset_password_expires = undefined;

        // Increment successful reset count
        if (user.reset_record?.last_request_date === today) {
            user.reset_record.reset_count += 1;
        } else {
            user.reset_record = {
                last_request_date: today,
                request_count: 0,
                reset_count: 1
            };
        }

        await user.save({ validateModifiedOnly: true });

        res.json({ message: 'Password has been reset successfully. Please login.' });
    } catch (err) {
        res.status(500).json({ error: 'Reset failed' });
    }
});

// Change Password (while logged in) — 2-step OTP verification
router.post('/change-password', authenticate, async (req: AuthRequest, res) => {
    try {
        const { currentPassword, newPassword, otp } = req.body;

        if (!currentPassword || !newPassword) {
            res.status(400).json({ error: 'Current and new password required' });
            return;
        }

        const user = await User.findById(req.user!.userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (!user.password_hash || !bcrypt.compareSync(currentPassword, user.password_hash)) {
            res.status(401).json({ error: 'Incorrect current password' });
            return;
        }

        // Use same validation as register
        const validation = passwordSchema.safeParse(newPassword);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors[0].message });
            return;
        }

        if (currentPassword === newPassword) {
            res.status(400).json({ error: 'New password must be different from current password' });
            return;
        }

        // ── STEP 1: No OTP provided → Send OTP to user's email ──
        if (!otp) {
            // Rate limiting
            if (hasReachedOtpLimit(user)) {
                res.status(429).json({ error: 'Daily OTP limit reached. Please try again tomorrow.' });
                return;
            }

            const otpCode = crypto.randomInt(100000, 999999).toString();
            user.reset_password_otp = otpCode;
            user.reset_password_expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
            trackOtpRequest(user);
            await user.save({ validateModifiedOnly: true });

            // Send OTP email
            await emailService.sendOTP(user.email, user.display_name, 'verification', otpCode);

            res.json({ otpRequired: true, message: 'A verification code has been sent to your email.' });
            return;
        }

        // ── STEP 2: OTP provided → Verify and change password ──
        if (!user.reset_password_otp || !user.reset_password_expires) {
            res.status(400).json({ error: 'No OTP was requested. Please try again.' });
            return;
        }

        if (new Date() > user.reset_password_expires) {
            user.reset_password_otp = undefined;
            user.reset_password_expires = undefined;
            await user.save({ validateModifiedOnly: true });
            res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
            return;
        }

        if (user.reset_password_otp !== otp) {
            res.status(400).json({ error: 'Invalid OTP. Please check and try again.' });
            return;
        }

        // OTP verified — change password
        user.password_hash = bcrypt.hashSync(newPassword, config.bcryptRounds);
        user.reset_password_otp = undefined;
        user.reset_password_expires = undefined;
        // CRITICAL: Use validateModifiedOnly to bypass validation on other fields that might have legacy data
        await user.save({ validateModifiedOnly: true });

        res.json({ message: 'Password changed successfully!' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

export default router;
