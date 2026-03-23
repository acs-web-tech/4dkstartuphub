import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import User from '../models/User';
import mongoose from 'mongoose';

export interface AuthPayload {
    userId: string;
    role: string;
    jwtExpiresIn?: string; // Added for token expiry information
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

    // Favor Authorization header if present (Standard for SPA refresh and Mobile)
    if (req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }

    if (!token) {
        console.warn(`🛑 Auth failed: No token provided for request to ${req.path}`);
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret, { clockTolerance: 30 }) as AuthPayload;

        // Verify user still exists
        const user = await User.findById(decoded.userId).select('_id role is_active is_email_verified payment_status');

        if (!user) {
            console.warn(`🛑 Auth failed: User ${decoded.userId} not found for request to ${req.path}`);
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'Account not found' });
            return;
        }

        if (!user.is_active) {
            console.warn(`🛑 Auth blocked: User ${user._id} is not active (is_active=false).`);
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'Account pending completion or deactivated. Please log in again.' });
            return;
        }

        req.user = { userId: user._id.toString(), role: user.role };
        next();
    } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
            console.warn(`⏳ Auth failed: Token expired for request to ${req.path}`);
            res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
            return;
        }
        console.error(`❌ Auth error for ${req.path}:`, err.message);
        res.status(401).json({ error: 'Invalid token' });
    }
}

/**
 * Lighter authentication middleware that allows pending (is_active=false) users through.
 * Use this ONLY for routes that pending users need during onboarding (e.g. OTP verification).
 */
export async function authenticatePending(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    let token = req.cookies?.access_token;

    if (req.headers.authorization) {
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
        const decoded = jwt.verify(token, config.jwtSecret, { clockTolerance: 30 }) as AuthPayload;
        const user = await User.findById(decoded.userId).select('_id role is_active');

        if (!user) {
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            res.status(401).json({ error: 'Account not found' });
            return;
        }

        // NOTE: We deliberately do NOT check is_active here.
        // This middleware is for routes that pending users need.
        req.user = { userId: user._id.toString(), role: user.role };
        next();
    } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
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

        const lockSetting = await Setting.findOne({ key: 'global_payment_lock' });

        // If 'global_payment_lock' is explicitly false, the platform is open for everyone.
        if (lockSetting?.value === 'false') {
            return next();
        }

        // If global lock is enabled (or missing = default ON), enforce payment
        const User = (await import('../models/User')).default;
        const user = await User.findById(req.user?.userId).select('payment_status premium_expiry');

        if (!user) {
            res.status(402).json({ error: 'Payment required to access the platform.', code: 'PAYMENT_REQUIRED' });
            return;
        }

        // Paid users: check they have a valid, non-expired subscription
        if (user.payment_status === 'completed') {
            // If they have a premium_expiry date, check it hasn't passed
            if (user.premium_expiry && new Date(user.premium_expiry) > new Date()) {
                return next();
            }
            // If premium_expiry is null (edge case: data migration, admin manual update),
            // still allow them through — they DID pay. Admin can expire them explicitly.
            if (!user.premium_expiry) {
                return next();
            }
            // premium_expiry exists but is in the past → subscription expired
        }

        // Block: free, pending, expired, or completed-but-expired users
        res.status(402).json({
            error: 'Payment required to access the platform.',
            code: 'PAYMENT_REQUIRED'
        });
        return;
    } catch (err) {
        console.error('Payment check middleware error:', err);
        next(); // Allow if check fails to avoid blocking everyone due to code error
    }
}
