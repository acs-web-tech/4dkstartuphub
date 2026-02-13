import 'dotenv/config';

import { initializeDatabase } from '../src/config/database';
import User from '../src/models/User';

const args = process.argv.slice(2);
const email = args[0]?.toLowerCase();

if (!email) {
    console.error('Please provide the email address of the user to promote.');
    console.error('Usage: npx tsx scripts/make-admin.ts <email>');
    process.exit(1);
}

async function run() {
    try {
        await initializeDatabase();

        console.log(`Searching for user with email: ${email}`);

        const user = await User.findOne({ email: email });

        if (!user) {
            console.error('User not found!');
            return;
        }

        console.log(`Found user: ${user.username} (${user._id})`);
        console.log(`Current role: ${user.role}`);

        if (user.role === 'admin') {
            console.log('User is already an admin.');
            return;
        }

        user.role = 'admin';
        await user.save();

        console.log('✅ Successfully promoted user to admin!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error promoting user:', err);
        process.exit(1);
    }
}

run();
