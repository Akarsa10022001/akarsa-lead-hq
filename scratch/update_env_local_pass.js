const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
let content = fs.readFileSync(envPath, 'utf8');

if (content.includes('GMAIL_APP_PASSWORD=')) {
  content = content.replace(/GMAIL_APP_PASSWORD=.*/g, 'GMAIL_APP_PASSWORD="kjdoqgnjdgcvmnrx"');
} else {
  content += '\nGMAIL_APP_PASSWORD="kjdoqgnjdgcvmnrx"\n';
}

if (!content.includes('GMAIL_USER=')) {
  content += '\nGMAIL_USER="beakarsa@gmail.com"\n';
}

fs.writeFileSync(envPath, content, 'utf8');
console.log("SUCCESS: Updated GMAIL_APP_PASSWORD in .env.local!");
