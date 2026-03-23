import mongoose from 'mongoose';
import { config } from './env';

/**
 * Initializes the MongoDB connection and seeds default settings if they don't exist.
 */
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to MongoDB');

    // Seed default settings in MongoDB
    const Setting = (await import('../models/Setting')).default;
    const defaultSettings = [
      { key: 'registration_payment_required', value: 'true' },
      { key: 'registration_payment_amount', value: '950' },
      { key: 'membership_validity_months', value: '12' },
      { key: 'registration_email_verification_required', value: 'true' },
      { key: 'global_payment_lock', value: 'true' }
    ];

    for (const s of defaultSettings) {
      const exists = await Setting.findOne({ key: s.key });
      if (!exists) {
        await Setting.create(s);
        console.log(`✅ Seeded ${s.key} in MongoDB`);
      }
    }

    // Auto-heal User post counts
    try {
      const User = (await import('../models/User')).default;
      const Post = (await import('../models/Post')).default;
      const users = await User.find({}, '_id username post_count');
      for (const u of users) {
        const actualCount = await Post.countDocuments({ user_id: u._id });
        if (u.post_count !== actualCount) {
          await User.updateOne({ _id: u._id }, { $set: { post_count: actualCount } });
          console.log(`✅ Auto-healed post count for ${u.username}: ${actualCount}`);
        }
      }
    } catch (healErr) {
      console.error('⚠️ Could not auto-heal post counts:', healErr);
    }

    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    throw err; // Fail fast if we can't connect to primary DB
  }
}

export default {}; // Deprecated dbHelper
