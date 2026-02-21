const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const crypto = require('crypto');
const isDev = process.env.NODE_ENV !== 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isDev ? 'dev-secret-key-change-in-prod' : crypto.randomBytes(64).toString('hex'));

function generateToken(userId, role) {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
}

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/stphub');
        const db = mongoose.connection.db;
        const user = await db.collection('users').findOne({ email: 'agencyarun5@gmail.com' });

        if (!user) return console.log('user not found');

        const token = generateToken(user._id.toString(), 'user');
        console.log('Token:', token);

        const res = await fetch('http://localhost:5000/api/pitch', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: 'Test Pitch',
                description: 'test'
            })
        });

        const json = await res.json();
        console.log('Status:', res.status);
        console.log('Response:', json);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
