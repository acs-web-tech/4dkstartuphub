const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/stphub');
        const db = mongoose.connection.db;

        console.log('=== ALL USERS ===');
        const users = await db.collection('users').find({}).toArray();
        for (const u of users) {
            console.log(`  ${u.email} | role=${u.role} | reset=${u.pitch_limit_reset_date} | created=${u.created_at}`);
        }

        console.log('\n=== ALL PITCHES ===');
        const pitches = await db.collection('pitchrequests').find({}).sort({ created_at: -1 }).toArray();
        for (const p of pitches) {
            const owner = users.find(u => u._id.toString() === p.user_id.toString());
            console.log(`  "${p.title}" by ${owner?.email || p.user_id} at ${p.created_at}`);
        }

        console.log('\n=== PITCH LIMIT SETTING ===');
        const setting = await db.collection('settings').findOne({ key: 'pitch_upload_limit' });
        console.log('  pitch_upload_limit:', setting ? setting.value : 'NOT FOUND');

        console.log('\n=== QUOTA CHECK FOR EACH USER ===');
        for (const u of users) {
            const resetDate = u.pitch_limit_reset_date || u.created_at || new Date(0);
            const count = await db.collection('pitchrequests').countDocuments({
                user_id: u._id,
                created_at: { $gte: resetDate }
            });
            console.log(`  ${u.email}: ${count} pitches since ${resetDate} (role: ${u.role})`);
        }

        console.log('\n=== SETTINGS DUMP ===');
        const allSettings = await db.collection('settings').find({}).toArray();
        for (const s of allSettings) {
            console.log(`  ${s.key} = ${s.value}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
