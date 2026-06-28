import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { sendWhatsAppTemplate } from '@/lib/outreach/whatsapp';
import nodemailer from 'nodemailer';

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

      // Instead of relying on the Meta Cloud API (which requires approved templates and expiring tokens),
      // we generate a direct wa.me link for the prospector to send the personalized draft directly.
      sendResult = {
        type: "wa.me",
        url: `https://wa.me/${phoneToSend}?text=${encodeURIComponent(emailBody)}`
      };
    } else if (channel === 'email') {
      const isGenericSmtp = !!process.env.SMTP_HOST;
      const user = isGenericSmtp ? process.env.SMTP_USER : process.env.GMAIL_USER;
      const pass = isGenericSmtp ? process.env.SMTP_PASS : process.env.GMAIL_APP_PASSWORD;

      if (!user || !pass) {
        throw new Error("Email credentials (GMAIL_USER/GMAIL_APP_PASSWORD or SMTP_USER/SMTP_PASS) are not configured.");
      }
      
      const transporterOptions: any = isGenericSmtp ? {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: { user, pass }
      } : {
        service: 'gmail',
        auth: { user, pass }
      };

      const transporter = nodemailer.createTransport(transporterOptions);

      const info = await transporter.sendMail({
        from: `"Akarsa" <${user}>`,
        to: targetEmail,
        subject: emailSubject,
        text: emailBody,
      });

      sendResult = info;
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
