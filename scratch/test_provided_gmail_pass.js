const nodemailer = require('nodemailer');

async function testGmailAppPassword() {
  const user = 'beakarsa@gmail.com';
  const pass = 'kjdoqgnjdgcvmnrx';

  console.log(`=== TESTING GMAIL APP PASSWORD AUTH FOR ${user} ===`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  try {
    await transporter.verify();
    console.log("🎉 SUCCESS! Google SMTP authentication verified!");

    const info = await transporter.sendMail({
      from: `"Akarsa Lead HQ" <${user}>`,
      to: 'beakarsa@gmail.com',
      subject: 'Akarsa Lead HQ Live Outbound Verification',
      text: 'Congratulations! Your Gmail App Password authentication is live, verified, and active.'
    });

    console.log(`🎉 TEST EMAIL DISPATCHED SUCCESSFULLY TO GMAIL SENT BOX! MessageId: ${info.messageId}`);
  } catch (err) {
    console.error("GMAIL APP PASSWORD AUTH FAILED:", err.message);
  }
}

testGmailAppPassword();
