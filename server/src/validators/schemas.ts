import { z } from 'zod';

// ── Auth Schemas ──────────────────────────────────────────────
export const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const registerSchema = z.object({
    username: z.string()
        .min(3, 'Username must be at least 3 characters')
        .max(30, 'Username must be at most 30 characters')
        .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    email: z.string()
        .email('Invalid email address')
        .max(255, 'Email too long'),
    password: passwordSchema,
    displayName: z.string()
        .min(2, 'Display name must be at least 2 characters')
        .max(50, 'Display name too long')
        .trim(),
    userType: z.enum(['startup', 'investor'], {
        errorMap: () => ({ message: 'User type must be either "startup" or "investor"' })
    }),
    payment: z.object({
        razorpay_order_id: z.string().min(1, 'Order ID required'),
        razorpay_payment_id: z.string().min(1, 'Payment ID required'),
        razorpay_signature: z.string().min(1, 'Signature required'),
    }).optional(),
});

export const resetPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().min(6, 'OTP must be 6 characters').max(6, 'OTP must be 6 characters'),
    password: passwordSchema
});

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

// ── Post Schemas ──────────────────────────────────────────────
export const createPostSchema = z.object({
    title: z.string()
        .min(3, 'Title must be at least 3 characters')
        .max(200, 'Title must be at most 200 characters')
        .trim(),
    content: z.string()
        .min(10, 'Content must be at least 10 characters')
        .max(10000, 'Content too long')
        .trim(),
    category: z.enum(['hiring', 'cofounder', 'promote', 'recommendation', 'events', 'general', 'writeup']),
    videoUrl: z.string().url('Invalid URL').max(500).optional().or(z.literal('')),
    imageUrl: z.string().max(500).optional().or(z.literal('')),
    eventDate: z.string().optional().or(z.literal('')),
});

export const updatePostSchema = z.object({
    title: z.string()
        .min(3, 'Title must be at least 3 characters')
        .max(200, 'Title must be at most 200 characters')
        .trim()
        .optional(),
    content: z.string()
        .min(10, 'Content must be at least 10 characters')
        .max(10000, 'Content too long')
        .trim()
        .optional(),
    category: z.enum(['hiring', 'cofounder', 'promote', 'recommendation', 'events', 'general', 'writeup'])
        .optional(),
    videoUrl: z.string().url('Invalid URL').max(500).optional().or(z.literal('')),
    imageUrl: z.string().max(500).optional().or(z.literal('')),
    eventDate: z.string().optional().or(z.literal('')),
});

// ── Comment Schemas ───────────────────────────────────────────
export const createCommentSchema = z.object({
    content: z.string()
        .min(1, 'Comment cannot be empty')
        .max(2000, 'Comment too long')
        .trim(),
    parentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID').optional(),
});

// ── User Profile Schemas ──────────────────────────────────────
export const updateProfileSchema = z.object({
    displayName: z.string()
        .min(2, 'Display name must be at least 2 characters')
        .max(50, 'Display name too long')
        .trim()
        .optional(),
    avatarUrl: z.string().max(500).optional(),
    bio: z.string().max(500, 'Bio too long').trim().optional(),
    location: z.string().max(100, 'Location too long').trim().optional(),
    website: z.string().url('Invalid URL').max(255).optional().or(z.literal('')),
    linkedin: z.string().max(255).trim().optional(),
    twitter: z.string().max(255).trim().optional(),
});

// ── Chat Room Schemas ─────────────────────────────────────────
export const createChatRoomSchema = z.object({
    name: z.string()
        .min(3, 'Chat room name must be at least 3 characters')
        .max(100, 'Chat room name too long')
        .trim(),
    description: z.string().max(500, 'Description too long').trim().optional(),
});

export const chatMessageSchema = z.object({
    content: z.string()
        .min(1, 'Message cannot be empty')
        .max(2000, 'Message too long')
        .trim(),
});

// ── Admin Schemas ─────────────────────────────────────────────
export const updateUserRoleSchema = z.object({
    role: z.enum(['user', 'admin', 'moderator']),
});

export const paginationSchema = z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
    category: z.string().optional(),
    search: z.string().max(100).optional(),
});
