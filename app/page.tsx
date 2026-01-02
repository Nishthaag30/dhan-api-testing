'use client';

import { useEffect, useState } from 'react';

interface TickData {
  securityId: number;
  symbol: string;
  price: number;
  timestamp: number;
  messageType: number;
  messageTypeLabel: string;
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [tickCount, setTickCount] = useState(0);

  useEffect(() => {
    console.log('[Frontend] Connecting to tick stream...');
    
    const eventSource = new EventSource('/api/ticks');

    eventSource.onopen = () => {
      console.log('[Frontend] ✅ Connected to tick stream');
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'initial') {
          console.log('[Frontend] 📊 Initial tick data:', data.data);
          console.log(`[Frontend] Loaded ${data.data.length} initial ticks`);
        } else if (data.type === 'tick') {
          const tick: TickData = data.data;
          setTickCount((prev) => prev + 1);
          
          // Log tick data to console
          console.log(
            `[Frontend] 🎯 [${tick.messageTypeLabel}] ${tick.symbol} (ID: ${tick.securityId}) | Price: ₹${tick.price.toFixed(2)} | Timestamp: ${new Date(tick.timestamp * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`
          );
          console.log('[Frontend] Full tick data:', tick);
        } else if (event.data === ': heartbeat') {
          // Heartbeat, ignore
        }
      } catch (error) {
        console.error('[Frontend] Error parsing SSE data:', error, event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[Frontend] ❌ SSE connection error:', error);
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      console.log('[Frontend] Disconnecting from tick stream');
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Dhan WebSocket Live Market Data</h1>
      <p>
        This Next.js app maintains a global WebSocket connection to Dhan for live market data.
      </p>
      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <p>
          <strong>Status:</strong>{' '}
          <span style={{ color: isConnected ? 'green' : 'red' }}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </p>
        <p>
          <strong>Ticks received:</strong> {tickCount}
        </p>
        <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
          Check the browser console to see live stock price updates.
        </p>
      </div>
      <p style={{ marginTop: '1rem' }}>
        <a href="/api/health" style={{ color: 'blue' }}>Health Check</a>
      </p>
    </main>
  );
}
