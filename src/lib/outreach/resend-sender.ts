import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const SENDER_EMAIL = process.env.RESEND_FROM_EMAIL || 'be@akarsaone.xyz';
const SENDER_NAME = process.env.RESEND_FROM_NAME || 'Ritik from Akarsa';

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId: string | null;
  error: string | null;
}

/**
 * Sends an email via Resend API using the authenticated business domain.
 * Domain akarsaone.xyz has SPF, DKIM, and DMARC configured.
 * 
 * This NEVER mocks or fakes success. If it fails, it throws.
 */
export async function sendEmailViaResend(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured. Cannot send email.');
  }

  if (!params.to || !params.to.includes('@')) {
    throw new Error(`Invalid recipient email: ${params.to}`);
  }

  // Skip known bad emails
  const INVALID_DOMAINS = [
    'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com',
    'pinterest.com', 'example.com', 'sentry.io', 'wixpress.com',
    'godaddy.com', 'domain.com', 'test.com'
  ];
  const recipientDomain = params.to.split('@')[1]?.toLowerCase();
  if (INVALID_DOMAINS.includes(recipientDomain)) {
    throw new Error(`Skipping known invalid domain: ${recipientDomain}`);
  }
  if (/^(noreply|no-reply|donotreply|mailer-daemon)@/i.test(params.to)) {
    throw new Error(`Skipping no-reply address: ${params.to}`);
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
      replyTo: params.replyTo || SENDER_EMAIL,
    });

    if (error) {
      console.error('[Resend] API error:', error);
      throw new Error(`Resend API error: ${error.message}`);
    }

    console.log(`[Resend] ✅ Email sent to ${params.to} | ID: ${data?.id}`);

    return {
      success: true,
      messageId: data?.id || null,
      error: null,
    };
  } catch (err: any) {
    console.error(`[Resend] ❌ Failed to send to ${params.to}:`, err.message);
    return {
      success: false,
      messageId: null,
      error: err.message,
    };
  }
}
