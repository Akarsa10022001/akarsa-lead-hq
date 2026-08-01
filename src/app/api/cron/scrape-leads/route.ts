import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // EMERGENCY KILL-SWITCH ACTIVE: Ingestion is paused while scoring & filters are rewritten
  return NextResponse.json({
    error: 'INGESTION DISABLED',
    message: 'Lead ingestion is urgently disabled while quality gates and scoring logic are under remediation.'
  }, { status: 503 });
}
