import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { initializeDatabase } from './config/database';
import { config } from './config/env';
import User from './models/User';
import Post from './models/Post';
import Comment from './models/Comment';
import Like from './models/Like';
import ChatRoom from './models/ChatRoom';
import ChatRoomMember from './models/ChatRoomMember';
import ChatMessage from './models/ChatMessage';
import Notification from './models/Notification';

/**
 * Seed script to create initial admin user and sample data.
 * Run with: npm run seed
 */
async function seed() {
    try {
        await initializeDatabase();

        console.log('🌱 Seeding database...\n');

        // Clear existing data (caution!)
        await Promise.all([
            User.deleteMany({}),
            Post.deleteMany({}),
            Comment.deleteMany({}),
            Like.deleteMany({}),
            ChatRoom.deleteMany({}),
            ChatRoomMember.deleteMany({}),
            ChatMessage.deleteMany({}),
            Notification.deleteMany({})
        ]);

        console.log('🧹 Cleared existing data');

        // Create admin user
        const adminPassword = bcrypt.hashSync('Admin@123', config.bcryptRounds);
        const adminUser = await User.create({
            username: 'admin',
            email: 'admin@startuphub.com',
            password_hash: adminPassword,
            display_name: 'Admin',
            role: 'admin',
            bio: 'Platform administrator',
            profile_completed: true,
            is_active: true,
            payment_status: 'completed'
        });
        console.log('✅ Admin user created: admin@startuphub.com / Admin@123');

        // Create sample users
        const usersData = [
            { username: 'priya_tech', displayName: 'Priya Sharma', email: 'priya@example.com', bio: 'Full-stack developer | Startup enthusiast | Building the future 🚀' },
            { username: 'rajesh_k', displayName: 'Rajesh Kumar', email: 'rajesh@example.com', bio: 'Angel Investor | 10+ exits | Looking for the next big thing' },
            { username: 'anitha_m', displayName: 'Anitha Murugan', email: 'anitha@example.com', bio: 'UI/UX Designer | Previously at Zoho | Open to co-founding' },
            { username: 'vikram_s', displayName: 'Vikram Singh', email: 'vikram@example.com', bio: 'Product Manager | SaaS enthusiast | Coffee addict ☕' },
            { username: 'deepa_r', displayName: 'Deepa Rajan', email: 'deepa@example.com', bio: 'Marketing Strategist | Growth hacker | D2C focus' },
        ];

        const userPassword = bcrypt.hashSync('User@1234', config.bcryptRounds);
        const createdUsers = await Promise.all(usersData.map(u =>
            User.create({
                username: u.username,
                email: u.email,
                password_hash: userPassword,
                display_name: u.displayName,
                bio: u.bio,
                profile_completed: true,
                is_active: true,
                payment_status: 'completed'
            })
        ));
        console.log(`✅ ${createdUsers.length} sample users created (password: User@1234)`);

        // Create sample posts
        const allUsers = [adminUser, ...createdUsers];
        const samplePosts = [
            { title: '🔥 Looking for a TECH CO-FOUNDER', content: 'Hello everyone,\n\nI am building a fintech startup focused on micro-lending for small businesses in rural Tamil Nadu. Looking for a technical co-founder who can lead the engineering team.', category: 'cofounder' },
            { title: '📢 Launching from Puducherry | Built to Scale Pan-India', content: 'Excited to announce that our food-tech startup ZenEats is officially launching next month!', category: 'promote' },
            { title: '💼 Hiring Full-Stack Developers | Remote-First', content: 'We\'re a Series A funded EdTech startup and we\'re expanding our engineering team!', category: 'hiring' },
            { title: '🎤 Tamil Startup Summit 2026 - Save the Date!', content: 'Mark your calendars! The biggest startup event in South India is back.', category: 'events' },
            { title: '📝 My Journey: From ₹0 to ₹1Cr ARR in 18 Months', content: 'A year and a half ago, I quit my corporate job at TCS to build a SaaS product for small retailers.', category: 'writeup' },
            { title: '🤔 Looking for Recommendation: Best Accounting Software', content: 'Hey community!\n\nWe\'re a bootstrapped B2B startup (team of 8) looking for affordable accounting software.', category: 'recommendation' },
            { title: '🌟 Open to Work | Product Designer with 5+ years', content: 'Hi all! I\'m Anitha, a product designer with 5+ years of experience, previously at Zoho and Freshworks.', category: 'hiring' },
        ];

        for (let i = 0; i < samplePosts.length; i++) {
            const p = samplePosts[i];
            const author = allUsers[i % allUsers.length];
            const post = await Post.create({
                user_id: author._id,
                title: p.title,
                content: p.content,
                category: p.category
            });

            // Add likes
            for (let j = 0; j < 3; j++) {
                const liker = allUsers[(i + j + 1) % allUsers.length];
                await Like.create({
                    post_id: post._id,
                    user_id: liker._id
                });
            }

            // Add a comment
            const commenter = allUsers[(i + 2) % allUsers.length];
            await Comment.create({
                post_id: post._id,
                user_id: commenter._id,
                content: 'This is awesome! Would love to connect and learn more. 🙌'
            });
        }
        console.log(`✅ ${samplePosts.length} sample posts created with likes and comments`);

        // Create sample chat rooms
        const chatRoomsData = [
            { name: 'General Discussion', description: 'A place for open discussions about startups, technology, and entrepreneurship' },
            { name: 'Founders Circle', description: 'Exclusive space for startup founders to share experiences and advice' },
            { name: 'Tech & Engineering', description: 'Discuss tech stacks, architecture decisions, and engineering challenges' },
            { name: 'Funding & Investment', description: 'Discuss fundraising strategies, pitch deck tips, and investor relations' },
        ];

        for (const roomData of chatRoomsData) {
            const room = await ChatRoom.create({
                name: roomData.name,
                description: roomData.description,
                created_by: adminUser._id
            });

            // Add members
            await ChatRoomMember.create({ room_id: room._id, user_id: adminUser._id });
            for (const user of createdUsers.slice(0, 3)) {
                await ChatRoomMember.create({ room_id: room._id, user_id: user._id });
            }

            // Add sample messages
            const sampleMessages = [
                'Hey everyone! Welcome to this chat room 👋',
                'Excited to be here! Looking forward to great conversations.',
                'Has anyone tried the new AI tools for startups?',
            ];
            for (let i = 0; i < sampleMessages.length; i++) {
                const sender = allUsers[i % allUsers.length];
                await ChatMessage.create({
                    room_id: room._id,
                    user_id: sender._id,
                    content: sampleMessages[i]
                });
            }
        }
        console.log(`✅ ${chatRoomsData.length} chat rooms created with members and messages`);

        console.log('\n🎉 Seed complete!\n');
        console.log('Login credentials:');
        console.log('  Admin: admin@startuphub.com / Admin@123');
        console.log('  User:  priya@example.com / User@1234');
        console.log('  (All sample users share the same password)');

        process.exit(0);
    } catch (err) {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    }
}

seed();
