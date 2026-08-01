const { Resend } = require('resend');
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

const resendKey = envVars.RESEND_API_KEY;
console.log("RESEND_API_KEY present:", !!resendKey);

if (resendKey) {
  const resend = new Resend(resendKey);
  resend.emails.send({
    from: 'onboarding@resend.dev',
    to: 'beakarsa@gmail.com',
    subject: 'Akarsa Outreach Test',
    text: 'Testing Resend email dispatch integration.'
  }).then(res => {
    console.log("Resend Dispatch Success:", res);
  }).catch(err => {
    console.error("Resend Dispatch Error:", err.message);
  });
}
