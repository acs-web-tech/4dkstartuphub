const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/stphub');
        const db = mongoose.connection.db;

        await db.collection('settings').updateOne(
            { key: 'pitch_upload_limit' },
            { $set: { value: '1', updated_at: new Date() } },
            { upsert: true }
        );

        console.log('Set pitch_upload_limit to 1 in DB');

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
