const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/stphub');
        const db = mongoose.connection.db;

        const users = await db.collection('users').find({
            pitch_limit_reset_date: { $exists: false }
        }).toArray();

        console.log(`Found ${users.length} users needing pitch_limit_reset_date`);

        for (const u of users) {
            const resetDate = u.created_at || new Date();
            await db.collection('users').updateOne(
                { _id: u._id },
                { $set: { pitch_limit_reset_date: resetDate } }
            );
        }

        console.log('Migration complete');

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
