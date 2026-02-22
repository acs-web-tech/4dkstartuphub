import mongoose from 'mongoose';
import User from './server/src/models/User';
import { config } from './server/src/config/env';

async function checkUsers() {
    try {
        await mongoose.connect(config.mongodbUri);
        console.log('Connected to MongoDB');

        const problematicUsers = await User.find({
            $or: [
                { payment_status: { $ne: 'completed' }, is_active: true },
                { is_email_verified: false, is_active: true }
            ]
        });

        console.log(`Found ${problematicUsers.length} potentially problematic users:`);
        problematicUsers.forEach(u => {
            console.log(`- ${u.username} (${u.email}): Active=${u.is_active}, Payment=${u.payment_status}, EmailVerified=${u.is_email_verified}, PremiumExpiry=${u.premium_expiry}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkUsers();
