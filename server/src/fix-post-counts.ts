import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

import { config } from './config/env';
import User from './models/User';
import Post from './models/Post';

async function fixPostCounts() {
    try {
        await mongoose.connect(config.mongodbUri);
        console.log('Connected to MongoDB');

        const users = await User.find({});
        console.log(`Found ${users.length} users. Recalculating post counts...`);

        let fixedCount = 0;
        for (const user of users) {
            const actualPostCount = await Post.countDocuments({ user_id: user._id });
            if (user.post_count !== actualPostCount) {
                console.log(`User ${user.username} - fixing: ${user.post_count} -> ${actualPostCount}`);
                user.post_count = actualPostCount;
                await user.save({ validateBeforeSave: false }); // Bypass validation for older schema matches
                fixedCount++;
            }
        }

        console.log(`Done! Fixed ${fixedCount} users' post counts.`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

fixPostCounts();
