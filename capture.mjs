import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const url = process.env.CAPTURE_URL;
const output = process.env.CAPTURE_DIR;
if (!url || !output) {
  console.error('Set CAPTURE_URL and CAPTURE_DIR.');
  process.exit(1);
}
try { new URL(url); } catch {
  console.error(`Invalid CAPTURE_URL: ${url}`);
  process.exit(1);
}
mkdirSync(output, { recursive: true });

const runtime = join(process.env.HOME || '/home/runner', '.local/share/omgithub-playwright');
const linuxJson = join(runtime, 'linux.json');
if (!existsSync(linuxJson)) {
  console.error(`Missing playwright config: ${linuxJson}`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(linuxJson, 'utf8'));
if (process.platform === 'linux') {
  try {
    const display = readFileSync(join(runtime, 'display'), 'utf8').trim();
    if (!process.env.DISPLAY) process.env.DISPLAY = ':' + display;
  } catch {}
}
const require = createRequire(join(runtime, 'node_modules', 'playwright', 'package.json'));
const { chromium } = require('playwright-core');

const transient = (error) => {
  const e = error instanceof Error ? error : new Error(String(error));
  e.exitCode = 75;
  throw e;
};

let browser;
try {
  browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch(transient);
  for (const [name, width, height, mobile] of [['desktop', 1440, 900, false], ['mobile', 390, 844, true]]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    }).catch(transient);
    const page = await context.newPage().catch(transient);
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => console.error(`[${name}] pageerror:`, error.message));
    const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient);
    const status = response?.status();
    if (!response || !response.ok()) {
      const code = !response || [408, 429, 500, 502, 503, 504].includes(status) ? 75 : 1;
      console.error(`HTTP ${status} loading ${url}`);
      const err = new Error(`HTTP ${status} loading preview`);
      err.exitCode = code;
      throw err;
    }
    await page.locator('body').waitFor({ state: 'visible', timeout: 30000 }).catch(transient);
    await page.locator('#game').waitFor({ state: 'visible', timeout: 30000 }).catch((error) => {
      console.error('Game canvas did not become visible — rendering defect.');
      error.exitCode = 1;
      throw error;
    });
    await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {});
    // Wait for animation frames so the 3D scene is actually rendered.
    await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 15000 }).catch((error) => {
      console.error('Game did not signal readiness — rendering defect.');
      error.exitCode = 1;
      throw error;
    });
    await page.waitForTimeout(2500);
    const pixels = await page.evaluate(() => {
      const c = document.getElementById('game');
      if (!c || !(c instanceof HTMLCanvasElement)) return { ok: false, reason: 'no-canvas' };
      if (c.width < 10 || c.height < 10) return { ok: false, reason: 'canvas-too-small' };
      return { ok: true, w: c.width, h: c.height };
    });
    if (!pixels.ok) {
      console.error(`Rendering defect: ${pixels.reason}`);
      const err = new Error(`Rendering defect: ${pixels.reason}`);
      err.exitCode = 1;
      throw err;
    }
    await page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 }).catch((error) => {
      if (error.name === 'TimeoutError' || !browser.isConnected()) transient(error);
      throw error;
    });
    console.log(`Captured final-${name}.png (${width}x${height})`);
    await context.close();
  }
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = error?.exitCode || 1;
} finally {
  await browser?.close().catch((error) => {
    console.error(error?.message || error);
    process.exitCode ||= 75;
  });
}
