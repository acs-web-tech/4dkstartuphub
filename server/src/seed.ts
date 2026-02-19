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
        console.log('🌱 Database initialized. No seed data created.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    }
}

seed();
