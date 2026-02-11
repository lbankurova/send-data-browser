const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // 1. Validation view — Data quality mode (default)
  console.log('Loading validation view (data quality)...');
  await page.goto('http://localhost:5173/studies/PointCross/validation', {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });
  await page.waitForSelector('button', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: 'C:/pg/pcc/screenshot-val-dq.png' });
  console.log('Screenshot 1: Data quality mode');

  // 2. Click "Study design" tab
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => el.textContent);
    if (text && text.trim().startsWith('Study design')) {
      await btn.click();
      console.log('Clicked Study design tab');
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: 'C:/pg/pcc/screenshot-val-sd.png' });
  console.log('Screenshot 2: Study design mode');

  // 3. Navigate via ?mode=study-design&rule=SD-003 (simulating Review → link)
  console.log('Testing deep link with ?mode=study-design&rule=SD-003...');
  await page.goto('http://localhost:5173/studies/PointCross/validation?mode=study-design&rule=SD-003', {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });
  await page.waitForSelector('button', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: 'C:/pg/pcc/screenshot-val-deeplink.png' });
  console.log('Screenshot 3: Deep link to SD-003');

  await browser.close();
})();
