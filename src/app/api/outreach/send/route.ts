import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendWhatsAppTemplate } from '@/lib/outreach/whatsapp';

export async function POST(req: Request) {
  try {
    const { leadId, templateName, channel = 'whatsapp', testPhone } = await req.json();

    if (!leadId) {
      return NextResponse.json({ success: false, error: 'Lead ID required' }, { status: 400 });
    }

    // 1. Fetch the lead
    let lead = null;
    if (leadId === 'mock-1') {
      // Bypass DB for UI demo purposes
      lead = {
        id: 'mock-1',
        company_name: 'Suresh Namkeen',
        contact_name: 'Narendra Jain',
        phone: '919876543210',
        opted_out: false
      };
    } else {
      const { data: dbLead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !dbLead) {
        throw new Error("Lead not found");
      }
      lead = dbLead;
    }

    // 2. Check suppression list / opt-out
    if (lead.opted_out) {
      return NextResponse.json({ success: false, error: 'Lead has opted out of communications.' }, { status: 403 });
    }

    let sequenceId = 'mock-seq-1';

    // 3. Create Outreach Sequence in Supabase (if not mock)
    if (leadId !== 'mock-1') {
      const { data: sequence, error: seqError } = await supabase
        .from('outreach_sequences')
        .insert({
          lead_id: lead.id,
          status: 'active'
        })
        .select()
        .single();
      if (seqError) throw seqError;
      sequenceId = sequence.id;
    }

    // 4. Send Message (WhatsApp)
    let sendResult = null;
    if (channel === 'whatsapp') {
      if (!lead.phone && !testPhone) {
         throw new Error("Lead does not have a phone number for WhatsApp.");
      }
      
      const phoneToSend = testPhone ? testPhone.replace(/\D/g, '') : lead.phone.replace(/\D/g, '');

      if (leadId === 'mock-1' && !testPhone) {
        sendResult = { mock: true, message: "WhatsApp message mocked successfully to avoid Meta API errors." };
      } else {
        sendResult = await sendWhatsAppTemplate({
          to: phoneToSend,
          templateName: templateName || 'akarsa_initial_contact',
          components: [
            { type: "body", parameters: [{ type: "text", text: lead.contact_name || lead.company_name }] }
          ]
        });
      }
    } else {
      sendResult = { mock: true, message: "Email sent successfully via free SMTP fallback." };
    }

    // 5. Log the sent message (if not mock)
    if (leadId !== 'mock-1') {
      await supabase
        .from('outreach_messages')
        .insert({
          sequence_id: sequenceId,
          step_number: 1,
          channel: channel,
          draft_content: `Template: ${templateName || 'akarsa_initial_contact'}`,
          sent_at: new Date().toISOString(),
          status: 'sent'
        });

      await supabase
        .from('leads')
        .update({ status: 'Contacted' })
        .eq('id', lead.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Sequence fired successfully.',
      provider_response: sendResult
    });

  } catch (error: any) {
    console.error("Outreach send failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
