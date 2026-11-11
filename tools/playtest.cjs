// Scripted browser play-test of hero, ability, item and shop flows.
// Usage: node tools/playtest.cjs [outDir] [faction]
// Drives the real input paths (keyboard hotkeys, mouse clicks on the canvas
// and the command card) and prints the game state after each step.
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { resolve, join } = require('node:path');

(async () => {
  const [outDir = '.', faction = 'crown'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  await page.mouse.move(800, 400);
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + `?quick&f=${faction}&e=iron`);
  await page.mouse.move(800, 400);
  await page.waitForTimeout(2500);

  let shotN = 0;
  const shot = async (name) => { await page.screenshot({ path: join(outDir, `pt_${faction}_${++shotN}_${name}.png`) }); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // advance the simulation quickly (processes events like the real loop)
  const ff = (seconds) => ev((s) => {
    const g = window.game;
    for (let i = 0; i < s * 20; i++) { g.world.step(); g.processEvents(g.world.events); g.world.events.length = 0; }
  }, seconds);
  const screenOf = (id) => ev((id) => {
    const g = window.game; const e = g.world.byId.get(id);
    const r = g.renderer.worldToScreen(e.x, e.y, g.world.map.heightAt(e.x, e.y) + 0.6);
    const rect = g.renderer.renderer?.domElement?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    return { x: r.x + (rect.left || 0), y: r.y + (rect.top || 0) };
  }, id);
  const log = async (label) => {
    const s = await ev(() => {
      const g = window.game; const w = g.world;
      const sel = g.selection;
      const heroes = w.entities.filter((e) => e.owner === 0 && e.hero && !e.removed);
      return {
        gold: Math.floor(w.players[0].gold), lumber: Math.floor(w.players[0].lumber),
        sel: sel.map((e) => e.def.id), card: g.cardMode, target: g.targetMode ? g.targetMode.kind || 'yes' : null,
        heroes: heroes.map((h) => ({ id: h.def.id, lvl: h.hero.level, pts: h.hero.skillPoints, hp: Math.round(h.hp), mana: Math.round(h.mana), abil: h.abilities.map((a) => a.def.id + ':' + a.level), inv: h.hero.inventory.map((it) => it ? it.def.id : null) })),
      };
    });
    console.log(label.padEnd(28), JSON.stringify(s));
  };

  // --- setup: resources, altar and shop next to the town hall ---
  const ids = await ev((fac) => {
    const g = window.game; const w = g.world; const p = w.players[0];
    p.gold = 20000; p.lumber = 20000;
    const hall = w.entities.find((e) => e.owner === 0 && e.def.mainHall);
    const pre = { crown: 'cr', iron: 'ir', sepulchral: 'sep', twilight: 'tw' }[fac];
    const altarId = pre + '_altar';
    const free = (size, dx, dy) => {
      for (let r = 0; r < 14; r++) for (let a = 0; a < 16; a++) {
        const tx = Math.round(hall.x + dx + Math.cos(a / 16 * Math.PI * 2) * r), ty = Math.round(hall.y + dy + Math.sin(a / 16 * Math.PI * 2) * r);
        let ok = true;
        for (let y = ty - 1; y < ty + size + 1 && ok; y++) for (let x = tx - 1; x < tx + size + 1 && ok; x++) if (!w.map.inBounds(x, y) || w.map.blocked[w.map.idx(x, y)] || w.map.treeAt[w.map.idx(x, y)] >= 0) ok = false;
        if (ok) return [tx, ty];
      }
      return [Math.round(hall.x + dx), Math.round(hall.y + dy)];
    };
    const [ax, ay] = free(3, 7, 0);
    const altar = w.spawnBuilding(altarId, 0, ax, ay, true);
    g.selectIds([altar.id]);
    return { altar: altar.id, hall: hall.id };
  }, faction);
  await page.waitForTimeout(400);
  await log('altar selected');
  await shot('altar');

  // train the first hero by clicking the first command-card button
  await page.click('.cmdcard [data-slot="0"]');
  await page.waitForTimeout(200);
  await ff(60);
  await page.waitForTimeout(300);
  await page.keyboard.press('F1');
  await page.waitForTimeout(300);
  await log('hero trained + F1');

  // learn skills: L then Q, L then W
  await page.keyboard.press('l'); await page.waitForTimeout(150);
  await log('learn card');
  await page.keyboard.press('q'); await page.waitForTimeout(250);
  await log('learned Q');

  // spawn an enemy grunt near the hero and cast Q on it
  const enemy = await ev(() => {
    const g = window.game; const w = g.world;
    const h = w.entities.find((e) => e.owner === 0 && e.hero && !e.removed);
    const u = w.spawnUnit('ir_warrior', 1, h.x + 3, h.y, 0);
    h.hero.xp += 2000; // grant levels to test level ups
    return u.id;
  });
  await ff(1);
  await page.waitForTimeout(400);
  await page.keyboard.press('F1');
  await page.waitForTimeout(200);
  await log('after xp');
  await page.keyboard.press('q'); await page.waitForTimeout(150);
  await log('Q pressed (targeting?)');
  const ep = await screenOf(enemy);
  await page.mouse.move(ep.x, ep.y); await page.waitForTimeout(150);
  await page.mouse.click(ep.x, ep.y);
  await page.waitForTimeout(150);
  await ff(2);
  await page.waitForTimeout(300);
  await log('after cast');
  const eState = await ev((id) => { const e = window.game.world.byId.get(id); return { hp: Math.round(e.hp), buffs: e.buffs.map((b) => b.def.id), alive: e.alive }; }, enemy);
  console.log('enemy'.padEnd(28), JSON.stringify(eState));
  await shot('cast');

  // learn every remaining point through the UI
  for (let i = 0; i < 6; i++) {
    for (const k of ['w', 'e', 'q', 'r']) { await page.keyboard.press('l'); await page.waitForTimeout(80); await page.keyboard.press(k); await page.waitForTimeout(80); }
  }
  await log('learned all');

  // shop: spawn a shop next to the hero, select it and buy the first item
  const shop = await ev((fac) => {
    const g = window.game; const w = g.world;
    const pre = { crown: 'cr_shop', iron: 'ir_post', sepulchral: 'sep_vault', twilight: 'tw_cache' }[fac];
    const h = w.entities.find((e) => e.owner === 0 && e.hero && !e.removed);
    let s = null;
    for (let r = 2; r < 12 && !s; r++) for (let a = 0; a < 12 && !s; a++) {
      const tx = Math.round(h.x + Math.cos(a / 12 * Math.PI * 2) * r), ty = Math.round(h.y + Math.sin(a / 12 * Math.PI * 2) * r);
      let ok = true;
      for (let y = ty; y < ty + 3 && ok; y++) for (let x = tx; x < tx + 3 && ok; x++) if (!w.map.inBounds(x, y) || w.map.blocked[w.map.idx(x, y)] || w.map.treeAt[w.map.idx(x, y)] >= 0) ok = false;
      if (ok) s = w.spawnBuilding(pre, 0, tx, ty, true);
    }
    g.selectIds([s.id]);
    return s.id;
  }, faction);
  await ff(0.5);
  await page.waitForTimeout(300);
  await shot('shop');
  await page.click('.cmdcard [data-slot="0"]');
  await page.waitForTimeout(150);
  await page.click('.cmdcard [data-slot="1"]');
  await page.waitForTimeout(150);
  await ff(0.5);
  await page.keyboard.press('F1');
  await page.waitForTimeout(300);
  await log('after shop buys');
  await shot('inventory');

  // use the first inventory item through its hotkey (Z)
  await ev(() => { const h = window.game.world.entities.find((e) => e.owner === 0 && e.hero && !e.removed); h.hp = h.st.maxHp * 0.3; h.mana = 0; });
  await page.keyboard.press('z'); await page.waitForTimeout(150);
  await log('pressed Z');
  await ff(1);
  await log('after item use');

  // kill the hero and revive at the altar
  await ev(() => { const h = window.game.world.entities.find((e) => e.owner === 0 && e.hero && !e.removed); window.opus.kill(window.game.world, h, null); });
  await ff(1);
  await ev((id) => window.game.selectIds([id]), ids.altar);
  await page.waitForTimeout(300);
  await shot('revive_card');
  const reviveSlot = await ev(() => { const b = window.game.hud.buttons.find((x) => x.tip.includes('Revive')); return b ? b.slot : -1; });
  console.log('revive slot'.padEnd(28), reviveSlot);
  if (reviveSlot >= 0) await page.click(`.cmdcard [data-slot="${reviveSlot}"]`);
  await ff(60);
  await log('after revive');

  // Esc menu and options open/close
  await page.keyboard.press('F10'); await page.waitForTimeout(300);
  await shot('menu');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no console errors');
  await browser.close();
})();
