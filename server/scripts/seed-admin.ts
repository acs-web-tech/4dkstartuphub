import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initializeDatabase } from '../src/config/database';
import User from '../src/models/User';

async function run() {
    try {
        await initializeDatabase();

        const email = 'admin@admin.com';
        const password = 'Password@123';
        const username = 'admin';

        console.log(`Checking for admin user: ${email}`);
        let user = await User.findOne({ email });

        if (user) {
            console.log('Admin user already exists.');
        } else {
            const passwordHash = bcrypt.hashSync(password, 12);
            user = await User.create({
                username,
                email,
                password_hash: passwordHash,
                display_name: 'System Admin',
                role: 'admin',
                is_active: true,
                profile_completed: true
            });
            console.log('✅ Admin user created successfully!');
        }

        console.log('--- ADMIN CREDENTIALS ---');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log('-------------------------');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error seeding admin:', err);
        process.exit(1);
    }
}

run();
