export interface SendWhatsAppParams {
  to: string; // The recipient's phone number with country code (e.g., 919876543210)
  templateName: string; // The name of the approved template in Meta Ad Manager
  languageCode?: string; // default: 'en'
  components?: any[]; // Dynamic variables for the template
}

/**
 * Sends a WhatsApp template message using the official Meta Cloud API.
 * This utilizes the free service-conversation tier when initiated properly, 
 * avoiding third-party platform fees like WATI.
 */
export async function sendWhatsAppTemplate(params: SendWhatsAppParams): Promise<any> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn("WhatsApp Cloud API credentials not set in .env");
    // Return a mocked success for testing purposes when keys are absent
    return { mock: true, message: "WhatsApp message mocked successfully." };
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
