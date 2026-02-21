import rateLimit from 'express-rate-limit';
import { config } from '../config/env';
import { Request } from 'express';

const customKeyGenerator = (req: Request): string => {
    // 1. Cloudflare
    if (req.headers['cf-connecting-ip']) {
        return `ip_${req.headers['cf-connecting-ip']}`;
    }

    // 2. Nginx Real IP
    if (req.headers['x-real-ip']) {
        return `ip_${req.headers['x-real-ip']}`;
    }

    // 3. X-Forwarded-For (can be a comma-separated list of IPs)
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        const ips = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : (xForwardedFor as string[])[0].split(',');
        const realIp = ips[0].trim();
        if (realIp && realIp !== 'unknown') {
            return `ip_${realIp}`;
        }
    }

    // 4. Default Express IP (Fallback, usually the Docker Gateway IP if proxy isn't forwarding headers)
    return `ip_${req.ip || req.connection?.remoteAddress || 'unknown'}`;
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
