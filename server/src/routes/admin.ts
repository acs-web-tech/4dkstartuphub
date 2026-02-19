import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { updateUserRoleSchema } from '../validators/schemas';
import { socketService } from '../services/socket';
import { emailService } from '../services/email';
import User from '../models/User';
import Post from '../models/Post';
import Comment from '../models/Comment';
import ChatRoom from '../models/ChatRoom';
import ChatMessage from '../models/ChatMessage';
import Notification from '../models/Notification';
import Setting from '../models/Setting';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { escapeRegExp } from '../utils/regex';

const router = Router();

// All routes require admin
router.use(authenticate, requireAdmin);

// ── GET /api/admin/stats ────────────────────────────────────
router.get('/stats', async (_req: AuthRequest, res) => {
    try {
        const [
            userCount,
            activeUsers,
            postCount,
            commentCount,
            chatRoomCount,
            messageCount
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ is_active: true }),
            Post.countDocuments(),
            Comment.countDocuments(),
            ChatRoom.countDocuments({ is_active: true }),
            ChatMessage.countDocuments()
        ]);

        // Posts by category
        const postsByCategory = await Post.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Recent signups (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const recentSignups = await User.countDocuments({ created_at: { $gte: weekAgo } });

        // Top posters
        const topPosters = await Post.aggregate([
            { $group: { _id: '$user_id', post_count: { $sum: 1 } } },
            { $sort: { post_count: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    id: '$_id',
                    username: '$user.username',
                    displayName: '$user.display_name',
                    avatarUrl: '$user.avatar_url',
                    postCount: 1
                }
            }
        ]);

        res.json({
            stats: {
                totalUsers: userCount,
                activeUsers: activeUsers,
                totalPosts: postCount,
                totalComments: commentCount,
                activeChatRooms: chatRoomCount,
                totalMessages: messageCount,
                recentSignups: recentSignups,
            },
            postsByCategory: postsByCategory.map(p => ({
                category: p._id,
                count: p.count,
            })),
            topPosters,
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ── GET /api/admin/users ────────────────────────────────────
router.get('/users', async (req: AuthRequest, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
        const skip = (page - 1) * limit;
        const search = req.query.search as string;

        const match: any = {};
        if (search) {
            const escapedSearch = escapeRegExp(search);
            match.$or = [
                { username: { $regex: escapedSearch, $options: 'i' } },
                { email: { $regex: escapedSearch, $options: 'i' } },
                { display_name: { $regex: escapedSearch, $options: 'i' } }
            ];
        }

        const users = await User.aggregate([
            { $match: match },
            { $sort: { created_at: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'posts',
                    localField: '_id',
                    foreignField: 'user_id',
                    as: 'userPosts'
                }
            },
            {
                $project: {
                    id: '$_id',
                    username: 1,
                    email: 1,
                    displayName: '$display_name',
                    role: 1,
                    isActive: { $cond: ['$is_active', 1, 0] },
                    postCount: { $size: '$userPosts' },
                    paymentStatus: '$payment_status',
                    premiumExpiry: '$premium_expiry',
                    lastSeen: '$last_seen',
                    createdAt: '$created_at',
                }
            }
        ]);

        const total = await User.countDocuments(match);

        res.json({
            users,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error('Admin get users error:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ── PUT /api/admin/users/:id/role ───────────────────────────
router.put('/users/:id/role', validate(updateUserRoleSchema), async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (id === req.user!.userId) {
            res.status(400).json({ error: 'Cannot change your own role' });
            return;
        }

        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        user.role = role;
        await user.save();

        // Notify user
        await Notification.create({
            user_id: user._id,
            sender_id: req.user!.userId,
            type: 'admin',
            title: 'Role Updated',
            content: `Your role has been updated to ${role}`
        });

        res.json({ message: `User role updated to ${role}` });
    } catch (err) {
        console.error('Update role error:', err);
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

// ── PUT /api/admin/users/:id/premium ───────────────────────
router.put('/users/:id/premium', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { paymentStatus, premiumExpiry } = req.body;

        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (paymentStatus) user.payment_status = paymentStatus;
        if (premiumExpiry !== undefined) user.premium_expiry = premiumExpiry;

        await user.save();

        // Notify user
        await Notification.create({
            user_id: user._id,
            sender_id: req.user!.userId,
            type: 'admin',
            title: 'Premium Status Updated',
            content: `Your premium status has been updated to: ${paymentStatus || 'unchanged'}. Expiry: ${premiumExpiry || 'N/A'}`
        });

        res.json({ message: 'Premium status updated' });
    } catch (err) {
        console.error('Update premium error:', err);
        res.status(500).json({ error: 'Failed to update premium status' });
    }
});

// ── PUT /api/admin/users/:id/toggle-active ──────────────────
router.put('/users/:id/toggle-active', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        if (id === req.user!.userId) {
            res.status(400).json({ error: 'Cannot deactivate your own account' });
            return;
        }

        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        user.is_active = !user.is_active;
        await user.save();

        res.json({ message: `User ${user.is_active ? 'activated' : 'deactivated'}` });
    } catch (err) {
        console.error('Toggle active error:', err);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

// ── DELETE /api/admin/users/:id ─────────────────────────────
router.delete('/users/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        if (id === req.user!.userId) {
            res.status(400).json({ error: 'Cannot delete your own account' });
            return;
        }

        await User.deleteOne({ _id: id });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ── POST /api/admin/users/:id/reset-password ────────────────
router.post('/users/:id/reset-password', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Generate reset token
        const resetBuffer = crypto.randomBytes(32);
        const resetToken = resetBuffer.toString('hex');

        user.reset_password_token = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.reset_password_expires = new Date(Date.now() + 3600000); // 1 hour
        await user.save();

        // Send email
        const resetUrl = `https://startup.4dk.in/reset-password?token=${resetToken}`;
        await emailService.sendPasswordResetEmail(user.email, user.display_name, resetToken); // Fix: pass name and token correctly

        res.json({ message: 'Password reset link sent to user email.' });
    } catch (err) {
        console.error('Admin reset password error:', err);
        res.status(500).json({ error: 'Failed to send reset email' });
    }
});

// ── DELETE /api/admin/posts/:id ─────────────────────────────
router.delete('/posts/:id', async (req: AuthRequest, res) => {
    try {
        await Post.deleteOne({ _id: req.params.id });
        res.json({ message: 'Post deleted by admin' });
    } catch (err) {
        console.error('Admin delete post error:', err);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// ── POST /api/admin/notifications/broadcast ─────────────────
router.post('/notifications/broadcast', async (req: AuthRequest, res) => {
    try {
        const { title, content, videoUrl, referenceId, imageUrl } = req.body;

        if (!title || !content) {
            res.status(400).json({ error: 'Title and content are required' });
            return;
        }

        let fullContent = content;
        if (videoUrl && videoUrl.trim()) {
            fullContent += `<div class="broadcast-video"><a href="${videoUrl.trim()}" target="_blank" rel="noopener noreferrer">🎬 Watch Video</a></div>`;
        }

        // Use explicit imageUrl if provided, otherwise extract from content
        const finalImageUrl = imageUrl || (content.match(/<img[^>]+src="([^">]+)"/)?.[1]);

        const users = await User.find({ is_active: true }).select('_id');

        const notifications = users.map(user => ({
            user_id: user._id,
            sender_id: req.user!.userId,
            type: 'admin',
            title,
            content: fullContent,
            reference_id: referenceId || ''
        }));

        await Notification.insertMany(notifications);

        // Emit real-time broadcast event
        socketService.broadcast('broadcast', {
            title,
            content: fullContent,
            referenceId,
            imageUrl: finalImageUrl
        });

        res.json({ message: `Notification sent to ${users.length} users` });
    } catch (err: any) {
        console.error('Broadcast error:', err);
        res.status(500).json({ error: 'Failed to broadcast notification' });
    }
});

// ── GET /api/admin/settings ─────────────────────────────────
router.get('/settings', async (_req: AuthRequest, res) => {
    try {
        const allowedKeys = [
            'registration_payment_required',
            'registration_payment_amount',
            'membership_validity_months',
            'welcome_notification_title',
            'welcome_notification_content',
            'welcome_notification_video_url',
            'pitch_request_payment_required',
            'pitch_request_payment_amount',
            'android_app_url',
            'ios_app_url'
        ];

        const settings = await Setting.find({ key: { $in: allowedKeys } });
        const settingsObj: Record<string, string> = {};
        settings.forEach(s => {
            settingsObj[s.key] = s.value;
        });
        res.json({ settings: settingsObj });
    } catch (err) {
        console.error('Get settings error:', err);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// ── PUT /api/admin/settings ─────────────────────────────────
router.put('/settings', async (req: AuthRequest, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value === undefined) {
            res.status(400).json({ error: 'Key and value are required' });
            return;
        }

        const allowedKeys = [
            'registration_payment_required',
            'registration_payment_amount',
            'membership_validity_months',
            'welcome_notification_title',
            'welcome_notification_content',
            'welcome_notification_video_url',
            'pitch_request_payment_required',
            'pitch_request_payment_amount',
            'android_app_url',
            'ios_app_url'
        ];
        if (!allowedKeys.includes(key)) {
            res.status(400).json({ error: 'Unknown setting key' });
            return;
        }

        await Setting.findOneAndUpdate(
            { key },
            { value: String(value), updated_at: new Date() },
            { upsert: true, returnDocument: 'after' }
        );

        res.json({ message: 'Setting updated', key, value: String(value) });
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

export default router;
