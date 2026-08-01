import { NextResponse } from 'next/server';
import { runMLReconcileAndTrain } from '@/lib/ml/scoring-feedback';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await runMLReconcileAndTrain();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[ML API] Reconciliation failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
