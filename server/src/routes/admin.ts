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
import ChatRoomMember from '../models/ChatRoomMember';
import Notification from '../models/Notification';
import Setting from '../models/Setting';
import PitchRequest from '../models/PitchRequest';
import Bookmark from '../models/Bookmark';
import PostView from '../models/PostView';
import Like from '../models/Like';
import { deleteFileByUrl } from '../utils/s3';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { escapeRegExp } from '../utils/regex';
import { config } from '../config/env';

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
                    _id: 0,
                    id: '$_id',
                    username: 1,
                    email: 1,
                    displayName: '$display_name',
                    role: 1,
                    userType: '$user_type',
                    isActive: { $cond: ['$is_active', 1, 0] },
                    postCount: { $size: '$userPosts' },
                    paymentStatus: '$payment_status',
                    paymentId: '$razorpay_payment_id',
                    orderId: '$razorpay_order_id',
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
        if (!mongoose.Types.ObjectId.isValid(id as string)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
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
        await user.save({ validateModifiedOnly: true });

        console.log(`[AUDIT] Admin ${req.user!.userId} changed role of user ${user._id} to ${role}`);

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
        if (!mongoose.Types.ObjectId.isValid(id as string)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
        const { paymentStatus, premiumExpiry } = req.body;

        const user = await User.findById(id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (paymentStatus) user.payment_status = paymentStatus;
        if (premiumExpiry !== undefined) user.premium_expiry = premiumExpiry;

        await user.save({ validateModifiedOnly: true });

        console.log(`[AUDIT] Admin ${req.user!.userId} updated premium status for user ${user._id}`);

        // Notify user
        await Notification.create({
            user_id: user._id,
            sender_id: req.user!.userId,
            type: 'admin',
            title: 'Premium Status Updated',
            content: `Your premium status has been updated to: ${paymentStatus || 'unchanged'}. Expiry: ${premiumExpiry || 'N/A'}`
        });

        res.json({ message: 'Premium status updated' });

        // Real-time: notify the user immediately so their UI updates without refresh
        socketService.emitAccountStatusUpdate(user._id.toString(), {
            paymentStatus: user.payment_status,
            premiumExpiry: user.premium_expiry ? user.premium_expiry.toISOString() : null,
            reason: 'admin_update'
        });
    } catch (err) {
        console.error('Update premium error:', err);
        res.status(500).json({ error: 'Failed to update premium status' });
    }
});

// ── PUT /api/admin/users/:id/toggle-active ──────────────────
router.put('/users/:id/toggle-active', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id as string)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
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
        await user.save({ validateModifiedOnly: true });

        const action = user.is_active ? 'activated' : 'deactivated';
        console.log(`[AUDIT] Admin ${req.user!.userId} toggled active status for user ${user._id} to ${user.is_active}`);

        // Notify via email
        if (user.email) {
            await emailService.sendAccountStatusEmail(user.email, user.display_name, user.is_active);
        }

        res.json({ message: `User ${action}` });

        // DB is saved. Now emit real-time events.
        // If deactivated → force logout immediately so they can't do anything
        if (!user.is_active) {
            socketService.forceLogout(user._id.toString(), 'Your account has been deactivated by an administrator.');
        }
    } catch (err) {
        console.error('Toggle active error:', err);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

// ── DELETE /api/admin/users/:id ─────────────────────────────
router.delete('/users/:id', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id as string)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
        if (id === req.user!.userId) {
            res.status(400).json({ error: 'Cannot delete your own account' });
            return;
        }

        const userToDelete = await User.findById(id);
        if (!userToDelete) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Force-logout the user BEFORE deletion starts cleaning up data
        // This ensures their session is killed while cleanup runs in background
        socketService.forceLogout(id as string, 'Your account has been deleted by an administrator.');

        const { cleanupService } = await import('../services/cleanup');
        await cleanupService.queueUserDeletion(id as string);

        console.log(`[AUDIT] Admin ${req.user!.userId} queued deletion for user ${id}`);
        res.json({ message: 'User deletion process started in background. Associated data and files will be cleaned up shortly.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ── POST /api/admin/users/:id/reset-password ────────────────
router.post('/users/:id/reset-password', async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id as string)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
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
        await user.save({ validateModifiedOnly: true });

        console.log(`[AUDIT] Admin ${req.user!.userId} triggered password reset for user ${user._id}`);

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
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id as string)) {
            res.status(400).json({ error: 'Invalid post ID' });
            return;
        }
        const postToDelete = await Post.findById(id);
        if (postToDelete) {
            if (postToDelete.image_url) {
                await deleteFileByUrl(postToDelete.image_url);
            }
            await Post.deleteOne({ _id: id });

            // Cleanup related data
            await Promise.all([
                Like.deleteMany({ post_id: id }),
                Comment.deleteMany({ post_id: id }),
                Bookmark.deleteMany({ post_id: id }),
                PostView.deleteMany({ post_id: id }),
                Notification.deleteMany({ reference_id: id })
            ]);

            console.log(`[AUDIT] Admin ${req.user!.userId} deleted post ${id}`);
        }
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

        // 1. Save as a Post in 'announcements' category for the community feed
        const announcementPost = await Post.create({
            user_id: req.user!.userId,
            title,
            content,
            category: 'announcements',
            image_url: imageUrl || '',
            video_url: videoUrl || '',
            is_pinned: false, // Admin can pin manually if needed
        });

        // Broadcast the announcement in real-time
        const user = await User.findById(req.user!.userId);
        if (user) {
            socketService.broadcast('newPost', {
                id: announcementPost._id.toString(),
                userId: user._id.toString(),
                title: announcementPost.title,
                content: announcementPost.content,
                category: announcementPost.category,
                imageUrl: announcementPost.image_url,
                videoUrl: announcementPost.video_url,
                isPinned: announcementPost.is_pinned,
                isLocked: announcementPost.is_locked,
                viewCount: 0,
                likeCount: 0,
                commentCount: 0,
                username: user.username,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                role: user.role || 'user',
                userType: user.user_type || '',
                userBio: user.bio || '',
                userPostCount: user.post_count || 0,
                createdAt: announcementPost.created_at,
                updatedAt: announcementPost.updated_at,
            });
        }

        // 2. Persist broadcast notifications for ALL active users
        const activeUsers = await User.find({ is_active: true }).select('_id').lean();
        const notifDocs = activeUsers.map(u => ({
            user_id: u._id,
            sender_id: req.user!.userId,
            type: 'broadcast' as const,
            title,
            content,
            reference_id: referenceId || '',
            image_url: imageUrl || '',
            video_url: videoUrl || '',
            is_read: false,
        }));
        const inserted = await Notification.insertMany(notifDocs, { ordered: false });

        // Build a map of userId -> notificationId for the real-time payload
        const userNotifMap = new Map<string, string>();
        inserted.forEach((doc: any) => {
            userNotifMap.set(doc.user_id.toString(), doc._id.toString());
        });

        // 3. Real-time Socket + Native Push
        socketService.broadcast('broadcast', {
            title,
            content,
            videoUrl,
            referenceId,
            imageUrl,
            _notifMap: Object.fromEntries(userNotifMap),
        });

        console.log(`[AUDIT] Admin ${req.user!.userId} sent a platform-wide broadcast to ${activeUsers.length} users: ${title}`);
        res.json({ message: `Broadcast sent successfully to ${activeUsers.length} users.` });
    } catch (err) {
        console.error('Admin broadcast error:', err);
        res.status(500).json({ error: 'Failed to send broadcast' });
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
            'ios_app_url',
            'registration_email_verification_required',
            'global_payment_lock',
            'pitch_upload_limit'
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
            'ios_app_url',
            'registration_email_verification_required',
            'global_payment_lock',
            'pitch_upload_limit',
            'welcome_notification_image_url'
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

        // Real-time: broadcast setting changes to all connected users
        socketService.emitSettingChanged(key, String(value));
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

export default router;
