export interface SendWhatsAppParams {
  to: string; // The recipient's phone number with country code (e.g., 919876543210)
  templateName: string; // The name of the approved template in Meta Ad Manager
  languageCode?: string; // default: 'en'
  components?: any[]; // Dynamic variables for the template
}

export interface SendWhatsAppTextParams {
  to: string;
  message: string;
}

/**
 * Sends a WhatsApp template message using the official Meta Cloud API.
 * 
 * IMPORTANT: This function NEVER mocks success. If credentials are missing,
 * it throws an error so the caller knows the message was NOT sent.
 */
export async function sendWhatsAppTemplate(params: SendWhatsAppParams): Promise<any> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      'WhatsApp Cloud API credentials not configured. ' +
      'Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in environment variables.'
    );
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  
  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: {
        code: params.languageCode || 'en'
      },
      components: params.components || []
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`WhatsApp API Error: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Sends a free-text WhatsApp message (only works within 24h customer service window).
 * For first-contact, use sendWhatsAppTemplate() instead.
 */
export async function sendWhatsAppText(params: SendWhatsAppTextParams): Promise<any> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      'WhatsApp Cloud API credentials not configured. ' +
      'Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in environment variables.'
    );
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "text",
    text: {
      preview_url: false,
      body: params.message
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`WhatsApp Text API Error: ${JSON.stringify(data)}`);
  }

  return data;
}
