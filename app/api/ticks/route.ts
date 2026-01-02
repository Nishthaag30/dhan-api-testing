import { subscribeToTicks } from '@/lib/dhanSocket';

/**
 * Server-Sent Events (SSE) endpoint for streaming tick data to frontend
 */
export async function GET() {
  const encoder = new TextEncoder();
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to tick updates
      unsubscribe = subscribeToTicks(controller);

      // Keep connection alive with periodic heartbeat
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (error) {
          // Client disconnected
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (unsubscribe) unsubscribe();
        }
      }, 30000); // Every 30 seconds
    },
    cancel() {
      // Client disconnected - cleanup
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in nginx
    },
  });
}

