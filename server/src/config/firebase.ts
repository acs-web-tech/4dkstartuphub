import * as admin from 'firebase-admin';
import { config } from './env';

// Initialize Firebase Admin SDK
// This requires either GOOGLE_APPLICATION_CREDENTIALS environment variable 
// to be set to the path of your serviceAccountKey.json, 
// OR passing the service account object directly if you prefer (not recommended for repo).

try {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (serviceAccountPath) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
        });
        console.log('✅ Firebase Admin initialized (Env Var)');
    } else {
        // Fallback: Try to load from root directory
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const serviceAccount = require('../../service-account.json');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('✅ Firebase Admin initialized (Local File)');
        } catch (err) {
            console.warn('⚠️ Firebase Admin NOT initialized. Native push notifications will not work.');
            console.warn('   Ensure GOOGLE_APPLICATION_CREDENTIALS is set or service-account.json exists in server root.');
        }
    }
} catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error);
}

export const firebaseAdmin = admin;
