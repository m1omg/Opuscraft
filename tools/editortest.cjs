// Scripted browser test of the map editor: paint, cliffs, ramps, objects,
// validation, save, Skirmish listing and a test game.
// Usage: node tools/editortest.cjs [outDir]
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { resolve, join } = require('node:path');

(async () => {
  const [outDir = '.'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  await page.mouse.move(800, 400);
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?editor');
  await page.waitForTimeout(1500);
  let n = 0;
  const shot = (name) => page.screenshot({ path: join(outDir, `edt_${++n}_${name}.png`) });
  // world tile -> screen point
  const scr = (x, y) => page.evaluate(([x, y]) => {
    const e = window.editor; const r = e.canvas.getBoundingClientRect();
    return { x: r.left + (x - e.ox) * e.zoom, y: r.top + (y - e.oy) * e.zoom };
  }, [x, y]);
  const tool = async (label) => { await page.click(`.ed-tool:has-text("${label}")`); await page.waitForTimeout(50); };
  const click = async (x, y) => { const p = await scr(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(60); };
  const drag = async (pts) => {
    let p = await scr(pts[0][0], pts[0][1]);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (const [x, y] of pts.slice(1)) { p = await scr(x, y); await page.mouse.move(p.x, p.y, { steps: 8 }); }
    await page.mouse.up(); await page.waitForTimeout(60);
  };
  const status = () => page.evaluate(() => ({ msg: document.querySelector('#ed-msg').textContent, check: document.querySelector('#ed-check').innerText, info: document.querySelector('#ed-info').innerText.replace(/\n/g, ' ') }));
  const state = () => page.evaluate(() => { const d = window.editor.doc; return { ramps: d.ramps.length, starts: d.starts.length, mines: d.mines.length, camps: d.camps.length, neutrals: d.neutrals.length, lvl1: d.level.filter((v) => v === 1).length }; });

  await page.selectOption('#ed-sym', 'rot2');
  // dirt road through the middle
  await tool('Dirt');
  await drag([[20, 92], [56, 56], [92, 20]]);
  // raise two symmetric plateaus for the bases
  await page.evaluate(() => { const e = window.editor; e.setBrush(12); });
  await tool('Raise');
  await drag([[24, 88], [28, 84], [24, 84], [28, 88]]);
  console.log('after raise', JSON.stringify(await state()));
  // ramp: click on the plateau edge facing the map centre
  await tool('Ramp');
  const edge = await page.evaluate(() => {
    const d = window.editor.doc;
    for (let k = 0; k < 40; k++) { const x = 26 + k, y = 86 - k; if (d.level[d.idx(x, y)] === 1 && d.level[d.idx(x + 1, y)] === 0) return [x, y]; }
    return null;
  });
  console.log('edge tile', JSON.stringify(edge));
  if (edge) await click(edge[0] + 0.5, edge[1] + 0.5);
  console.log('ramp click', JSON.stringify(await status()), JSON.stringify(await state()));
  // objects
  await tool('Start location'); await click(26.5, 86.5);
  await tool('Gold mine'); await click(20.5, 86.5);
  await tool('Weak camp'); await click(45.5, 70.5);
  await tool('Inn'); await click(56, 56);
  console.log('placed', JSON.stringify(await status()), JSON.stringify(await state()));
  // try an invalid placement (start next to a start) and undo/redo
  await tool('Gold mine'); await click(27.5, 86.5);
  console.log('invalid', (await status()).msg);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  console.log('undo', JSON.stringify(await state()));
  await page.keyboard.press('Control+y'); await page.waitForTimeout(100);
  console.log('redo', JSON.stringify(await state()));
  // plant a forest and add water
  await page.evaluate(() => window.editor.setBrush(5));
  await tool('Plant trees'); await drag([[10, 60], [30, 60], [40, 50]]);
  await tool('Shallow'); await drag([[70, 30], [80, 40]]);
  await page.waitForTimeout(600);
  console.log('check', JSON.stringify(await status()));
  await page.fill('#ed-name', 'Twin Mesas');
  await page.click('[data-act="save"]'); await page.waitForTimeout(200);
  console.log('saved', (await status()).msg);
  await shot('edited');
  // export dialog shows text; import it back
  await page.click('[data-act="share"]'); await page.waitForTimeout(150);
  const text = await page.evaluate(() => document.querySelector('#ed-share').value);
  console.log('export text length', text.length);
  require('node:fs').writeFileSync(join(outDir, 'editor_map.json'), text);
  await page.click('[data-x="import"]'); await page.waitForTimeout(200);
  console.log('import', (await status()).msg);
  // test play
  await page.click('[data-act="test"]'); await page.waitForTimeout(3000);
  const g = await page.evaluate(() => window.game && { map: window.game.world.map.name, players: window.game.world.players.filter((p) => !p.isNeutral).length, ents: window.game.world.entities.length });
  console.log('test game', JSON.stringify(g));
  await shot('testgame');
  // leave the game through the menu
  await page.keyboard.press('F10'); await page.waitForTimeout(300);
  await page.click('button:has-text("Quit")'); await page.waitForTimeout(300);
  const yes = await page.$('button:has-text("Yes")') || await page.$('button:has-text("Leave")') || await page.$('button:has-text("Confirm")');
  if (yes) await yes.click();
  await page.waitForTimeout(800);
  console.log('back in editor', await page.evaluate(() => !!document.querySelector('.ed-root') && document.querySelector('#ed-name').value));
  await page.click('[data-act="exit"]'); await page.waitForTimeout(300);
  const leave = await page.$('[data-x="leave"]');
  if (leave) await leave.click();
  await page.waitForTimeout(800);
  // the saved map appears in Skirmish
  await page.click('button:has-text("Skirmish")'); await page.waitForTimeout(800);
  const listed = await page.evaluate(() => [...document.querySelectorAll('.mapitem .mn')].map((e) => e.textContent));
  console.log('skirmish maps', JSON.stringify(listed));
  await page.click('.mapitem:has-text("Twin Mesas")'); await page.waitForTimeout(300);
  await shot('skirmish');
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no console errors');
  await browser.close();
})();
