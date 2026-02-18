import * as admin from 'firebase-admin';
import type { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import path from 'path';
import fs from 'fs';

// Initialize Firebase Admin SDK
// Uses GOOGLE_APPLICATION_CREDENTIALS env var OR falls back to service-account.json

let firebaseApp: App | null = null;

try {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (serviceAccountPath) {
        firebaseApp = admin.initializeApp({
            credential: admin.credential.applicationDefault(),
        });
        console.log('✅ Firebase Admin initialized (Env Var)');
    } else {
        // Fallback: Try to load service-account.json from known locations
        const candidates = [
            path.resolve(__dirname, '../../service-account.json'),   // dist/config -> server/
            path.resolve(__dirname, '../../../service-account.json'), // dist/src/config -> server/
            path.resolve(process.cwd(), 'service-account.json'),     // cwd (e.g. /app/server)
        ];

        let loaded = false;
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                try {
                    const serviceAccount = JSON.parse(fs.readFileSync(candidate, 'utf8'));
                    firebaseApp = admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount),
                    });
                    console.log(`✅ Firebase Admin initialized (File: ${candidate})`);
                    loaded = true;
                    break;
                } catch (parseErr) {
                    console.error(`❌ Failed to parse service account at ${candidate}:`, parseErr);
                }
            }
        }

        if (!loaded) {
            console.warn('⚠️ Firebase Admin NOT initialized. Native push notifications will not work.');
            console.warn('   Searched paths:', candidates.join(', '));
        }
    }
} catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error);
}

/**
 * Returns the Firebase Messaging instance if Firebase was successfully initialized.
 * Using the app instance directly avoids the "default app does not exist" error.
 */
export function getFirebaseMessaging() {
    if (!firebaseApp) return null;
    try {
        return getMessaging(firebaseApp);
    } catch (err) {
        console.error('❌ Failed to get Firebase Messaging instance:', err);
        return null;
    }
}

/** @deprecated Use getFirebaseMessaging() instead */
export const firebaseAdmin = firebaseApp ? admin : null;
