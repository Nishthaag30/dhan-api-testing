/**
 * Home page - Simple page to keep the app running
 */

export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Dhan WebSocket Live Market Data</h1>
      <p>
        This Next.js app maintains a global WebSocket connection to Dhan for live market data.
      </p>
      <p>
        Check the server console to see live stock price updates.
      </p>
      <p>
        <a href="/api/health" style={{ color: 'blue' }}>Health Check</a>
      </p>
    </main>
  );
}

