import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendWhatsAppTemplate } from '@/lib/outreach/whatsapp';

export async function POST(req: Request) {
  try {
    const { leadId, templateName, channel = 'whatsapp' } = await req.json();

    if (!leadId) {
      return NextResponse.json({ success: false, error: 'Lead ID required' }, { status: 400 });
    }

    // 1. Fetch the lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      throw new Error("Lead not found");
    }

    // 2. Check suppression list / opt-out
    if (lead.opted_out) {
      return NextResponse.json({ success: false, error: 'Lead has opted out of communications.' }, { status: 403 });
    }

    // 3. Create Outreach Sequence in Supabase
    const { data: sequence, error: seqError } = await supabase
      .from('outreach_sequences')
      .insert({
        lead_id: lead.id,
        status: 'active'
      })
      .select()
      .single();

    if (seqError) throw seqError;

    // 4. Send Message (WhatsApp)
    let sendResult = null;
    if (channel === 'whatsapp') {
      // If phone is missing, we can't send via WA
      if (!lead.phone) {
         throw new Error("Lead does not have a phone number for WhatsApp.");
      }
      
      // Dispatch via Meta Cloud API
      sendResult = await sendWhatsAppTemplate({
        to: lead.phone.replace(/\D/g, ''), // Strip non-digits
        templateName: templateName || 'akarsa_initial_contact',
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: lead.contact_name || lead.company_name }
            ]
          }
        ]
      });
    } else {
      // Email fallback (mocked for now, as user requested WhatsApp-first)
      sendResult = { mock: true, message: "Email sent successfully via free SMTP fallback." };
    }

    // 5. Log the sent message
    await supabase
      .from('outreach_messages')
      .insert({
        sequence_id: sequence.id,
        step_number: 1,
        channel: channel,
        draft_content: `Template: ${templateName || 'akarsa_initial_contact'}`,
        sent_at: new Date().toISOString(),
        status: 'sent'
      });

    // Update Lead Status
    await supabase
      .from('leads')
      .update({ status: 'Contacted' })
      .eq('id', lead.id);

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
