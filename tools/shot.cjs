// Usage: node tools/shot.cjs <url-query> <out.png> [waitMs] [script]
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
(async () => {
  const [query = '', out = 'shot.png', wait = '6000', script = ''] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  await page.mouse.move(800, 400);
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + (query ? '?' + query : ''));
  await page.mouse.move(800, 400);
  await page.waitForTimeout(Number(wait));
  if (script) { const r = await page.evaluate(script); if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 2000)); await page.waitForTimeout(1500); }
  await page.screenshot({ path: out });
  console.log(errors.slice(0, 30).join('\n') || 'no console errors');
  await browser.close();
})();
