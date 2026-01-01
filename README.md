# Dhan WebSocket Live Market Data - Next.js

A Next.js (App Router) application that maintains a global WebSocket connection to Dhan for live market data updates.

## Features

- ✅ Single, global WebSocket connection (singleton pattern)
- ✅ Auto-reconnect with exponential backoff
- ✅ Subscribes to ~220 stock symbols on connection
- ✅ Logs live price updates to server console
- ✅ Independent of user requests
- ✅ Node.js runtime (not Edge)

## Prerequisites

- Node.js 18+ installed
- Dhan API credentials (Client ID and Access Token)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   
   Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` and add your Dhan credentials:
   ```
   DHAN_CLIENT_ID=your_actual_client_id
   DHAN_ACCESS_TOKEN=your_actual_access_token
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Check the console:**
   
   Once the server starts, you should see:
   - `[DhanSocket] Initializing Dhan WebSocket connection...`
   - `[DhanSocket] Connecting to Dhan WebSocket...`
   - `[DhanSocket] WebSocket connected successfully`
   - `[DhanSocket] Subscription sent for 220 stocks`
   - Live price updates: `{ symbol: 'RELIANCE.NS', price: 2456.50 }`

## Project Structure

```
.
├── app/
│   ├── api/
│   │   └── health/
│   │       └── route.ts          # Health check endpoint
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── lib/
│   └── dhanSocket.ts             # WebSocket singleton implementation
├── stockCodes.ts                 # Array of stock symbols to subscribe to
├── next.config.js                # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
└── package.json                  # Dependencies
```

## How It Works

1. **Singleton Pattern:** The `lib/dhanSocket.ts` module uses a singleton pattern to ensure only one WebSocket connection exists throughout the server's lifecycle.

2. **Auto-Initialization:** The WebSocket connection is automatically established when the module is first imported (when the server starts).

3. **Subscription:** Once connected, the app automatically subscribes to all stock symbols defined in `stockCodes.ts`.

4. **Message Handling:** Live price updates (LTP messages) are parsed and logged to the console in the format: `{ symbol: string, price: number }`

5. **Auto-Reconnect:** If the connection drops, the app automatically attempts to reconnect with exponential backoff (starting at 5 seconds, max 60 seconds).

## API Endpoints

- `GET /api/health` - Returns `{ status: "ok", websocket: "open" | "connecting" | "closed" | "not_initialized" }`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DHAN_CLIENT_ID` | Your Dhan API Client ID | Yes |
| `DHAN_ACCESS_TOKEN` | Your Dhan API Access Token | Yes |

## WebSocket Connection Details

- **URL:** `wss://api-feed.dhan.co`
- **Authentication:** Via query parameters (`token`, `clientId`, `authType=2`)
- **Subscription Format:** `{ t: 'sub', s: [array of stock symbols] }`
- **Message Format:** `{ t: 'ltp', s: symbol, ltp: price }`

## Notes

- The WebSocket connection is established once when the server starts
- Connection persists regardless of user requests
- All logging is done to the server console
- No frontend WebSocket connections are used
- No polling or setInterval is used

## Troubleshooting

1. **No connection:** Check that `DHAN_CLIENT_ID` and `DHAN_ACCESS_TOKEN` are set correctly in `.env.local`

2. **Connection drops:** The app will automatically attempt to reconnect. Check the console for reconnection messages.

3. **No price updates:** Verify that your Dhan API subscription includes access to live market data via WebSockets.

## License

MIT

