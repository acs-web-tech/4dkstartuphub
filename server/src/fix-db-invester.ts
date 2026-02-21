import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const db = mongoose.connection.db;

    if (!db) {
        console.error("DB connection no longer active");
        return;
    }

    // Find all users with user_type: "invester" directly via mongodb native driver
    const users = await db.collection('users').find({ user_type: 'invester' }).toArray();
    console.log(`Found ${users.length} users with 'invester' type.`);

    for (const u of users) {
        await db.collection('users').updateOne(
            { _id: u._id },
            { $set: { user_type: 'investor' } }
        );
        console.log(`Updated user ${u.email} (${u._id})`);
    }

    console.log("✅ Done fixing 'invester' typos.");
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
