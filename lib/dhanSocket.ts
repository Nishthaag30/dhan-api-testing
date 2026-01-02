/**
 * Global WebSocket connection to Dhan for live market data
 *
 * Singleton design:
 * - Only ONE WebSocket regardless of number of users
 * - Runs server-side only
 * - Auto reconnect with backoff
 */

import WebSocket from 'ws';
import {
  STOCK_INSTRUMENTS,
  type DhanInstrument,
} from '../stockCodes';

// =====================
// Constants & Env
// =====================
const DHAN_WS_URL = 'wss://api-feed.dhan.co';

const clientId = process.env.DHAN_CLIENT_ID;
const accessToken = process.env.DHAN_ACCESS_TOKEN;

declare global {
  // eslint-disable-next-line no-var
  var __dhanSocketStarted: boolean | undefined;
}

// =====================
// WebSocket State
// =====================
let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isConnecting = false;
let reconnectDelay = 5000;

// =====================
// Tick Data Store (for frontend)
// =====================
export interface TickData {
  securityId: number;
  symbol: string;
  price: number;
  timestamp: number;
  messageType: number;
  messageTypeLabel: string;
}

// Store latest tick data per security ID
const tickDataStore = new Map<number, TickData>();

// SSE clients (for pushing data to frontend)
interface SSEClient {
  controller: ReadableStreamDefaultController;
  id: string;
}

const sseClients = new Map<string, SSEClient>();

export function getTickData(securityId?: number): TickData | Map<number, TickData> {
  if (securityId) {
    return tickDataStore.get(securityId)!;
  }
  return tickDataStore;
}

export function subscribeToTicks(controller: ReadableStreamDefaultController): () => void {
  const id = Math.random().toString(36).substring(7);
  sseClients.set(id, { controller, id });

  // Send initial data
  const initialData = Array.from(tickDataStore.values());
  if (initialData.length > 0) {
    try {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: 'initial', data: initialData })}\n\n`)
      );
    } catch (error) {
      console.error('[DhanSocket] Error sending initial data to SSE client:', error);
    }
  }

  // Return unsubscribe function
  return () => {
    sseClients.delete(id);
  };
}

function broadcastTickData(tickData: TickData) {
  const message = `data: ${JSON.stringify({ type: 'tick', data: tickData })}\n\n`;
  const encoded = new TextEncoder().encode(message);
  
  // Remove closed connections
  const toRemove: string[] = [];
  sseClients.forEach((client, id) => {
    try {
      client.controller.enqueue(encoded);
    } catch (error) {
      // Client disconnected
      toRemove.push(id);
    }
  });
  
  toRemove.forEach((id) => sseClients.delete(id));
}

// =====================
// Instrument Lookups (O(1))
// =====================
const SECURITY_ID_TO_SYMBOL = new Map<string, string>();
const SECURITY_ID_TO_EXCHANGE = new Map<string, string>();

for (const inst of STOCK_INSTRUMENTS) {
  SECURITY_ID_TO_SYMBOL.set(inst.securityId, inst.symbol);
  SECURITY_ID_TO_EXCHANGE.set(inst.securityId, inst.exchange);
}

// =====================
// Validation
// =====================
function validateEnv() {
  if (!clientId || !accessToken) {
    throw new Error(
      'DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN must be set'
    );
  }
}

function validateInstruments() {
  const invalid = STOCK_INSTRUMENTS.filter(
    inst => !inst.securityId || !inst.exchange
  );

  if (invalid.length > 0) {
    console.error('[DhanSocket] Invalid instruments:', invalid);
    throw new Error('Invalid Dhan instrument mapping');
  }
}

function isMarketOpen() {
  const now = new Date();
  const hours = now.getUTCHours() + 5; // IST offset
  const minutes = now.getUTCMinutes();
  const istMinutes =
  now.getUTCHours() * 60 +
  now.getUTCMinutes() +
  330;

  const marketOpen = 9 * 60 + 15;  // 09:15 IST
  const marketClose = 15 * 60 + 30; // 15:30 IST

  return istMinutes >= marketOpen && istMinutes <= marketClose;
}


// =====================
// Subscription
// =====================
function subscribeToStockCodes() {

  if (!isMarketOpen()) {
    console.log('[DhanSocket] Market closed - subscription skipped');
    return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[DhanSocket] WebSocket not open for subscription');
    return;
  }

  validateInstruments();

  // Batch subscriptions - Dhan API may have limits on subscription size
  // RequestCode 15 is the correct code for market feed subscription
  const BATCH_SIZE = 100; // Subscribe in batches to avoid API limits
  
  const totalInstruments = STOCK_INSTRUMENTS.length;
  let subscribedCount = 0;

  for (let i = 0; i < totalInstruments; i += BATCH_SIZE) {
    const batch = STOCK_INSTRUMENTS.slice(i, i + BATCH_SIZE);
    
    const payload = {
      RequestCode: 15, // Market Feed Subscribe (correct code)
      InstrumentCount: batch.length,
      InstrumentList: batch.map(inst => ({
        ExchangeSegment: inst.exchange,
        SecurityId: inst.securityId,
      })),
    };

    const subscriptionMsg = JSON.stringify(payload);
    console.log(
      `[DhanSocket] Sending subscription batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} instruments (${subscribedCount + batch.length}/${totalInstruments})`
    );
    ws.send(subscriptionMsg);
    subscribedCount += batch.length;
  }

  console.log(
    `[DhanSocket] Subscribed to ${totalInstruments} instruments in ${Math.ceil(totalInstruments / BATCH_SIZE)} batches`
  );

  const modePayload = {
    RequestCode: 16, // Set mode
    Mode: 1,         // LTP
  };

  const modeMsg = JSON.stringify(modePayload);
  console.log('[DhanSocket] Sending mode payload:', modeMsg);
  ws.send(modeMsg);
  console.log('[DhanSocket] LTP mode enabled');
}

// =====================
// Message Handling
// =====================
function resolveSymbol(securityId?: string): string {
  if (!securityId) return 'UNKNOWN';
  return (
    SECURITY_ID_TO_SYMBOL.get(String(securityId)) ??
    `securityId:${securityId}`
  );
}

function parseBinaryTick(buffer: Buffer): {
  messageType: number;
  securityId: number;
  price: number;
  timestamp: number;
} | null {
  if (buffer.length < 16) {
    return null; // Invalid message length
  }

  try {
    // Dhan binary tick format (LTP mode - 16 bytes):
    // Byte 0: Feed Response Code (0x02 = LTP, 0x06 = Quote/OI)
    // Bytes 1-2: Message Length (little-endian)
    // Byte 3: Exchange Segment
    // Bytes 4-7: Security ID (4 bytes, little-endian, unsigned int)
    // Bytes 8-11: Last Traded Price (4 bytes, float, little-endian)
    // Bytes 12-15: Last Traded Time (4 bytes, unsigned int, little-endian)

    const messageType = buffer.readUInt8(0);
    // const messageLength = buffer.readUInt16LE(1);
    // const exchangeSegment = buffer.readUInt8(3);
    const securityId = buffer.readUInt32LE(4);
    const price = buffer.readFloatLE(8);
    const timestamp = buffer.readUInt32LE(12);

    return {
      messageType,
      securityId,
      price,
      timestamp,
    };
  } catch (error) {
    console.error('[DhanSocket] Error parsing binary tick:', error);
    return null;
  }
}

function handleMessage(data: WebSocket.Data) {
  try {
    if (!Buffer.isBuffer(data)) {
      console.log('[DhanSocket] [TEXT MESSAGE]', data.toString());
      return;
    }

    // Parse binary tick data
    const tickData = parseBinaryTick(data);
    
    if (!tickData) {
      // If parsing fails, log raw hex for debugging
      console.log(
        '[DhanSocket] [BINARY TICK - UNPARSED]',
        'length =',
        data.length,
        'hex =',
        data.toString('hex').slice(0, 80)
      );
      return;
    }

    const { messageType, securityId, price, timestamp } = tickData;
    const symbol = resolveSymbol(String(securityId));
    
    // Format timestamp (Unix timestamp in seconds)
    const date = new Date(timestamp * 1000);
    const timeStr = date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Message type labels
    const messageTypeLabel = messageType === 0x02 ? 'LTP' : messageType === 0x06 ? 'QUOTE' : `TYPE_${messageType}`;

    // Store tick data
    const tickDataWithSymbol: TickData = {
      securityId,
      symbol,
      price,
      timestamp,
      messageType,
      messageTypeLabel,
    };
    tickDataStore.set(securityId, tickDataWithSymbol);

    // Broadcast to SSE clients
    broadcastTickData(tickDataWithSymbol);

    console.log(
      `[DhanSocket] [${messageTypeLabel}] ${symbol} (ID: ${securityId}) | Price: ₹${price.toFixed(2)} | Time: ${timeStr}`
    );
  } catch (error) {
    console.error('[DhanSocket] Error in handleMessage:', error);
  }
}






// =====================
// WebSocket Lifecycle
// =====================
function connectWebSocket() {
  if (isConnecting || ws) return;

  validateEnv();
  isConnecting = true;

  const wsUrl =
    `${DHAN_WS_URL}?version=2` +
    `&token=${accessToken}` +
    `&clientId=${clientId}` +
    `&authType=2`;

  console.log('[DhanSocket] Connecting...');

  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    isConnecting = false;
    reconnectDelay = 5000;

    console.log('[DhanSocket] Connected');
    console.log('[DhanSocket] ReadyState:', ws?.readyState, '(OPEN =', WebSocket.OPEN, ')');
    console.log('[DhanSocket] Message listeners:', ws?.listeners('message').length);
    subscribeToStockCodes();
  });

  // Log ping/pong for connection health
  ws.on('ping', () => {
    console.log('[DhanSocket] Received ping');
  });

  ws.on('pong', () => {
    console.log('[DhanSocket] Received pong');
  });

  // Register message handler BEFORE 'open' to catch all messages
  ws.on('message', handleMessage);
  console.log('[DhanSocket] Message handler registered, listeners:', ws.listeners('message').length);
  
  // Verify handler is attached
  const listeners = ws.listeners('message');
  console.log('[DhanSocket] Registered message handlers:', listeners.length);
  if (listeners.length === 0) {
    console.error('[DhanSocket] WARNING: No message handlers registered!');
  }

  ws.on('error', err => {
    console.error('[DhanSocket] WebSocket error', err);
  });

  ws.on('close', (code, reason) => {
    console.warn(
      `[DhanSocket] Closed (code=${code}, reason=${reason.toString()})`
    );

    ws = null;
    isConnecting = false;

    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, 60000);
      connectWebSocket();
    }, reconnectDelay);
  });
}

// =====================
// Public API
// =====================
export function initDhanSocket() {
  if (!ws && !isConnecting) {
    connectWebSocket();
  }
}

export function getSocketStatus():
  | 'connecting'
  | 'open'
  | 'closed'
  | 'not_initialized' {
  if (!ws) return isConnecting ? 'connecting' : 'not_initialized';

  switch (ws.readyState) {
    case WebSocket.OPEN:
      return 'open';
    case WebSocket.CONNECTING:
      return 'connecting';
    default:
      return 'closed';
  }
}

export function closeSocket() {
  if (reconnectTimer) clearTimeout(reconnectTimer);

  reconnectTimer = null;
  isConnecting = false;

  if (ws) {
    ws.removeAllListeners();
    ws.close();
    ws = null;
  }

  console.log('[DhanSocket] Closed manually');
}

// =====================
// Auto-init (Server only, skip during build)
// =====================
if (typeof window === 'undefined') {
  // Don't initialize during build/static generation
  // NEXT_PHASE is set during build, VERCEL_ENV is set during runtime on Vercel
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
  
  if (!isBuildTime && !global.__dhanSocketStarted) {
    global.__dhanSocketStarted = true;
    initDhanSocket();
  }
}
