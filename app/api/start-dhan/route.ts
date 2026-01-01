// /api/start-dhan/route.ts
// API route to start Dhan WebSocket connection
// Can be called manually or via Vercel cron job
import { NextResponse } from 'next/server';
import { initDhanSocket } from '@/lib/dhanSocket';

export async function GET() {
  initDhanSocket(); // starts WebSocket
  return NextResponse.json({ status: 'ok', msg: 'Dhan WebSocket started' });
}
