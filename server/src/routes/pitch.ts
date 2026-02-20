import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { sanitizeHtml } from '../utils/sanitize';
import { socketService } from '../services/socket';
import { emailService } from '../services/email';
import PitchRequest from '../models/PitchRequest';
import User from '../models/User';
import Notification from '../models/Notification';
import mongoose from 'mongoose';

const router = Router();

// Premium-only middleware: only paid users (or admins) can access pitch requests
async function requirePremium(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    // Admins and Moderators have unrestricted access
    if (req.user!.role === 'admin' || req.user!.role === 'moderator') {
        next();
        return;
    }

    try {
        const Setting = (await import('../models/Setting')).default;

        // Check platform settings first: if it's open or free, bypass premium check
        const [lockSetting, regSetting, pitchReqSetting] = await Promise.all([
            Setting.findOne({ key: 'global_payment_lock' }),
            Setting.findOne({ key: 'registration_payment_required' }),
            Setting.findOne({ key: 'pitch_request_payment_required' })
        ]);

        // Only bypass if ALL relevant locks are disabled. 
        if (lockSetting?.value === 'false' &&
            regSetting?.value === 'false' &&
            pitchReqSetting?.value === 'false') {
            next();
            return;
        }

        const user = await User.findById(req.user!.userId);

        // Consider user premium only if they have a valid future expiry date.
        // Even if they joined while it was free, if the current policy requires payment, 
        // they must have an active subscription to raise pitch requests.
        const isPremium = user &&
            user.premium_expiry && new Date(user.premium_expiry) > new Date();

        if (!isPremium) {
            res.status(402).json({
                error: 'Premium access required. Only paid users with an active subscription can access pitch requests.',
                code: 'PREMIUM_REQUIRED'
            });
            return;
        }
        next();
    } catch (err) {
        console.error('requirePremium middleware error:', err);
        next(); // Allow on failure to avoid blocking users
    }
}

// ── POST /api/pitch — Submit a new pitch request ──────────
router.post('/', authenticate, requirePremium, async (req: AuthRequest, res) => {
    try {
        const { title, description, deckUrl } = req.body;

        if (!title || !description) {
            res.status(400).json({ error: 'Title and description are required' });
            return;
        }

        if (title.length > 200) {
            res.status(400).json({ error: 'Title is too long (max 200 chars)' });
            return;
        }

        if (description.length > 5000) {
            res.status(400).json({ error: 'Description is too long (max 5000 chars)' });
            return;
        }

        // Check Pitch Limit
        const Setting = (await import('../models/Setting')).default;
        const limitSetting = await Setting.findOne({ key: 'pitch_upload_limit' });
        const limit = parseInt(limitSetting?.value || '0', 10);

        if (limit > 0 && req.user?.role !== 'admin') {
            const pitchCount = await PitchRequest.countDocuments({ user_id: req.user!.userId });
            if (pitchCount >= limit) {
                const user = await User.findById(req.user!.userId);
                if (user) {
                    await emailService.sendPitchLimitReachedEmail(user.email, user.display_name, limit);
                }
                res.status(402).json({
                    error: `You have reached the maximum limit of ${limit} pitch requests. Please upgrade your plan to increase your limit.`,
                    code: 'LIMIT_REACHED'
                });
                return;
            }
        }

        const newPitch = await PitchRequest.create({
            user_id: req.user!.userId,
            title: sanitizeHtml(title),
            description: sanitizeHtml(description),
            deck_url: deckUrl || '',
            status: 'pending'
        });

        // Email confirmation
        const user = await User.findById(req.user!.userId);
        if (user) {
            await emailService.sendPitchSubmissionEmail(user.email, user.display_name, title);
        }

        res.status(201).json({ message: 'Pitch request submitted successfully', pitchId: newPitch._id.toString() });
    } catch (err) {
        console.error('Submit pitch error:', err);
        res.status(500).json({ error: 'Failed to submit pitch request' });
    }
});

// ── GET /api/pitch/my — Get current user's pitch requests ──
router.get('/my', authenticate, requirePremium, async (req: AuthRequest, res) => {
    try {
        const pitches = await PitchRequest.find({ user_id: req.user!.userId })
            .populate('reviewed_by', 'display_name')
            .sort({ created_at: -1 });

        const Setting = (await import('../models/Setting')).default;
        const limitSetting = await Setting.findOne({ key: 'pitch_upload_limit' });
        const limit = parseInt(limitSetting?.value || '0', 10);
        const pitchCount = await PitchRequest.countDocuments({ user_id: req.user!.userId });

        res.json({
            pitches: pitches.map(p => {
                const reviewer = p.reviewed_by as any;
                return {
                    id: p._id.toString(),
                    title: p.title,
                    description: p.description,
                    deckUrl: p.deck_url,
                    status: p.status,
                    adminMessage: p.admin_message,
                    reviewerName: reviewer?.display_name || '',
                    createdAt: p.created_at,
                    updatedAt: p.updated_at,
                };
            }),
            count: pitchCount,
            limit: limit
        });
    } catch (err) {
        console.error('Get my pitches error:', err);
        res.status(500).json({ error: 'Failed to fetch pitch requests' });
    }
});

// ── GET /api/pitch/all — Admin: Get all pitch requests ──────
router.get('/all', authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const status = req.query.status as string;
        const query: any = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        const pitches = await PitchRequest.find(query)
            .populate('user_id', 'display_name username avatar_url')
            .populate('reviewed_by', 'display_name')
            .sort({ created_at: -1 });

        res.json({
            pitches: pitches.map(p => {
                const author = p.user_id as any;
                const reviewer = p.reviewed_by as any;
                return {
                    id: p._id.toString(),
                    userId: author?._id?.toString(),
                    userDisplayName: author?.display_name,
                    username: author?.username,
                    userAvatarUrl: author?.avatar_url,
                    title: p.title,
                    description: p.description,
                    deckUrl: p.deck_url,
                    status: p.status,
                    adminMessage: p.admin_message,
                    reviewerName: reviewer?.display_name || '',
                    createdAt: p.created_at,
                    updatedAt: p.updated_at,
                };
            }),
        });
    } catch (err) {
        console.error('Admin get pitches error:', err);
        res.status(500).json({ error: 'Failed to fetch pitch requests' });
    }
});

// ── PUT /api/pitch/:id/review — Admin: Approve/Disapprove ──
router.put('/:id/review', authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const id = req.params.id as string;
        const { status, message } = req.body;

        if (!status || !['approved', 'disapproved'].includes(status)) {
            res.status(400).json({ error: 'Status must be "approved" or "disapproved"' });
            return;
        }

        const pitch = await PitchRequest.findById(id);
        if (!pitch) {
            res.status(404).json({ error: 'Pitch request not found' });
            return;
        }

        pitch.status = status;
        pitch.admin_message = sanitizeHtml(message || '');
        pitch.reviewed_by = new mongoose.Types.ObjectId(req.user!.userId);
        pitch.updated_at = new Date();
        await pitch.save();

        const statusLabel = status === 'approved' ? 'Approved' : 'Disapproved';
        const notifContent = message || `Your pitch request "${pitch.title}" has been ${status}.`;
        const notifTitle = `Pitch ${statusLabel}: ${pitch.title}`;
        const newNotif = await Notification.create({
            user_id: pitch.user_id,
            sender_id: new mongoose.Types.ObjectId(req.user!.userId),
            type: 'admin',
            title: notifTitle,
            content: notifContent,
            reference_id: id as string
        });

        // Fetch admin details for real-time notification
        const admin = await User.findById(req.user!.userId);

        if (newNotif) {
            // Emit real-time notification
            socketService.sendNotification(pitch.user_id.toString(), {
                id: (newNotif._id as any).toString(),
                type: 'admin',
                title: notifTitle,
                content: notifContent,
                isRead: false,
                createdAt: newNotif.created_at,
                senderId: req.user!.userId,
                senderDisplayName: admin?.display_name || 'Admin',
                senderUsername: admin?.username || 'admin',
                senderAvatarUrl: admin?.avatar_url || '',
                referenceId: id as string
            });

            // Send Email
            const targetUser = await User.findById(pitch.user_id);
            if (targetUser) {
                await emailService.sendPitchRequestStatus(targetUser.email, targetUser.display_name, status, pitch.title);
            }
        }

        res.json({ message: `Pitch request ${status}` });
    } catch (err) {
        console.error('Review pitch error:', err);
        res.status(500).json({ error: 'Failed to review pitch request' });
    }
});

export default router;
