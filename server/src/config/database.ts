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
      { key: 'membership_validity_months', value: '12' }
    ];

    for (const s of defaultSettings) {
      const exists = await Setting.findOne({ key: s.key });
      if (!exists) {
        await Setting.create(s);
        console.log(`✅ Seeded ${s.key} in MongoDB`);
      }
    }

    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    throw err; // Fail fast if we can't connect to primary DB
  }
}

export default {}; // Deprecated dbHelper
