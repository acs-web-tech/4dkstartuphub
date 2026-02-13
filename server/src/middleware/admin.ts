import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Middleware to restrict access to admin users only.
 * Must be used AFTER authenticate middleware.
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    if (req.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }

    next();
}

/**
 * Middleware to restrict access to admins or moderators.
 */
export function requireModerator(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
        res.status(403).json({ error: 'Moderator access required' });
        return;
    }

    next();
}
