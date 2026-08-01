const fs = require('fs');
const path = require('path');

function checkEnv() {
  console.log("=== CHECKING EMAIL DISPATCH ENV VARS ===");
  const envLocalPath = path.join(process.cwd(), '.env.local');
  const envPath = path.join(process.cwd(), '.env');

  let envLocal = '';
  let env = '';

  if (fs.existsSync(envLocalPath)) envLocal = fs.readFileSync(envLocalPath, 'utf8');
  if (fs.existsSync(envPath)) env = fs.readFileSync(envPath, 'utf8');

  console.log("GMAIL_USER in env.local:", envLocal.includes('GMAIL_USER'));
  console.log("GMAIL_APP_PASSWORD in env.local:", envLocal.includes('GMAIL_APP_PASSWORD'));
  console.log("RESEND_API_KEY in env.local:", envLocal.includes('RESEND_API_KEY'));
  console.log("SMTP_HOST in env.local:", envLocal.includes('SMTP_HOST'));

  console.log("Process env GMAIL_USER:", !!process.env.GMAIL_USER);
  console.log("Process env GMAIL_APP_PASSWORD:", !!process.env.GMAIL_APP_PASSWORD);
  console.log("Process env RESEND_API_KEY:", !!process.env.RESEND_API_KEY);
}

checkEnv();
