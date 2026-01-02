import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let firestoreDb: FirebaseFirestore.Firestore | null = null;

export function getFirestoreServer() {
  if (firestoreDb) return firestoreDb;

  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

const serviceAccount = base64
  ? JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
  : null;

  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(JSON.parse(serviceAccount)),
    });
  }

  firestoreDb = getFirestore();
  return firestoreDb;
}
