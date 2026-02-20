import { parentPort, workerData } from 'worker_threads';
import mongoose from 'mongoose';
import { config } from '../config/env';
import User from '../models/User';
import Post from '../models/Post';
import Comment from '../models/Comment';
import PitchRequest from '../models/PitchRequest';
import Notification from '../models/Notification';
import ChatRoom from '../models/ChatRoom';
import ChatMessage from '../models/ChatMessage';
import Like from '../models/Like';
import Bookmark from '../models/Bookmark';
import PostView from '../models/PostView';
import ChatRoomMember from '../models/ChatRoomMember';
import CleanupJob from '../models/CleanupJob';
import { s3Client, getS3KeyFromUrl } from '../utils/s3';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';

async function connectDB() {
    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(config.mongodbUri);
            console.log('🧹 Cleanup Worker connected to MongoDB');
        }
    } catch (err) {
        console.error('🧹 Cleanup Worker DB error:', err);
        process.exit(1);
    }
}

async function performUserCleanup(userId: string, jobId: string) {
    const job = await CleanupJob.findById(jobId);
    if (!job) return;

    try {
        job.status = 'processing';
        await job.save();

        console.log(`🧹 Starting cleanup for user: ${userId}`);
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // 1. Collect all file URLs to delete from S3
        const s3Keys: string[] = [];

        // From User Avatar
        const userData = await User.findById(userObjectId);
        if (userData?.avatar_url) {
            const key = getS3KeyFromUrl(userData.avatar_url);
            if (key) s3Keys.push(key);
        }

        // From Posts (Images/Videos)
        const userPosts = await Post.find({ user_id: userObjectId });
        for (const post of userPosts) {
            if (post.image_url) {
                const key = getS3KeyFromUrl(post.image_url);
                if (key) s3Keys.push(key);
            }
            if (post.video_url && !post.video_url.includes('youtube') && !post.video_url.includes('vimeo')) {
                const key = getS3KeyFromUrl(post.video_url);
                if (key) s3Keys.push(key);
            }
        }

        // From Pitch Requests (Decks)
        const userPitches = await PitchRequest.find({ user_id: userObjectId });
        for (const pitch of userPitches) {
            if (pitch.deck_url) {
                const key = getS3KeyFromUrl(pitch.deck_url);
                if (key) s3Keys.push(key);
            }
        }

        // 2. Delete files from S3 in batches
        if (s3Keys.length > 0) {
            console.log(`🧹 Deleting ${s3Keys.length} files from S3...`);
            const uniqueKeys = Array.from(new Set(s3Keys));

            // AWS S3 DeleteObjects supports up to 1000 keys
            for (let i = 0; i < uniqueKeys.length; i += 1000) {
                const batch = uniqueKeys.slice(i, i + 1000);
                await s3Client.send(new DeleteObjectsCommand({
                    Bucket: config.aws.bucketName,
                    Delete: {
                        Objects: batch.map(Key => ({ Key }))
                    }
                }));
            }
        }

        // 3. Delete DB Records
        console.log(`🧹 Deleting records from database...`);

        await Post.deleteMany({ user_id: userObjectId });
        await Comment.deleteMany({ user_id: userObjectId });
        await PitchRequest.deleteMany({ user_id: userObjectId });
        await Notification.deleteMany({ $or: [{ sender_id: userObjectId }, { user_id: userObjectId }] });
        await ChatMessage.deleteMany({ user_id: userObjectId });
        await Like.deleteMany({ user_id: userObjectId });
        await Bookmark.deleteMany({ user_id: userObjectId });
        await PostView.deleteMany({ user_id: userObjectId });
        await ChatRoomMember.deleteMany({ user_id: userObjectId });

        // Remove from ChatRooms member lists (if they are members)
        await ChatRoom.updateMany(
            { 'members.id': userId },
            { $pull: { members: { id: userId } }, $inc: { memberCount: -1 } }
        );

        // Finally, delete the user
        await User.findByIdAndDelete(userObjectId);

        job.status = 'completed';
        job.processedAt = new Date();
        job.details = { filesDeleted: s3Keys.length };
        await job.save();

        console.log(`✅ Cleanup completed for user: ${userId}`);
        parentPort?.postMessage({ type: 'completed', userId });

    } catch (error: any) {
        console.error(`❌ Cleanup failed for user ${userId}:`, error);
        job.status = 'failed';
        job.error = error.message;
        await job.save();
        parentPort?.postMessage({ type: 'failed', userId, error: error.message });
    }
}

// Start processing if data is passed
if (workerData?.userId && workerData?.jobId) {
    connectDB().then(() => performUserCleanup(workerData.userId, workerData.jobId));
} else {
    // If started without data, maybe it's meant to poll?
    // For this implementation, we'll launch on demand.
    console.log('🧹 Cleanup Worker started without data.');
}
