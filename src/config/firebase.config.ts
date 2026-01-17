import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
    console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_PATH not set. Push notifications will be disabled.');
}

let firebaseApp: admin.app.App | null = null;

try {
    if (serviceAccountPath) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const serviceAccount = require(path.resolve(serviceAccountPath));

        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });

        console.log('✅ Firebase Admin SDK initialized successfully');
    }
} catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
}

export const getFirebaseApp = (): admin.app.App | null => firebaseApp;
export const getMessaging = (): admin.messaging.Messaging | null => {
    return firebaseApp ? firebaseApp.messaging() : null;
};

export default firebaseApp;
