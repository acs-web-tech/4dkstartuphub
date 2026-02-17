import * as admin from 'firebase-admin';
import { config } from './env';

// Initialize Firebase Admin SDK
// This requires either GOOGLE_APPLICATION_CREDENTIALS environment variable 
// to be set to the path of your serviceAccountKey.json, 
// OR passing the service account object directly if you prefer (not recommended for repo).

try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
        });
        console.log('✅ Firebase Admin initialized');
    } else {
        // Fallback or warning
        console.warn('⚠️ Firebase Admin NOT initialized. Native push notifications will not work.');
        console.warn('   Ensure GOOGLE_APPLICATION_CREDENTIALS is set to your service account key path.');
    }
} catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error);
}

export const firebaseAdmin = admin;
