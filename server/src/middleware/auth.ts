import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import User from '../models/User';
import mongoose from 'mongoose';

export interface AuthPayload {
    userId: string;
    role: string;
}

export interface AuthRequest extends Request {
    user?: AuthPayload;
}

/**
 * Middleware to verify JWT access token from httpOnly cookie.
 * Follows OWASP guidelines for secure token handling.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    let token = req.cookies?.access_token;

    // Support Bearer token from header (Critical for Mobile)
    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }

    if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;

        // Handle legacy integer IDs from SQLite - verify it's a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'Invalid session format' });
            return;
        }

        // Verify user still exists and is active
        const user = await User.findById(decoded.userId).select('id role is_active');

        if (!user || !user.is_active) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'Account not found or deactivated' });
            return;
        }

        req.user = { userId: user._id.toString(), role: user.role };
        next();
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
            return;
        }
        res.status(401).json({ error: 'Invalid token' });
    }
}

/**
 * Optional authentication - doesn't fail if no token present
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    let token = req.cookies?.access_token;

    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }

    if (!token) {
        next();
        return;
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
        req.user = decoded;
    } catch {
        // Token invalid/expired but we don't block the request
    }

    next();
}

/**
 * Middleware to check if platform is locked (requires payment)
 */
export async function requirePayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    // Admins are always exempt
    if (req.user?.role === 'admin') {
        return next();
    }

    try {
        const Setting = (await import('../models/Setting')).default;

        // Fetch both settings to determine current platform policy
        const [lockSetting, regSetting] = await Promise.all([
            Setting.findOne({ key: 'global_payment_lock' }),
            Setting.findOne({ key: 'registration_payment_required' })
        ]);

        // If 'global_payment_lock' is false, the platform is open for existing users.
        // 'registration_payment_required' only affects new signups and specialized features like Pitches.
        if (lockSetting?.value === 'false') {
            return next();
        }

        // If global lock is enabled, strictly enforce the payment status and expiry
        if (lockSetting?.value === 'true') {
            const User = (await import('../models/User')).default;
            const user = await User.findById(req.user?.userId).select('payment_status premium_expiry');

            // Strictly check for a valid future expiry date. 
            // 'completed' status alone is not enough if the subscription has expired.
            const isPremium = user &&
                user.premium_expiry && new Date(user.premium_expiry) > new Date();

            if (!isPremium) {
                res.status(402).json({
                    error: 'Payment required to access the platform.',
                    code: 'PAYMENT_REQUIRED'
                });
                return;
            }
        }
        next();
    } catch (err) {
        console.error('Payment check middleware error:', err);
        next(); // Allow if check fails to avoid blocking everyone due to code error
    }
}
