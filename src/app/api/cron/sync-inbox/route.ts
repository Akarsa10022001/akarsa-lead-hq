import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import Imap from 'imap-simple';
import { simpleParser } from 'mailparser';

// This cron job connects to the Gmail inbox, checks for UNSEEN replies,
// and syncs them into the database so they appear in the Radar/Inbox.
export async function POST() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return NextResponse.json({ success: false, error: 'IMAP credentials not configured' }, { status: 400 });
  }

  const config = {
    imap: {
      user: user,
      password: pass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      authTimeout: 10000
    }
  };

  try {
    const connection = await Imap.connect(config);
    await connection.openBox('INBOX');

    // Fetch unseen messages
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    let syncedCount = 0;

    for (const item of messages) {
      try {
        const all = item.parts.find(part => part.which === '');
        const id = item.attributes.uid;
        const idHeader = "Imap-Id: " + id + "\r\n";
        
        if (!all?.body) continue;
        
        const mail = await simpleParser(idHeader + all.body);
        
        // Extract sender email
        const sender = mail.from?.value[0]?.address;
        if (!sender) continue;

        // Skip our own emails
        if (sender.toLowerCase() === user.toLowerCase()) continue;

        // Find the lead associated with this sender email
        const { data: lead } = await supabase
          .from('leads')
          .select('id, email, status')
          .ilike('email', sender)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lead) {
          // Find the most recent active sequence for this lead
          const { data: sequence } = await supabase
            .from('outreach_sequences')
            .select('id')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (sequence) {
            // Log the reply
            await supabase
              .from('outreach_messages')
              .insert({
                sequence_id: sequence.id,
                step_number: 1, // Treat as reply to step 1
                channel: 'email',
                draft_content: mail.text || mail.html || '(Empty Body)',
                sent_at: new Date(mail.date || Date.now()).toISOString(),
                status: 'received'
              });

            // Update lead status to Replied
            await supabase
              .from('leads')
              .update({ status: 'Replied' })
              .eq('id', lead.id);

            syncedCount++;
            console.log(`[Inbox Sync] Synced reply from ${sender}`);
          }
        }
      } catch (err) {
        console.error('[Inbox Sync] Error parsing message', err);
      }
    }

    connection.end();

    return NextResponse.json({
      success: true,
      message: `Inbox synced successfully. Found ${syncedCount} new lead replies.`,
      synced: syncedCount
    });

  } catch (error: any) {
    console.error('[Inbox Sync] IMAP Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
