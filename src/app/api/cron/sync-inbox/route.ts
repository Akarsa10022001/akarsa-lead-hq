import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import Imap from 'imap-simple';
import { simpleParser } from 'mailparser';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = process.env.GMAIL_USER || 'beakarsa@gmail.com';
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!pass) {
    return NextResponse.json({ success: false, error: 'IMAP credentials not configured' }, { status: 400 });
  }

  const config = {
    imap: {
      user: user,
      password: pass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 15000
    }
  };

  try {
    const connection = await Imap.connect(config);
    await connection.openBox('INBOX');

    // Fetch messages from the last 60 days to ensure no read/opened replies are missed
    const searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - 60);
    const dateStr = searchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const searchCriteria = [['SINCE', dateStr]];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false
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
        const sender = mail.from?.value[0]?.address?.toLowerCase();
        if (!sender || sender === user.toLowerCase()) continue;

        // Find associated lead by email
        const { data: lead } = await supabase
          .from('leads')
          .select('id, email, status')
          .ilike('email', sender)
          .maybeSingle();

        if (lead) {
          // Find or create sequence
          let { data: sequence } = await supabase
            .from('outreach_sequences')
            .select('id')
            .eq('lead_id', lead.id)
            .maybeSingle();

          if (!sequence) {
            const { data: newSeq } = await supabase
              .from('outreach_sequences')
              .insert({ lead_id: lead.id, status: 'active' })
              .select()
              .single();
            sequence = newSeq;
          }

          if (sequence) {
            // Check if already logged
            const { data: existing } = await supabase
              .from('outreach_messages')
              .select('id')
              .eq('sequence_id', sequence.id)
              .eq('status', 'received')
              .maybeSingle();

            if (!existing) {
              await supabase
                .from('outreach_messages')
                .insert({
                  sequence_id: sequence.id,
                  step_number: 1,
                  channel: 'email',
                  draft_content: mail.text || mail.html || mail.subject || '(Empty Body)',
                  sent_at: new Date(mail.date || Date.now()).toISOString(),
                  status: 'received'
                });

              await supabase
                .from('leads')
                .update({ status: 'Replied' })
                .eq('id', lead.id);

              syncedCount++;
            }
          }
        }
      } catch (err) {
        console.error('[Inbox Sync] Error parsing message', err);
      }
    }

    connection.end();

    return NextResponse.json({
      success: true,
      message: `Inbox synced successfully. Logged ${syncedCount} new lead replies.`,
      synced: syncedCount
    });

  } catch (error: any) {
    console.error('[Inbox Sync] IMAP Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const GET = POST;
