import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendWhatsAppTemplate } from '@/lib/outreach/whatsapp';
import { sendEmailViaResend } from '@/lib/outreach/resend-sender';

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
    let sendResult: any = null;

    if (channel === 'whatsapp') {
      if (!lead.phone && !testPhone) {
         throw new Error("Lead does not have a phone number for WhatsApp.");
      }
      
      const phoneToSend = testPhone ? testPhone.replace(/\D/g, '') : lead.phone.replace(/\D/g, '');

      try {
        // Try sending via Meta Cloud API with the approved template
        sendResult = await sendWhatsAppTemplate({
          to: phoneToSend,
          templateName: templateName || 'akarsa_intro',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: lead.contact_name || lead.company_name || 'there' },
                { type: 'text', text: (emailBody || '').substring(0, 500) }
              ]
            }
          ]
        });
      } catch (waError: any) {
        // If WhatsApp API fails (expired token, no template, etc.), 
        // generate wa.me link as fallback for manual send
        console.warn('[Outreach] WhatsApp API failed, generating manual link:', waError.message);
        sendResult = {
          type: "wa.me_fallback",
          url: `https://wa.me/${phoneToSend}?text=${encodeURIComponent(emailBody || '')}`,
          apiError: waError.message
        };
      }
    } else if (channel === 'email') {
      const recipientEmail = targetEmail || lead.email;
      if (!recipientEmail) {
        throw new Error("Lead does not have an email address.");
      }

      const result = await sendEmailViaResend({
        to: recipientEmail,
        subject: emailSubject || `Quick question for ${lead.company_name}`,
        text: emailBody || '',
      });

      if (!result.success) {
        throw new Error(result.error || 'Email send failed');
      }

      sendResult = { messageId: result.messageId, provider: 'resend' };
    }

    // 5. Log the sent message
    await supabase
      .from('outreach_messages')
      .insert({
        sequence_id: sequenceId,
        step_number: 1,
        channel: channel,
        draft_content: `Template: ${templateName || 'akarsa_intro'}`,
        sent_at: new Date().toISOString(),
        status: sendResult?.type === 'wa.me_fallback' ? 'pending_manual' : 'sent'
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
