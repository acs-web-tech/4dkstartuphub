import rateLimit from 'express-rate-limit';
import { config } from '../config/env';
import { Request } from 'express';

const customKeyGenerator = (req: Request): string => {
    // If the request has passed auth middleware, use user ID
    if ((req as any).user?.userId) {
        return `user_${(req as any).user.userId}`;
    }

    // Check X-Forwarded-For header for real client IP behind proxies
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        const ips = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : xForwardedFor[0].split(',');
        const realIp = ips[0].trim();
        if (realIp) return `ip_${realIp}`;
    }

    // Fallback to Express's req.ip or unknown
    return `ip_${req.ip || 'unknown'}`;
};

/**
 * Rate limiter for authentication endpoints.
 * Prevents brute-force attacks on login/register.
 */
export const authLimiter = rateLimit({
    windowMs: config.rateLimits.auth.windowMs,
    max: config.rateLimits.auth.max,
    message: { error: 'Too many authentication attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: customKeyGenerator,
});

/**
 * General API rate limiter.
 */
export const apiLimiter = rateLimit({
    windowMs: config.rateLimits.api.windowMs,
    max: config.rateLimits.api.max,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: customKeyGenerator,
});

/**
 * Rate limiter for file upload endpoints.
 */
export const uploadLimiter = rateLimit({
    windowMs: config.rateLimits.upload.windowMs,
    max: config.rateLimits.upload.max,
    message: { error: 'Too many uploads. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: customKeyGenerator,
});
