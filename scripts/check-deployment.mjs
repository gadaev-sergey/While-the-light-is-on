import {chromium, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

const url = new URL(process.argv[2] || 'http://127.0.0.1:4173/While-the-light-is-on/');
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Provide an HTTP(S) game URL.');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const failures = [];
const loadedImages = new Set();
await mkdir('artifacts/deployment', {recursive: true});

async function openGame(options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    const asset = new URL(response.url());
    if (asset.origin === url.origin && /\.(png|svg|js|css)$/.test(asset.pathname)) {
      if (!asset.pathname.startsWith(url.pathname)) failures.push(`Asset outside deployment path: ${asset.pathname}`);
      if (asset.pathname.endsWith('.png')) loadedImages.add(asset.pathname);
    }
  });
  await page.goto(url.href, {waitUntil: 'networkidle', timeout: 60000});
  await expect(page.locator('#base-loading')).toBeHidden({timeout: 60000});
  await expect(page.locator('#base-canvas')).toBeVisible();
  expect(await page.evaluate(() => '__BASE__' in window)).toBe(false);
  return {context, page};
}

try {
  const {page, context} = await openGame({viewport: {width: 1440, height: 1000}});
  await expect(page.locator('#interact')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(1250);
  await page.keyboard.up('KeyA');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#quick-water')).toHaveText('1', {timeout: 10000});
  await page.keyboard.press('KeyF');
  await expect(page.locator('#flashlight')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('KeyF');
  await expect(page.locator('#flashlight')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyM');
  await expect(page.getByRole('heading', {name: 'План дома', exact: true})).toBeVisible();
  await expect(page.locator('.plan-room')).toHaveCount(6);
  await page.getByRole('button', {name: 'Закрыть', exact: true}).click();
  await page.getByRole('button', {name: 'Время суток', exact: true}).click();
  await page.getByRole('button', {name: 'Ночь', exact: true}).click();
  await expect(page.locator('#base-clock')).toHaveText('00:00');
  await page.getByRole('button', {name: 'День', exact: true}).click();
  await expect(page.locator('#base-clock')).toHaveText('12:00');
  await page.keyboard.press('Escape');
  await expect(page.locator('#time-panel')).toBeHidden();
  await page.screenshot({path: 'artifacts/deployment/desktop.png'});
  await context.close();

  const mobile = await openGame({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  expect(await mobile.page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(mobile.page.locator('.touch-controls')).toBeVisible();
  await expect(mobile.page.locator('#quick-wood')).toHaveText('0');
  await expect(mobile.page.locator('#interact')).toHaveAttribute('aria-disabled', 'true');
  await mobile.page.locator('#flashlight').tap();
  await expect(mobile.page.locator('#flashlight')).toHaveAttribute('aria-pressed', 'false');
  await mobile.page.getByRole('button', {name: 'Время суток', exact: true}).tap();
  await mobile.page.getByRole('button', {name: 'Утро', exact: true}).tap();
  await expect(mobile.page.locator('#base-clock')).toHaveText('07:00');
  await mobile.page.screenshot({path: 'artifacts/deployment/mobile.png'});
  await mobile.context.close();

  for (const asset of ['base/district', 'base/materials', 'base/furniture', 'base/objects', 'base/dog', 'base/house-damage', 'developer-walk', 'developer-attack', 'developer-left-punch']) {
    expect(loadedImages.has(`${url.pathname}assets/${asset}.png`), `Missing image: ${asset}`).toBe(true);
  }
  expect(failures).toEqual([]);
  console.log(`Deployment OK: ${url.href}\n9 image assets, desktop and mobile interaction, flashlight, map and time controls; no runtime or network errors.`);
} finally {
  await browser.close();
}
