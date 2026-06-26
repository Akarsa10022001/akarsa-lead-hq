import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendWhatsAppTemplate } from '@/lib/outreach/whatsapp';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { leadId, templateName, channel = 'whatsapp', testPhone, emailSubject, emailBody, targetEmail } = await req.json();

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

    if (seqError) {
      console.error("Error creating sequence:", seqError);
      throw new Error("Failed to create outreach sequence");
    }
    const sequenceId = sequence.id;

    // 4. Send Message (WhatsApp or Email)
    let sendResult = null;
    if (channel === 'whatsapp') {
      if (!lead.phone && !testPhone) {
         throw new Error("Lead does not have a phone number for WhatsApp.");
      }
      
      const phoneToSend = testPhone ? testPhone.replace(/\D/g, '') : lead.phone.replace(/\D/g, '');

      sendResult = await sendWhatsAppTemplate({
        to: phoneToSend,
        templateName: templateName || 'akarsa_initial_contact',
        components: [
          { type: "body", parameters: [{ type: "text", text: lead.contact_name || lead.company_name }] }
        ]
      });
    } else if (channel === 'email') {
      if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured.");
      }
      
      const { data, error } = await resend.emails.send({
        from: 'Akarsa <founder@akarsa.in>', // Note: the user will need to verify a domain in Resend
        to: [targetEmail],
        subject: emailSubject,
        text: emailBody,
      });

      if (error) {
        throw new Error(`Resend Error: ${error.message}`);
      }
      sendResult = data;
    }

    // 5. Log the sent message
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
