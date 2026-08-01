import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  // EMERGENCY KILL-SWITCH ACTIVE: Block all email dispatches
  return NextResponse.json({
    error: 'EMAIL DISPATCH DISABLED',
    message: 'Email dispatch is urgently disabled to prevent duplicate outbound emails.'
  }, { status: 503 });
}
