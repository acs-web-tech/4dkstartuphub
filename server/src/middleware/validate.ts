import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Generic validation middleware using Zod schemas.
 * Validates request body, query, or params based on the schema target.
 */
export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body') {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            const data = schema.parse(req[target]);
            req[target] = data; // Replace with sanitized/validated data
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                const errors = err.errors.map((e) => ({
                    field: e.path.join('.'),
                    message: e.message,
                }));
                res.status(400).json({ error: 'Validation failed', details: errors });
                return;
            }
            res.status(400).json({ error: 'Invalid request data' });
        }
    };
}
