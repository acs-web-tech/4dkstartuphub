import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from './config/env';
import Post from './models/Post';
import Comment from './models/Comment';

async function check() {
    try {
        await mongoose.connect(config.mongodbUri);
        console.log('✅ Connected to MongoDB');

        console.log('Checking for posts with title "I need a life partner"...');

        const posts = await Post.find({
            title: { $regex: /life partner/i }
        });

        const results = await Promise.all(posts.map(async p => {
            const commentCount = await Comment.countDocuments({ post_id: p._id });
            return {
                id: p._id.toString(),
                title: p.title,
                createdAt: p.created_at,
                comment_count: commentCount
            };
        }));

        console.table(results);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
