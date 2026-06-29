const { chromium } = require('playwright');
const fs = require('fs');

const url = 'https://akarsa-lead-hq.vercel.app/';
const outputDir = '/Users/ritikomsharma/.gemini/antigravity/brain/4d07a9f1-dbdb-4e5c-aa55-fa93020438f6/';

async function takeScreenshots() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set viewport for desktop
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Home - Dark
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // wait for animations
  await page.screenshot({ path: `${outputDir}home_dark.png`, fullPage: true });

  // 2. Home - Light
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outputDir}home_light.png`, fullPage: true });

  // 3. Radar - Dark
  await page.goto(url + 'radar', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outputDir}radar_dark.png`, fullPage: true });

  // 4. Radar - Light
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outputDir}radar_light.png`, fullPage: true });

  await browser.close();
  console.log('Screenshots saved successfully!');
}

takeScreenshots().catch(console.error);
