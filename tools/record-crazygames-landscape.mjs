import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const chromePath = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.GAME_URL || 'http://127.0.0.1:8081/';
const qaDir = path.resolve('artifacts/crazygames-videos/qa');
fs.mkdirSync(qaDir, { recursive: true });

const url = new URL(baseUrl);
for (const [key, value] of Object.entries({
  captureVideo: '1',
  captureDuration: '15400',
  captureName: 'horde-spark-landscape-witch-elemental-gameplay',
  captureCharacter: 'witch',
  captureEnemyMin: '120',
  start: '299',
  skill: 'thunderjudgment',
  captureSkills: 'thunderjudgment,lavatrail,plague',
  autoplay: '1',
  god: '1',
  vfx: 'high',
})) url.searchParams.set(key, value);

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') console.error(`[browser] ${message.text()}`);
  });
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__videoCaptureStatus?.state === 'recording', null, {
    timeout: 20000,
  });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(qaDir, 'landscape-recording-frame.png') });
  await page.waitForFunction(() => {
    const state = window.__videoCaptureStatus?.state;
    return state === 'complete' || state === 'error';
  }, null, { timeout: 25000 });
  const status = await page.evaluate(() => window.__videoCaptureStatus);
  if (status.state !== 'complete') throw new Error(status.message || 'Capture failed');
  console.log(JSON.stringify(status));
  await context.close();
} finally {
  await browser.close();
}
