import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updateProfileSchema } from '../validators/schemas';
import { sanitizeHtml, sanitizePlainText } from '../utils/sanitize';
import { socketService } from '../services/socket';
import User from '../models/User';
import Post from '../models/Post';
import Bookmark from '../models/Bookmark';
import Notification from '../models/Notification';
import Like from '../models/Like';
import Comment from '../models/Comment';
import mongoose from 'mongoose';
import { escapeRegExp } from '../utils/regex';
import { deleteFileByUrl } from '../utils/s3';

const router = Router();

// ── GET /api/users/online ───────────────────────────────────
router.get('/online', (req, res) => {
    res.json({ onlineUserIds: socketService.getOnlineUserIds() });
});

// ── GET /api/users ──────────────────────────────────────────
router.get('/', async (req: AuthRequest, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
        const skip = (page - 1) * limit;
        const search = req.query.search as string;
        const filter = req.query.filter as string || 'explore';

        const match: any = { is_active: true };
        let sort: any = { created_at: -1 };

        if (search) {
            const escapedSearch = escapeRegExp(search);
            match.$or = [
                { display_name: { $regex: escapedSearch, $options: 'i' } },
                { username: { $regex: escapedSearch, $options: 'i' } },
                { bio: { $regex: escapedSearch, $options: 'i' } }
            ];
            // When searching, search ALL active users regardless of filter
            sort = { display_name: 1 };
        } else {
            // Apply filters only when not searching
            if (filter === 'online') {
                const onlineUserIds = socketService.getOnlineUserIds();
                match._id = { $in: onlineUserIds.map(id => new mongoose.Types.ObjectId(id)) };
            } else if (filter === 'hosts') {
                match.role = { $in: ['admin', 'moderator'] };
            } else if (filter === 'top') {
                sort = { post_count: -1, created_at: -1 };
            } else if (filter === 'newest') {
                sort = { created_at: -1 };
            } else if (filter === 'near-me' && req.user) {
                const currentUser = await User.findById(req.user.userId);
                if (currentUser && currentUser.location) {
                    match.location = { $regex: escapeRegExp(currentUser.location), $options: 'i' };
                }
            }
        }

        const users = await User.aggregate([
            { $match: match },
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    id: '$_id',
                    username: 1,
                    displayName: '$display_name',
                    avatarUrl: '$avatar_url',
                    role: 1,
                    userType: '$user_type',
                    postCount: '$post_count',
                    isActive: { $cond: ['$is_active', 1, 0] }
                }
            }
        ]);

        const total = await User.countDocuments(match);
        const onlineIds = socketService.getOnlineUserIds();

        res.json({
            users: users.map(u => ({
                ...u,
                isOnline: onlineIds.includes(u.id.toString())
            })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ── GET /api/users/:id ──────────────────────────────────────
router.get('/:id', async (req: AuthRequest, res) => {
    try {
        const user = await User.findOne({ _id: req.params.id, is_active: true });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const postCount = await Post.countDocuments({ user_id: user._id });

        // Get recent posts
        const recentPosts = await Post.aggregate([
            { $match: { user_id: user._id } },
            { $sort: { created_at: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'likes',
                    localField: '_id',
                    foreignField: 'post_id',
                    as: 'likes'
                }
            },
            {
                $lookup: {
                    from: 'comments',
                    localField: '_id',
                    foreignField: 'post_id',
                    as: 'comments'
                }
            },
            {
                $project: {
                    id: '$_id',
                    title: 1,
                    category: 1,
                    createdAt: '$created_at',
                    likeCount: { $size: '$likes' },
                    commentCount: { $size: '$comments' }
                }
            }
        ]);

        const userJson = user.toJSON();

        // Hide private info if not looking at self and not admin
        if (req.user!.userId !== user._id.toString() && req.user!.role !== 'admin') {
            delete (userJson as any).email;
            delete (userJson as any).paymentStatus;
            delete (userJson as any).razorpayPaymentId;
            delete (userJson as any).razorpayOrderId;
            delete (userJson as any).premiumExpiry;
        }

        res.json({
            user: {
                ...userJson,
                postCount
            },
            recentPosts,
        });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// ── PUT /api/users/profile ──────────────────────────────────
router.put('/profile', validate(updateProfileSchema), async (req: AuthRequest, res) => {
    try {
        const user = await User.findById(req.user!.userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const body = req.body;
        const updateData: any = { profile_completed: true };

        if (body.displayName !== undefined) updateData.display_name = sanitizePlainText(body.displayName);
        if (body.avatarUrl !== undefined) {
            const isOldProxyUrl = body.avatarUrl.startsWith('/api/upload/file/');
            const isCdnUrl = process.env.CLOUDFRONT_DOMAIN && body.avatarUrl.startsWith(`https://${process.env.CLOUDFRONT_DOMAIN}/uploads/`);
            const isEmpty = body.avatarUrl === '';
            
            if (!isOldProxyUrl && !isCdnUrl && !isEmpty) {
                return res.status(400).json({ error: 'Profile photo must be uploaded via the application.' });
            }
            updateData.avatar_url = body.avatarUrl;

            // Silently delete the old avatar from S3 if it changed
            if (user.avatar_url && user.avatar_url !== body.avatarUrl) {
                deleteFileByUrl(user.avatar_url).catch(err => console.error('[Cleanup] Failed to delete old avatar:', err));
            }
        }
        if (body.bio !== undefined) updateData.bio = sanitizePlainText(body.bio);
        if (body.location !== undefined) updateData.location = sanitizePlainText(body.location);
        if (body.website !== undefined) updateData.website = body.website;
        if (body.linkedin !== undefined) updateData.linkedin = sanitizePlainText(body.linkedin);
        if (body.twitter !== undefined) updateData.twitter = sanitizePlainText(body.twitter);

        // Optional auto-fix for the legacy typo
        if (user.user_type && String(user.user_type).toLowerCase().trim() === 'invester') {
            updateData.user_type = 'investor';
        }

        await User.updateOne(
            { _id: user._id },
            { $set: updateData },
            { runValidators: false } // Crucial bypass: Prevents Mongoose from throwing on bad legacy enums
        );

        res.json({ message: 'Profile updated' });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ── GET /api/users/me/bookmarks ─────────────────────────────
router.get('/me/bookmarks', async (req: AuthRequest, res) => {
    try {
        const bookmarks = await Bookmark.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(req.user!.userId) } },
            { $sort: { created_at: -1 } },
            {
                $lookup: {
                    from: 'posts',
                    localField: 'post_id',
                    foreignField: '_id',
                    as: 'post'
                }
            },
            { $unwind: '$post' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'post.user_id',
                    foreignField: '_id',
                    as: 'author'
                }
            },
            { $unwind: '$author' },
            {
                $lookup: {
                    from: 'likes',
                    localField: 'post._id',
                    foreignField: 'post_id',
                    as: 'likes'
                }
            },
            {
                $lookup: {
                    from: 'comments',
                    localField: 'post._id',
                    foreignField: 'post_id',
                    as: 'comments'
                }
            },
            {
                $project: {
                    id: '$post._id',
                    title: '$post.title',
                    category: '$post.category',
                    displayName: '$author.display_name',
                    username: '$author.username',
                    avatarUrl: '$author.avatar_url',
                    role: '$author.role',
                    likeCount: { $size: '$likes' },
                    commentCount: { $size: '$comments' },
                    createdAt: '$post.created_at'
                }
            }
        ]);

        res.json({ bookmarks });
    } catch (err) {
        console.error('Get bookmarks error:', err);
        res.status(500).json({ error: 'Failed to fetch bookmarks' });
    }
});

// ── GET /api/users/me/notifications ─────────────────────────
router.get('/me/notifications', async (req: AuthRequest, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user!.userId);
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ user_id: userId })
            .populate('sender_id', 'display_name avatar_url username')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments({ user_id: userId });
        const unreadCount = await Notification.countDocuments({ user_id: userId, is_read: false });

        res.json({
            notifications: notifications.map(n => ({
                id: n._id.toString(),
                type: n.type,
                title: n.title,
                content: n.content,
                referenceId: n.reference_id,
                imageUrl: n.image_url || '',
                videoUrl: n.video_url || '',
                isRead: n.is_read ? 1 : 0,
                senderId: (n.sender_id as any)?._id?.toString() || '',
                senderDisplayName: (n.sender_id as any)?.display_name || 'StartupHub',
                senderAvatarUrl: (n.sender_id as any)?.avatar_url || '',
                senderUsername: (n.sender_id as any)?.username || '',
                createdAt: n.created_at,
            })),
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        });
    } catch (err) {
        console.error('Get notifications error:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});


// ── PUT /api/users/me/notifications/read ────────────────────
router.put('/me/notifications/read', async (req: AuthRequest, res) => {
    try {
        await Notification.updateMany(
            { user_id: req.user!.userId, is_read: false },
            { $set: { is_read: true } }
        );
        socketService.emitNotificationsRead(req.user!.userId);
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// ── PUT /api/users/me/notifications/:id/read ────────────────
router.put('/me/notifications/:id/read', async (req: AuthRequest, res) => {
    try {
        await Notification.updateOne(
            { _id: req.params.id, user_id: req.user!.userId },
            { $set: { is_read: true } }
        );
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

export default router;
