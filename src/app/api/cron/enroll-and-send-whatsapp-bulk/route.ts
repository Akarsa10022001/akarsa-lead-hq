import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const token = process.env.WHATSAPP_ACCESS_TOKEN || 'EAFZBNK408TEgBSHa8eIphtkHiFQ6Yxldjva42E4mSX85ZAtsc9GWkBWUIZBuECPsbmbPilSQ3WbTKZBj3AIzvC6Yj4JqsPa316URpyZABKMzPP09BPS6JbkcmuuQ6ua5JAh4ZCv9MpIZC1tiJ7jbBSOyogMxvQSoqYn4ZA2haacBp1DHjCZB84VMqoKD3qZCURBN8zAIdgfbSPzefyeReseC7ii5wxYwAL4CJ6kFUFyuxSRfn8V0l6N6De92BH0LZAE1EZCAyzGH8laYvjWCOLaIMyRLgAZDZD';
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '342672628929944';

    // 1. Fetch leads with valid phone numbers that are 'New'
    let allLeads: any[] = [];
    let pageIndex = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, company_name, phone, phone_e164, geo, location, rating, review_count, status')
        .eq('is_test', false)
        .not('phone', 'is', null)
        .not('phone', 'eq', '')
        .eq('status', 'New')
        .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);

      if (error) break;
      if (data && data.length > 0) {
        allLeads = allLeads.concat(data);
        if (data.length < pageSize) hasMore = false;
        else pageIndex++;
      } else {
        hasMore = false;
      }
    }

    if (!allLeads || allLeads.length === 0) {
      return NextResponse.json({ success: true, message: 'No new phone leads pending WhatsApp bulk send.', sentCount: 0, totalRemainingNew: 0 });
    }

    // 2. Fetch signals for evidence text
    const { data: signals } = await supabase
      .from('lead_signals')
      .select('lead_id, signal_type, evidence_text');

    const signalsByLead: Record<string, string[]> = {};
    (signals || []).forEach(s => {
      signalsByLead[s.lead_id] = signalsByLead[s.lead_id] || [];
      signalsByLead[s.lead_id].push(s.evidence_text);
    });

    const { data: defaultSeq } = await supabase.from('sequences').select('id').limit(1);
    const sequenceId = defaultSeq?.[0]?.id;

    let sentCount = 0;
    const sentResults = [];

    // Process batch of 15 phone leads per click
    const batch = allLeads.slice(0, 15);

    for (const lead of batch) {
      const cleanPhone = (lead.phone_e164 || lead.phone).replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 7) continue;

      const leadEvidences = signalsByLead[lead.id] || [];
      const primaryEvidence = leadEvidences[0] || `Established business in ${lead.geo || lead.location || 'your area'}`;

      const messageText = `Hi ${lead.company_name} Team! Saw your profile in ${lead.geo || lead.location || 'your area'} (${primaryEvidence}). We help top local businesses scale revenue with automated client acquisition. Would you be open to a quick chat?`;

      try {
        // Attempt Meta Cloud API text send
        const metaRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { body: messageText }
          })
        });

        const metaData = await metaRes.json();
        const msgId = metaData?.messages?.[0]?.id || `wa_sent_${Date.now()}`;

        // Create target_sequence if missing
        const { data: targetSeq } = await supabase
          .from('target_sequences')
          .select('id')
          .eq('target_id', lead.id)
          .maybeSingle();

        let targetId = targetSeq?.id;
        if (!targetId) {
          const { data: newTarget } = await supabase
            .from('target_sequences')
            .insert({
              target_id: lead.id,
              sequence_id: sequenceId,
              status: 'active',
              current_step: 1
            })
            .select('id')
            .single();

          targetId = newTarget?.id;
        }

        // Record touch & update status to 'Contacted'
        await supabase.from('touches').insert({
          target_id: lead.id,
          channel: 'whatsapp',
          touch_type: 'initial_outreach',
          direction: 'outbound',
          notes: `1-Click WhatsApp Batch Outreach: ${messageText.substring(0, 100)}...`,
          provider_msg_id: msgId,
          send_status: 'sent'
        });

        await supabase.from('leads').update({ status: 'Contacted' }).eq('id', lead.id);

        sentCount++;
        sentResults.push({ id: lead.id, company: lead.company_name, phone: cleanPhone, messageId: msgId });
      } catch (sendErr: any) {
        console.error(`WhatsApp send error for ${lead.company_name}:`, sendErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      totalRemainingNew: allLeads.length - sentCount,
      sentResults
    });
  } catch (error: any) {
    console.error("enroll-and-send-whatsapp-bulk error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
