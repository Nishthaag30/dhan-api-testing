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
  const totalMinutes = hours * 60 + minutes;

  const marketOpen = 9 * 60 + 15;  // 09:15 IST
  const marketClose = 15 * 60 + 30; // 15:30 IST

  return totalMinutes >= marketOpen && totalMinutes <= marketClose;
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

  const payload = {
    RequestCode: 21, // Market Feed Subscribe
    InstrumentCount: STOCK_INSTRUMENTS.length,
    InstrumentList: STOCK_INSTRUMENTS.map(inst => ({
      ExchangeSegment: inst.exchange,
      SecurityId: inst.securityId,
    })),
  };

  ws.send(JSON.stringify(payload));

  console.log(
    `[DhanSocket] Subscribed to ${STOCK_INSTRUMENTS.length} instruments`
  );

  const modePayload = {
    RequestCode: 16, // Set mode
    Mode: 1,         // LTP
  };

  ws.send(JSON.stringify(modePayload));
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

function handleMessage(data: WebSocket.Data) {
  try {
    console.log('handleMessage called');
    console.log('data', data);
    if (!Buffer.isBuffer(data)) return;

    // Packet type
    const packetType = data.readInt16LE(0);

    // 1 = LTP packet
    if (packetType !== 1) return;

    const securityId = data.readInt32LE(2).toString();
    const ltp = data.readFloatLE(6);

    const symbol =
      SECURITY_ID_TO_SYMBOL.get(securityId) ??
      `securityId:${securityId}`;

    console.log(`[LTP] ${symbol} → ₹${ltp}`);
  } catch (err) {
    console.error('[DhanSocket] Tick parse error', err);
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
    subscribeToStockCodes();
  });

  console.log('ws.onmessage', ws.onmessage);
  console.log('Calling handleMessage');
  ws.on('message', handleMessage);

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
// Auto-init (Server only)
// =====================
if (typeof window === 'undefined') {
  if (!global.__dhanSocketStarted) {
    global.__dhanSocketStarted = true;
    initDhanSocket();
  }
}
