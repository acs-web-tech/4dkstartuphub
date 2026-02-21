const mongoose = require('mongoose');
const { Schema } = mongoose;

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/stphub');

        const UserSchema = new Schema({
            created_at: Date,
            pitch_limit_reset_date: Date,
            email: String
        }, { timestamps: { createdAt: 'created_at' } });
        const User = mongoose.model('User', UserSchema, 'users');

        const PitchSchema = new Schema({
            user_id: Schema.Types.ObjectId,
            created_at: Date
        }, { timestamps: { createdAt: 'created_at' } });
        const Pitch = mongoose.model('Pitch', PitchSchema, 'pitchrequests');

        const user = await User.findOne({ email: 'avpalpandi@gmail.com' });
        if (!user) {
            console.log('User not found');
            process.exit(0);
        }

        const resetDate = user.pitch_limit_reset_date || user.created_at;
        console.log('User:', user.email);
        console.log('ResetDate (Fallback to Join Date):', resetDate);

        const query = {
            user_id: new mongoose.Types.ObjectId(user._id.toString()),
            created_at: { $gte: resetDate }
        };

        const count = await Pitch.countDocuments(query);
        console.log('--- Query Check ---');
        console.log('Query:', JSON.stringify(query, null, 2));
        console.log('Count:', count);

        const allPitches = await Pitch.find({ user_id: user._id });
        console.log('Total Pitches in DB for user:', allPitches.length);
        allPitches.forEach((p, i) => {
            console.log(` Pitch ${i}: At ${p.created_at}, IsMatch: ${p.created_at >= resetDate}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
