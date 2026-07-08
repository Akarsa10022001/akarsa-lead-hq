import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import nodemailer from 'nodemailer';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAILY_EMAIL_CAP = parseInt(process.env.DAILY_EMAIL_CAP || '30', 10);

export async function POST(req: Request) {
  // CRON_SECRET Protection
  const authHeader = req.headers.get('Authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Fetch up to 5 approved messages
    const { data: messages, error: fetchError } = await supabase
      .from('outreach_messages')
      .select(`
        *,
        outreach_sequences!inner(
          lead_id,
          leads!inner(*)
        )
      `)
      .eq('status', 'approved')
      .order('updated_at', { ascending: true })
      .limit(5);

    if (fetchError) throw fetchError;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, message: 'No approved messages to send.' });
    }

    // 2. Process each message
    const results = [];
    let sentCount = 0;

    for (const msg of messages) {
      const lead = msg.outreach_sequences.leads;
      const channel = msg.channel;
      
      try {
        if (channel === 'email') {
          if (!lead.email || !lead.email_verified) {
             throw new Error('Email not verified or missing.');
          }

          // Check daily cap
          const startOfDay = new Date();
          startOfDay.setUTCHours(0,0,0,0);
          const { count: sentToday } = await supabase
            .from('outreach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('channel', 'email')
            .eq('status', 'sent')
            .gte('sent_at', startOfDay.toISOString());

          if (sentToday !== null && sentToday >= DAILY_EMAIL_CAP) {
            console.log(`[Send-Approved] Daily email cap (${DAILY_EMAIL_CAP}) reached. Deferring ${msg.id}.`);
            continue; // Skip without failing, leave as approved
          }

          // Send Email
          const isGenericSmtp = !!process.env.SMTP_HOST;
          const user = isGenericSmtp ? process.env.SMTP_USER : process.env.GMAIL_USER;
          const pass = isGenericSmtp ? process.env.SMTP_PASS : process.env.GMAIL_APP_PASSWORD;

          if (!user || !pass) {
            throw new Error("Email credentials not configured.");
          }
          
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
            from: `"Akarsa" <${user}>`,
            to: lead.email,
            subject: 'Digital Presence Audit', // Can be dynamic
            text: msg.draft_content,
          });

        } else if (channel === 'whatsapp') {
          // Meta Template policy constraints
          if (msg.step_number === 1) {
             // First touch MUST be manual wa.me
             throw new Error('First-touch WhatsApp must be sent manually via UI (wa.me link). Cannot automate.');
          }

          if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
             throw new Error('WhatsApp Cloud API credentials not configured.');
          }

          if (!lead.phone_e164) {
             throw new Error('Lead missing E.164 formatted phone.');
          }

          // Call Meta API
          const phoneToSend = lead.phone_e164.replace('+', '');
          const res = await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phoneToSend,
              type: 'text', // Assuming follow-ups can be text, or change to template if outside 24h window
              text: { body: msg.draft_content }
            })
          });

          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`WhatsApp API Error: ${errBody}`);
          }
        }

        // Mark sent
        await supabase
          .from('outreach_messages')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', msg.id);

        if (msg.step_number === 1) {
          await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);
        }

        results.push({ id: msg.id, status: 'sent' });
        sentCount++;

      } catch (e: any) {
        console.error(`[Send-Approved] Failed to send msg ${msg.id}:`, e.message);
        await supabase
          .from('outreach_messages')
          .update({ status: 'failed', draft_content: msg.draft_content + `\n\nERROR: ${e.message}` })
          .eq('id', msg.id);
        results.push({ id: msg.id, status: 'failed', error: e.message });
      }
    }

    return NextResponse.json({
      success: true,
      sent_count: sentCount,
      results
    });

  } catch (error: any) {
    console.error("[Send-Approved] Cron failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
