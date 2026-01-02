# Firebase Setup for Stock Price Storage

## Overview
Stock prices from the Dhan WebSocket are automatically stored in Firestore under the `stocks` collection.

## Firestore Structure

Each stock is stored as a document with the stock name as the document ID:

```
stocks/
  ├── RELIANCE/
  │   ├── stockName: "RELIANCE"
  │   ├── price: 2456.50
  │   ├── securityId: 1333
  │   ├── timestamp: 1234567890
  │   └── updatedAt: 2024-01-01T10:15:32Z
  ├── TCS/
  │   └── ...
  └── ...
```

## Firebase Admin SDK Setup

### For Local Development

1. **Option 1: Use Application Default Credentials (Recommended)**
   - Install Google Cloud SDK
   - Run: `gcloud auth application-default login`
   - Firebase Admin SDK will automatically use these credentials

2. **Option 2: Use Service Account Key**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Generate a new private key (JSON file)
   - Set environment variable:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
     ```

### For Vercel Deployment

1. **Generate Service Account Key**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Download the JSON file

2. **Add to Vercel Environment Variables**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add a new variable:
     - **Name**: `FIREBASE_SERVICE_ACCOUNT_KEY`
     - **Value**: Paste the entire contents of the service account JSON file as a string
   - **Alternative**: Use `GOOGLE_APPLICATION_CREDENTIALS` if you prefer file-based approach

## Environment Variables

The code supports the following environment variables:

- `FIREBASE_SERVICE_ACCOUNT_KEY`: JSON string of service account credentials
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account JSON file (for local development)

## How It Works

1. When a stock price tick is received from Dhan WebSocket
2. The price is parsed and extracted
3. `saveStockPrice()` is called asynchronously
4. Firestore document is created/updated with:
   - Document ID = stock name (e.g., "RELIANCE")
   - Fields: stockName, price, securityId, timestamp, updatedAt
5. Uses `merge: true` so existing documents are updated, new ones are created

## Testing

After setup, check your Firestore console to see stocks being updated in real-time as prices come in from the WebSocket.

