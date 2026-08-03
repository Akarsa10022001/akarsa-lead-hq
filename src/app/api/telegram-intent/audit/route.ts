import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runFullAuditVerification } from '@/lib/telegram-intent/audit_verifier';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();
  try {
    const report = await runFullAuditVerification(supabase);
    return NextResponse.json({
      success: true,
      report
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
