import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import nodemailer from 'nodemailer';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Gather stats for the last 24 hours
    const startOfYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // New Leads Discovered
    const { count: discovered } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('enriched_at', startOfYesterday);

    // Messages Ready to Send
    const { count: ready } = await supabase
      .from('outreach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ready_to_send');

    // Hot Replies
    const { count: hotReplies } = await supabase
      .from('outreach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'received')
      .eq('classification', 'human_interested')
      .gte('sent_at', startOfYesterday);

    // 2. Draft Digest Email
    const digestText = `
Akarsa Lead HQ - Daily Digest

Overnight Pipeline Results:
- New Leads Discovered (Last 24h): ${discovered || 0}
- Drafts Ready for Approval: ${ready || 0}
- HOT REPLIES (Last 24h): ${hotReplies || 0}

Please log in to review the approval queue and respond to hot leads.
https://akarsa-lead-hq.vercel.app/
    `;

    // 3. Send Email
    const isGenericSmtp = !!process.env.SMTP_HOST;
    const user = isGenericSmtp ? process.env.SMTP_USER : process.env.GMAIL_USER;
    const pass = isGenericSmtp ? process.env.SMTP_PASS : process.env.GMAIL_APP_PASSWORD;
    const adminEmail = process.env.ADMIN_EMAIL || user;

    if (user && pass && adminEmail) {
      const transporterOptions: any = isGenericSmtp ? {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass }
      } : {
        service: 'gmail',
        auth: { user, pass }
      };

      const transporter = nodemailer.createTransport(transporterOptions);
      await transporter.sendMail({
        from: `"Akarsa Cron" <${user}>`,
        to: adminEmail,
        subject: `[Lead HQ] Daily Digest: ${ready || 0} Drafts Ready, ${hotReplies || 0} Hot Replies`,
        text: digestText,
      });
    }

    return NextResponse.json({
      success: true,
      stats: { discovered, ready, hotReplies }
    });

  } catch (error: any) {
    console.error("Digest error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
