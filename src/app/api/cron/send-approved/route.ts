import { NextResponse } from 'next/server';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // EMERGENCY KILL-SWITCH ACTIVE: Block all automated email sending
  return NextResponse.json({
    error: 'AUTOMATED SENDING DISABLED',
    message: 'Automated email sending is urgently disabled to prevent duplicate outbound emails.'
  }, { status: 503 });
}
