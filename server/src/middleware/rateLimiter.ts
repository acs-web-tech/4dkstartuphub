import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

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
});
