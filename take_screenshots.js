const { chromium } = require('playwright');
const fs = require('fs');

const url = 'http://localhost:3000/';
const outputDir = '/Users/ritikomsharma/.gemini/antigravity/brain/4d07a9f1-dbdb-4e5c-aa55-fa93020438f6/';

async function takeScreenshots() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  const pagesToCapture = [
    { name: 'home', path: '' },
    { name: 'radar', path: 'radar' },
    { name: 'campaigns', path: 'campaigns' },
    { name: 'inbox', path: 'inbox' },
    { name: 'activity', path: 'activity' },
  ];

  for (const p of pagesToCapture) {
    // Dark
    await page.goto(url + p.path, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outputDir}${p.name}_dark.png`, fullPage: true });

    // Light
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outputDir}${p.name}_light.png`, fullPage: true });
  }

  await browser.close();
  console.log('Screenshots saved successfully!');
}

takeScreenshots().catch(console.error);
