/** * Health check API route * 
 * This endpoint keeps the server running and ensures the WebSocket * connection is initialized when the module is imported. */ 
import { NextResponse } from 'next/server'; 
import { initDhanSocket, getSocketStatus } from '@/lib/dhanSocket'; 
// Initialize WebSocket connection on first API call (server startup) 
// This ensures the connection is established when the server starts 

initDhanSocket(); 

export async function GET() { 
  const socketStatus = getSocketStatus(); 
  return NextResponse.json({ 
    status: 'ok', 
    websocket: socketStatus 
  }); 
}