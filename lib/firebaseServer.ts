/**
 * Firebase server-side operations using Firebase SDK
 * Used in dhanSocket.ts to store stock prices
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase configuration
const firebaseConfig = {
  projectId: 'rw-technical-webapp',
  // Note: For production, use service account key from environment variable
  // Set GOOGLE_APPLICATION_CREDENTIALS or provide serviceAccount
};

let firestoreDb: ReturnType<typeof getFirestore> | null = null;

function getFirestoreServer() {
  // Don't initialize during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null;
  }

  if (firestoreDb) {
    return firestoreDb;
  }

  try {
    // Initialize Firebase Admin if not already initialized
    if (getApps().length === 0) {
      // Option 1: Use default credentials (if running on GCP or GOOGLE_APPLICATION_CREDENTIALS is set)
      // Option 2: Use service account key from environment variable
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : null;

      if (serviceAccount) {
        initializeApp({
          credential: cert(serviceAccount),
          projectId: firebaseConfig.projectId,
        });
      } else {
        // Use default credentials (for local dev or GCP environments)
        // This will work if GOOGLE_APPLICATION_CREDENTIALS is set or running on GCP
        initializeApp({
          projectId: firebaseConfig.projectId,
        });
      }
    }

    firestoreDb = getFirestore();
    return firestoreDb;
  } catch (error) {
    console.error('[Firebase] Error initializing Admin SDK:', error);
    console.error('[Firebase] Make sure you have Firebase Admin SDK credentials configured');
    return null;
  }
}

/**
 * Store or update stock price in Firestore
 * @param stockName - Stock symbol/name
 * @param price - Current price
 * @param securityId - Security ID
 * @param timestamp - Unix timestamp
 */
export async function saveStockPrice(
  stockName: string,
  price: number,
  securityId: number,
  timestamp: number
) {
  try {
    const db = getFirestoreServer();
    if (!db) {
      console.error('[Firebase] Firestore not initialized - skipping save');
      return;
    }

    // Use stockName as document ID in 'stocks' collection
    const stockRef = db.collection('stocks').doc(stockName);

    await stockRef.set(
      {
        stockName,
        price,
        securityId,
        timestamp,
        updatedAt: new Date(),
      },
      { merge: true } // Merge with existing data if document exists
    );

    // Only log occasionally to avoid spam (log every 10th update or first update)
    if (Math.random() < 0.1 || timestamp % 10 === 0) {
      console.log(`[Firebase] ✅ Updated ${stockName}: ₹${price.toFixed(2)}`);
    }
  } catch (error) {
    console.error(`[Firebase] ❌ Error saving stock price for ${stockName}:`, error);
  }
}

