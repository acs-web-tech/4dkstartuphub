import { Router } from 'express';
import { config } from '../config/env';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { requireModerator } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { createPostSchema, updatePostSchema, createCommentSchema } from '../validators/schemas';
import { sanitizeHtml, sanitizePlainText } from '../utils/sanitize';
import { socketService } from '../services/socket';
import Post from '../models/Post';
import User from '../models/User';
import Like from '../models/Like';
import Comment from '../models/Comment';
import Bookmark from '../models/Bookmark';
import PostView from '../models/PostView';
import Notification from '../models/Notification';
import mongoose from 'mongoose';
import { escapeRegExp } from '../utils/regex';
import { getLinkPreview } from '../services/metadata';
import { emailService } from '../services/email';

const router = Router();

// ── GET /api/posts ───────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
        const skip = (page - 1) * limit;
        const category = req.query.category as string;
        const search = req.query.search as string;
        const trending = req.query.trending === 'true';

        const match: any = {};
        if (category && category !== 'all') {
            match.category = category;
        }
        if (search) {
            const escapedSearch = escapeRegExp(search);
            match.$or = [
                { title: { $regex: escapedSearch, $options: 'i' } },
                { content: { $regex: escapedSearch, $options: 'i' } }
            ];
        }

        const sort: any = trending
            ? { view_count: -1, created_at: -1 }
            : { is_pinned: -1, created_at: -1 };

        if (trending) {
            match.view_count = { $gt: 0 };
        }

        const posts = await Post.aggregate([
            { $match: match },
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
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
                    userId: '$user_id',
                    title: 1,
                    content: 1,
                    category: 1,
                    imageUrl: '$image_url',
                    videoUrl: '$video_url',
                    isPinned: { $cond: ['$is_pinned', 1, 0] },
                    isLocked: { $cond: ['$is_locked', 1, 0] },
                    viewCount: '$view_count',
                    likeCount: { $size: '$likes' },
                    commentCount: { $size: '$comments' },
                    username: { $ifNull: ['$user.username', 'deleted'] },
                    displayName: { $ifNull: ['$user.display_name', 'Deleted User'] },
                    avatarUrl: { $ifNull: ['$user.avatar_url', ''] },
                    eventDate: '$event_date',
                    userType: { $ifNull: ['$user.user_type', ''] },
                    userPostCount: { $ifNull: ['$user.post_count', 0] },
                    createdAt: '$created_at',
                    updatedAt: '$updated_at',
                    linkPreview: '$link_preview'
                }
            }
        ]);

        const total = await Post.countDocuments(match);

        res.json({
            posts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error('Get posts error:', err);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// ── GET /api/posts/:id ──────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
    try {
        const id = String(req.params.id);
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid post ID' });
        }

        const post = await Post.findById(id).populate('user_id', 'username display_name avatar_url bio');

        if (!post) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }

        const author = post.user_id as any;

        // View count logic
        const isAuthor = author && req.user?.userId === author._id.toString();
        let hasIncremented = false;

        if (!isAuthor) {
            const viewerId = req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : null;
            let viewerIp = req.ip || req.socket.remoteAddress || '0.0.0.0';
            if (viewerIp.startsWith('::ffff:')) viewerIp = viewerIp.substring(7);

            // Check if viewed recently (last 1 hour)
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentView = await PostView.findOne({
                post_id: post._id,
                $or: [
                    { ip_address: viewerIp },
                    ...(viewerId ? [{ user_id: viewerId }] : [])
                ],
                created_at: { $gt: hourAgo }
            });

            if (!recentView) {
                await PostView.create({
                    post_id: post._id,
                    user_id: viewerId,
                    ip_address: viewerIp
                });
                post.view_count += 1;
                await post.save();
                hasIncremented = true;
            }
        }

        // Get likes and comments count
        const likeCount = await Like.countDocuments({ post_id: post._id });
        const comments = await Comment.find({ post_id: post._id })
            .populate('user_id', 'username display_name avatar_url')
            .sort({ created_at: 1 });

        res.json({
            post: {
                id: post._id.toString(),
                userId: author?._id?.toString() || (post.user_id as mongoose.Types.ObjectId).toString(),
                title: post.title,
                content: post.content,
                category: post.category,
                imageUrl: post.image_url,
                videoUrl: post.video_url,
                isPinned: post.is_pinned,
                isLocked: post.is_locked,
                viewCount: post.view_count,
                likeCount,
                commentCount: comments.length,
                username: (author as any)?.username || 'deleted',
                displayName: (author as any)?.display_name || 'Deleted User',
                avatarUrl: (author as any)?.avatar_url || '',
                userBio: (author as any)?.bio,
                eventDate: post.event_date,
                userType: (author as any)?.user_type || '',
                userPostCount: (author as any)?.post_count || 0,
                createdAt: post.created_at,
                updatedAt: post.updated_at,
                linkPreview: post.link_preview,
            },
            comments: comments.map(c => {
                const cUser = c.user_id as any;
                return {
                    id: c._id.toString(),
                    postId: c.post_id.toString(),
                    userId: cUser._id.toString(),
                    content: c.content,
                    parentId: c.parent_id?.toString() || null,
                    username: cUser.username,
                    displayName: cUser.display_name,
                    avatarUrl: cUser.avatar_url,
                    createdAt: c.created_at,
                };
            }),
        });
    } catch (err) {
        console.error('Get post error:', err);
        res.status(500).json({ error: 'Failed to fetch post' });
    }
});

// ── POST /api/posts ──────────────────────────────────────────
router.post('/', authenticate, validate(createPostSchema), async (req: AuthRequest, res) => {
    try {
        const { title, content: rawContent, category, videoUrl, imageUrl, eventDate } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user!.userId);

        // Prevent accidental double-posts
        const minuteAgo = new Date(Date.now() - 60 * 1000);
        const existingPost = await Post.findOne({
            user_id: userId,
            title: sanitizePlainText(title),
            created_at: { $gt: minuteAgo }
        });

        if (existingPost) {
            res.status(409).json({ error: 'You just posted this. Please wait a moment.' });
            return;
        }

        // Restrict 'events' category to admins
        if (category === 'events' && req.user?.role !== 'admin') {
            res.status(403).json({ error: 'Only administrators can create Event/Meetup posts.' });
            return;
        }

        const content = sanitizeHtml(rawContent);

        let linkPreview = undefined;
        try {
            const urlMatch = content.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                linkPreview = await getLinkPreview(urlMatch[0]);
            }
        } catch (error) {
            console.error('Failed to generate link preview:', error);
        }

        const newPost = await Post.create({
            user_id: userId,
            title: sanitizePlainText(title),
            content,
            category,
            video_url: videoUrl || '',
            image_url: imageUrl || '',
            event_date: eventDate ? new Date(eventDate) : undefined,
            link_preview: linkPreview
        });

        // Increment user post count
        await User.findByIdAndUpdate(userId, { $inc: { post_count: 1 } });

        // Broadcast new post
        const user = await User.findById(userId);
        if (user) {
            socketService.broadcast('newPost', {
                id: newPost._id.toString(),
                userId: user._id.toString(),
                title: newPost.title,
                content: newPost.content,
                category: newPost.category,
                imageUrl: newPost.image_url,
                videoUrl: newPost.video_url,
                isPinned: newPost.is_pinned,
                isLocked: newPost.is_locked,
                viewCount: newPost.view_count,
                likeCount: 0,
                commentCount: 0,
                username: user.username,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                eventDate: newPost.event_date,
                userType: user.user_type || '',
                userPostCount: user.post_count + 1,
                createdAt: newPost.created_at,
                updatedAt: newPost.updated_at,
                linkPreview: newPost.link_preview
            });
        }

        res.status(201).json({ message: 'Post created', postId: newPost._id.toString() });
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// ── PUT /api/posts/:id ──────────────────────────────────────
router.put('/:id', authenticate, validate(updatePostSchema), async (req: AuthRequest, res) => {
    try {
        const id = String(req.params.id);
        const post = await Post.findById(id);

        if (!post) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }

        if (post.user_id.toString() !== req.user!.userId && req.user!.role !== 'admin') {
            res.status(403).json({ error: 'Not authorized to edit this post' });
            return;
        }

        if (req.body.title) post.title = sanitizePlainText(req.body.title);
        if (req.body.content) {
            post.content = sanitizeHtml(req.body.content);
            try {
                const urlMatch = post.content.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                    post.link_preview = await getLinkPreview(urlMatch[0]);
                } else {
                    post.link_preview = undefined;
                }
            } catch (error) {
                console.error('Failed to update link preview:', error);
            }
        }

        if (req.body.category) {
            if (req.body.category === 'events' && req.user?.role !== 'admin') {
                res.status(403).json({ error: 'Only administrators can create Event/Meetup posts.' });
                return;
            }
            post.category = req.body.category;
        }
        if (req.body.videoUrl !== undefined) post.video_url = req.body.videoUrl;
        if (req.body.imageUrl !== undefined) post.image_url = req.body.imageUrl;
        if (req.body.eventDate !== undefined) post.event_date = req.body.eventDate ? new Date(req.body.eventDate) : undefined;

        await post.save();

        // Broadcast post update
        const updatedPost = await Post.findById(id).populate('user_id', 'username display_name avatar_url');
        if (updatedPost) {
            const author = updatedPost.user_id as any;
            const likeCount = await Like.countDocuments({ post_id: updatedPost._id });
            const commentCount = await Comment.countDocuments({ post_id: updatedPost._id });

            socketService.emitPostUpdate(id, {
                id: updatedPost._id.toString(),
                userId: author._id.toString(),
                title: updatedPost.title,
                content: updatedPost.content,
                category: updatedPost.category,
                imageUrl: updatedPost.image_url,
                videoUrl: updatedPost.video_url,
                isPinned: updatedPost.is_pinned,
                isLocked: updatedPost.is_locked,
                viewCount: updatedPost.view_count,
                likeCount,
                commentCount,
                username: author.username,
                displayName: author.display_name,
                avatarUrl: author.avatar_url,
                eventDate: updatedPost.event_date,
                createdAt: updatedPost.created_at,
                updatedAt: updatedPost.updated_at,
                linkPreview: updatedPost.link_preview
            });
        }

        res.json({ message: 'Post updated' });
    } catch (err) {
        console.error('Update post error:', err);
        res.status(500).json({ error: 'Failed to update post' });
    }
});

// ── DELETE /api/posts/:id ───────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
    try {
        const id = String(req.params.id);
        const post = await Post.findById(id);

        if (!post) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }

        if (post.user_id.toString() !== req.user!.userId && req.user!.role !== 'admin') {
            res.status(403).json({ error: 'Not authorized to delete this post' });
            return;
        }

        await Post.deleteOne({ _id: id });
        // Also cleanup related data
        await Promise.all([
            Like.deleteMany({ post_id: id }),
            Comment.deleteMany({ post_id: id }),
            Bookmark.deleteMany({ post_id: id }),
            PostView.deleteMany({ post_id: id })
        ]);

        // Decrement user post count
        await User.findByIdAndUpdate(post.user_id, { $inc: { post_count: -1 } });

        socketService.emitPostDeleted(id);
        res.json({ message: 'Post deleted' });
    } catch (err) {
        console.error('Delete post error:', err);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// ── POST /api/posts/:id/like ────────────────────────────────
router.post('/:id/like', authenticate, async (req: AuthRequest, res) => {
    try {
        const id = String(req.params.id);
        const userId = new mongoose.Types.ObjectId(req.user!.userId);

        const post = await Post.findById(id);
        if (!post) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }

        const existing = await Like.findOne({ post_id: id, user_id: userId });

        if (existing) {
            await Like.deleteOne({ _id: existing._id });
            const likeCount = await Like.countDocuments({ post_id: id });
            socketService.broadcast('postLiked', { postId: id, likeCount });
            res.json({ message: 'Post unliked', liked: false });
        } else {
            await Like.create({ post_id: id, user_id: userId });
            const likeCount = await Like.countDocuments({ post_id: id });

            // Notify author
            if (post.user_id.toString() !== userId.toString()) {
                const liker = await User.findById(userId).select('username display_name avatar_url');
                if (liker) {
                    const notif = await Notification.create({
                        user_id: post.user_id,
                        sender_id: userId,
                        type: 'like',
                        title: 'New Like',
                        content: `${liker.display_name} liked your post`,
                        reference_id: id
                    });

                    if (notif) {
                        socketService.sendNotification(post.user_id.toString(), {
                            id: notif._id.toString(),
                            type: 'like',
                            title: 'New Like',
                            content: `${liker.display_name} liked your post`,
                            isRead: 0,
                            createdAt: notif.created_at,
                            senderId: userId.toString(),
                            senderDisplayName: liker.display_name,
                            senderUsername: liker.username,
                            senderAvatarUrl: liker.avatar_url,
                            referenceId: id
                        });

                        // Email Notification for Like
                        try {
                            const postAuthor = await User.findById(post.user_id);
                            if (postAuthor && postAuthor.email_preferences?.likes && postAuthor.is_active) {
                                emailService.sendNotificationEmail(
                                    postAuthor.email,
                                    postAuthor.display_name,
                                    'like',
                                    { actorName: liker.display_name, postTitle: post.title }
                                );
                            }
                        } catch (e) {
                            console.error("Email like notification failed", e);
                        }

                    }
                }
            }

            socketService.broadcast('postLiked', { postId: id, likeCount });
            res.json({ message: 'Post liked', liked: true });
        }
    } catch (err) {
        console.error('Like post error:', err);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

// ── GET /api/posts/:id/liked ────────────────────────────────
router.get('/:id/liked', authenticate, async (req: AuthRequest, res) => {
    try {
        const existing = await Like.findOne({
            post_id: String(req.params.id),
            user_id: req.user!.userId
        });
        res.json({ liked: !!existing });
    } catch (err) {
        console.error('Check like error:', err);
        res.status(500).json({ error: 'Failed to check like status' });
    }
});

// ── POST /api/posts/:id/comments ────────────────────────────
router.post('/:id/comments', authenticate, validate(createCommentSchema), async (req: AuthRequest, res) => {
    try {
        const id = String(req.params.id);
        const { content, parentId } = req.body;
        const userId = new mongoose.Types.ObjectId(req.user!.userId);

        const post = await Post.findById(id);
        if (!post) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }

        if (post.is_locked) {
            res.status(403).json({ error: 'This post is locked' });
            return;
        }

        const newComment = await Comment.create({
            post_id: id,
            user_id: userId,
            content: sanitizePlainText(content),
            parent_id: parentId || null
        });

        const commenter = await User.findById(userId);
        if (!commenter) throw new Error('Commenter not found');

        // Emit new comment
        const fullComment = {
            id: newComment._id.toString(),
            postId: id,
            userId: userId.toString(),
            content: newComment.content,
            parentId: newComment.parent_id?.toString() || null,
            displayName: commenter.display_name,
            avatarUrl: commenter.avatar_url,
            username: commenter.username,
            createdAt: newComment.created_at
        };
        socketService.toRoom(`post:${id}`, 'newComment', fullComment);

        // Notify post author
        if (post.user_id.toString() !== userId.toString()) {
            const notif = await Notification.create({
                user_id: post.user_id,
                sender_id: userId,
                type: 'comment',
                title: 'New comment!',
                content: `${commenter.display_name} commented on your post`,
                reference_id: String(id)
            });

            socketService.sendNotification(post.user_id.toString(), {
                id: notif._id.toString(),
                type: 'comment',
                title: 'New comment!',
                content: `${commenter.display_name} commented on your post`,
                referenceId: String(id),
                senderId: userId.toString(),
                senderDisplayName: commenter.display_name,
                senderAvatarUrl: commenter.avatar_url,
                senderUsername: commenter.username,
                isRead: 0,
                createdAt: notif.created_at
            });

            // Email Notification to Author
            try {
                const postAuthor = await User.findById(post.user_id);
                if (postAuthor && postAuthor.email_preferences?.comments && postAuthor.is_active) {
                    emailService.sendNotificationEmail(
                        postAuthor.email,
                        postAuthor.display_name,
                        'comment',
                        {
                            actorName: commenter.display_name,
                            postTitle: post.title,
                            contentSnippet: content.substring(0, 100)
                        }
                    );
                }
            } catch (e) {
                console.error("Email notification failed", e);
            }
        }

        // Handle @mentions
        const mentionRegex = /@(\w+)/g;
        const matches = [...content.matchAll(mentionRegex)];
        const mentionedUserIds = new Set<string>();

        if (matches.length > 0) {
            const mentionedUsernames = [...new Set(matches.map(m => m[1].toLowerCase()))];
            for (const username of mentionedUsernames) {
                const targetUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });

                if (targetUser && targetUser._id.toString() !== userId.toString()) {
                    mentionedUserIds.add(targetUser._id.toString());
                    if (targetUser._id.toString() === post.user_id.toString()) continue;

                    const mNotif = await Notification.create({
                        user_id: targetUser._id,
                        sender_id: userId,
                        type: 'mention',
                        title: 'Mentioned you',
                        content: `${commenter.display_name} mentioned you in a comment`,
                        reference_id: String(id)
                    });

                    socketService.sendNotification(targetUser._id.toString(), {
                        id: mNotif._id.toString(),
                        type: 'mention',
                        title: 'Mentioned you',
                        content: `${commenter.display_name} mentioned you in a comment`,
                        referenceId: String(id),
                        senderId: userId.toString(),
                        senderDisplayName: commenter.display_name,
                        senderAvatarUrl: commenter.avatar_url,
                        senderUsername: commenter.username,
                        isRead: 0,
                        createdAt: mNotif.created_at
                    });

                    // Email Notification for Mention
                    try {
                        if (targetUser.email_preferences?.mentions && targetUser.is_active) {
                            emailService.sendNotificationEmail(
                                targetUser.email,
                                targetUser.display_name,
                                'mention',
                                {
                                    actorName: commenter.display_name,
                                    postTitle: post.title,
                                    contentSnippet: content.substring(0, 100)
                                }
                            );
                        }
                    } catch (e) {
                        console.error("Email mention notification failed", e);
                    }
                }
            }
        }

        // Notify other commenters
        const previousCommenters = await Comment.distinct('user_id', { post_id: id });
        for (const targetId of previousCommenters) {
            const tIdStr = targetId.toString();
            if (tIdStr === userId.toString() || tIdStr === post.user_id.toString() || mentionedUserIds.has(tIdStr)) {
                continue;
            }

            const cNotif = await Notification.create({
                user_id: targetId,
                sender_id: userId,
                type: 'comment', // Using 'comment' type for reply notifications as well
                title: 'New reply',
                content: `${commenter.display_name} also commented on a post you follow`,
                reference_id: String(id)
            });

            socketService.sendNotification(tIdStr, {
                id: cNotif._id.toString(),
                type: 'comment',
                title: 'New reply',
                content: `${commenter.display_name} also commented on a post you follow`,
                referenceId: String(id),
                senderId: userId.toString(),
                senderDisplayName: commenter.display_name,
                senderAvatarUrl: commenter.avatar_url,
                senderUsername: commenter.username,
                isRead: 0,
                createdAt: cNotif.created_at
            });
        }

        const commentCount = await Comment.countDocuments({ post_id: String(req.params.id) });
        socketService.emitCommentCountUpdate(String(req.params.id), commentCount);

        res.status(201).json({ message: 'Comment added', commentId: newComment._id.toString() });
    } catch (err) {
        console.error('Create comment error:', err);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// ── POST /api/posts/:id/bookmark ────────────────────────────
router.post('/:id/bookmark', authenticate, async (req: AuthRequest, res) => {
    try {
        const id = String(req.params.id);
        const userId = new mongoose.Types.ObjectId(req.user!.userId);

        const existing = await Bookmark.findOne({ user_id: userId, post_id: id });

        if (existing) {
            await Bookmark.deleteOne({ _id: existing._id });
            res.json({ message: 'Bookmark removed', bookmarked: false });
        } else {
            await Bookmark.create({ user_id: userId, post_id: id });
            res.json({ message: 'Post bookmarked', bookmarked: true });
        }
    } catch (err) {
        console.error('Bookmark error:', err);
        res.status(500).json({ error: 'Failed to toggle bookmark' });
    }
});

// ── Pin/Lock (moderator+) ───────────────────────────────────
router.post('/:id/pin', authenticate, requireModerator, async (req: AuthRequest, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

        post.is_pinned = !post.is_pinned;
        await post.save();
        res.json({ message: post.is_pinned ? 'Post pinned' : 'Post unpinned' });
    } catch (err) {
        console.error('Pin error:', err);
        res.status(500).json({ error: 'Failed to toggle pin' });
    }
});

router.post('/:id/lock', authenticate, requireModerator, async (req: AuthRequest, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

        post.is_locked = !post.is_locked;
        await post.save();
        res.json({ message: post.is_locked ? 'Post locked' : 'Post unlocked' });
    } catch (err) {
        console.error('Lock error:', err);
        res.status(500).json({ error: 'Failed to toggle lock' });
    }
});

export default router;
