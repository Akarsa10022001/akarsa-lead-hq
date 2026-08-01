import { NextResponse } from 'next/server';

export const maxDuration = 300; // 5 mins
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // EMERGENCY KILL-SWITCH ACTIVE: Block all touch enqueueing and draft generation
  return NextResponse.json({
    error: 'TOUCH ENQUEUEING DISABLED',
    message: 'All draft generation and touch enqueueing has been urgently disabled to prevent duplicate sends.'
  }, { status: 503 });
}
