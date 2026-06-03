import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const getChromePath = () => {
  try {
    return execSync('which google-chrome').toString().trim();
  } catch (e) {
    try {
      return execSync('which chromium-browser').toString().trim();
    } catch (err) {
      return '/usr/bin/google-chrome';
    }
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const chromePath = getChromePath();
  console.log(`Using Chrome binary at: ${chromePath}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 960 });

  console.log('Navigating to site with bypass_auth query...');
  await page.goto('http://localhost:5173/?bypass_auth=true', { waitUntil: 'networkidle0' });
  
  // Set localStorage explicitly to be safe
  await page.evaluate(() => {
    localStorage.setItem('bypass_auth', 'true');
  });

  console.log('Loading Dashboard...');
  await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
  await delay(3000); // Wait for animations and charts to render
  console.log('Capturing dashboard.png...');
  await page.screenshot({ path: 'dashboard.png' });

  console.log('Loading Fuel...');
  await page.goto('http://localhost:5173/fuel', { waitUntil: 'networkidle0' });
  await delay(3000);
  console.log('Capturing fuel.png...');
  await page.screenshot({ path: 'fuel.png' });

  console.log('Loading Train...');
  await page.goto('http://localhost:5173/train', { waitUntil: 'networkidle0' });
  await delay(3000);
  console.log('Capturing train.png...');
  await page.screenshot({ path: 'train.png' });

  console.log('Loading Insights...');
  await page.goto('http://localhost:5173/insights', { waitUntil: 'networkidle0' });
  await delay(3000);
  console.log('Capturing insights.png...');
  await page.screenshot({ path: 'insights.png' });

  await browser.close();
  console.log('Screenshots generated successfully!');
})().catch(err => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});
