
import 'dotenv/config';
import { initializeDatabase } from './config/database';
import User from './models/User';

/**
 * Script to fix bad enum data in User collection.
 * Specifically 'invester' -> 'investor'
 * Usage: npx tsx src/fix-user-data.ts
 */
async function fixUserData() {
    try {
        await initializeDatabase();
        console.log('🔧 Checking for user data issues...');

        // 1. Fix 'invester' typo
        const badTypeUsers = await User.find({ user_type: 'invester' });

        if (badTypeUsers.length > 0) {
            console.log(`Found ${badTypeUsers.length} users with 'invester' typo.`);

            for (const user of badTypeUsers) {
                // By engaging Mongoose, we might error on save unless we update directly or careful set
                // Better to use updateOne/updateMany to bypass mongoose validation check on the BAD data
                await User.updateOne(
                    { _id: user._id },
                    { $set: { user_type: 'investor' } }
                );
                console.log(`✅ Fixed user ${user.email} (invester -> investor)`);
            }
        } else {
            console.log('✅ No users found with "invester" typo.');
        }

        console.log('✨ Data fix complete.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Data fix failed:', err);
        process.exit(1);
    }
}

fixUserData();
