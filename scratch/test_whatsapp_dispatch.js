const fs = require('fs');
const path = require('path');

const envLocal = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const envVars = {};
envLocal.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    let val = parts.slice(1).join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    envVars[key] = val;
  }
});

const token = envVars.WHATSAPP_ACCESS_TOKEN;
const phoneId = envVars.WHATSAPP_PHONE_NUMBER_ID;

console.log("=== CHECKING WHATSAPP METAS API CREDENTIALS ===");
console.log("WHATSAPP_ACCESS_TOKEN present:", !!token);
console.log("WHATSAPP_PHONE_NUMBER_ID present:", !!phoneId);

async function testWhatsAppApi() {
  if (!token || !phoneId) {
    console.error("WhatsApp credentials missing in .env.local");
    return;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log("Meta API Response for Phone ID:", data);
  } catch (e) {
    console.error("WhatsApp Meta API Fetch Error:", e.message);
  }
}

testWhatsAppApi();
