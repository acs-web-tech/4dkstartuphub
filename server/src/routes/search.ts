import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import Post from '../models/Post';
import Like from '../models/Like';
import Comment from '../models/Comment';
import mongoose from 'mongoose';
import { escapeRegExp } from '../utils/regex';
import { socketService } from '../services/socket';

const router = Router();

// ── GET /api/search?q=...&limit=5 ───────────────────────────
// Smart global search: returns scored + ranked users and posts
router.get('/', async (req: AuthRequest, res) => {
    try {
        const q = (req.query.q as string || '').trim();
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 5));
        const page = Math.max(1, parseInt(req.query.page as string) || 1);

        if (!q || q.length < 1) {
            return res.json({ users: [], posts: [], usersHasMore: false, postsHasMore: false });
        }

        const escaped = escapeRegExp(q);
        const queryLower = q.toLowerCase();
        const words = queryLower.split(/\s+/).filter(w => w.length > 0);

        // ── USERS SEARCH ────────────────────────────────────
        // Fetch a broader set, then score in-app for relevance
        const userMatch: any = {
            is_active: true,
            $or: [
                { display_name: { $regex: escaped, $options: 'i' } },
                { username: { $regex: escaped, $options: 'i' } },
                { bio: { $regex: escaped, $options: 'i' } },
                { location: { $regex: escaped, $options: 'i' } },
                { user_type: { $regex: escaped, $options: 'i' } }
            ]
        };

        const rawUsers = await User.aggregate([
            { $match: userMatch },
            { $limit: 200 }, // Fetch more for scoring
            {
                $project: {
                    _id: 0,
                    id: '$_id',
                    username: 1,
                    displayName: '$display_name',
                    avatarUrl: '$avatar_url',
                    role: 1,
                    userType: '$user_type',
                    bio: 1,
                    location: 1,
                    postCount: '$post_count'
                }
            }
        ]);

        // Score each user
        const onlineIds = new Set(socketService.getOnlineUserIds());
        const scoredUsers = rawUsers.map(u => {
            let score = 0;
            const dn = (u.displayName || '').toLowerCase();
            const un = (u.username || '').toLowerCase();
            const bio = (u.bio || '').toLowerCase();
            const loc = (u.location || '').toLowerCase();

            // Exact match on username or display name → highest score
            if (un === queryLower) score += 100;
            else if (dn === queryLower) score += 90;
            // Starts-with on username or display name
            else if (un.startsWith(queryLower)) score += 70;
            else if (dn.startsWith(queryLower)) score += 65;
            // Word match: any word in display name starts with query
            else if (dn.split(/\s+/).some((w: string) => w.startsWith(queryLower))) score += 55;
            // Contains in username or displayname
            else if (un.includes(queryLower)) score += 40;
            else if (dn.includes(queryLower)) score += 35;
            // Multi-word: all query words found in display name
            else if (words.length > 1 && words.every(w => dn.includes(w))) score += 50;
            // Bio or location match (lower priority)
            else if (bio.includes(queryLower)) score += 15;
            else if (loc.includes(queryLower)) score += 10;

            // Bonus for activity
            if (u.postCount > 10) score += 5;
            if (u.postCount > 50) score += 5;
            if (u.role === 'admin' || u.role === 'moderator') score += 3;
            if (onlineIds.has(u.id.toString())) score += 2;

            return { ...u, score, isOnline: onlineIds.has(u.id.toString()) };
        });

        // Sort by score desc, then by displayName asc
        scoredUsers.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const topUsers = scoredUsers.slice(startIndex, endIndex);
        const usersHasMore = scoredUsers.length > endIndex;

        // ── POSTS SEARCH ────────────────────────────────────
        const postMatch: any = {
            $or: [
                { title: { $regex: escaped, $options: 'i' } },
                { content: { $regex: escaped, $options: 'i' } },
                { category: { $regex: escaped, $options: 'i' } }
            ]
        };

        const rawPosts = await Post.aggregate([
            { $match: postMatch },
            { $limit: 200 },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'author'
                }
            },
            { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
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
                    _id: 0,
                    id: '$_id',
                    title: 1,
                    content: 1,
                    category: 1,
                    imageUrl: '$image_url',
                    viewCount: '$view_count',
                    createdAt: '$created_at',
                    displayName: '$author.display_name',
                    username: '$author.username',
                    avatarUrl: '$author.avatar_url',
                    userId: '$user_id',
                    likeCount: { $size: '$likes' },
                    commentCount: { $size: '$comments' }
                }
            }
        ]);

        // Score each post
        const scoredPosts = rawPosts.map(p => {
            let score = 0;
            const title = (p.title || '').toLowerCase();
            const content = (p.content || '').replace(/<[^>]*>/g, '').toLowerCase();
            const cat = (p.category || '').toLowerCase();

            // Title exact match → highest
            if (title === queryLower) score += 100;
            // Title starts with query
            else if (title.startsWith(queryLower)) score += 80;
            // Title contains query
            else if (title.includes(queryLower)) score += 60;
            // Multi-word: all words found in title
            else if (words.length > 1 && words.every(w => title.includes(w))) score += 55;
            // Category match
            else if (cat.includes(queryLower)) score += 30;
            // Content contains
            else if (content.includes(queryLower)) score += 20;
            // Multi-word: all words found in content
            else if (words.length > 1 && words.every(w => content.includes(w))) score += 15;

            // Engagement bonus
            score += Math.min(10, (p.viewCount || 0) / 50); // Up to +10 for high view counts
            score += Math.min(5, (p.likeCount || 0));        // Up to +5 for likes
            score += Math.min(5, (p.commentCount || 0));     // Up to +5 for comments

            // Recency bonus (posts from last 7 days get a boost)
            const ageMs = Date.now() - new Date(p.createdAt).getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            if (ageDays < 1) score += 8;
            else if (ageDays < 3) score += 5;
            else if (ageDays < 7) score += 2;

            return {
                ...p,
                content: content.slice(0, 150), // Trim content for preview
                score
            };
        });

        scoredPosts.sort((a, b) => b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const topPosts = scoredPosts.slice(startIndex, endIndex);
        const postsHasMore = scoredPosts.length > endIndex;

        res.json({
            users: topUsers.map(({ score, bio, location, ...rest }) => rest),
            posts: topPosts.map(({ score, ...rest }) => rest),
            usersHasMore,
            postsHasMore
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

export default router;
