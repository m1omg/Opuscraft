import { ABILITIES, DEFS, getDef, UPGRADES } from '../data/registry';
import { MAX_FOOD } from '../data/rules';
import type { Entity, Order } from './entity';
import type { Command } from './events';
import type { World } from './world';
import { setOrder } from './orders';
import { castInstant, castError, EFFECTS } from './abilities';
import { consumeItemCharge } from './heroes';
import { lv } from '../data/registry';
import type { AbilityState } from './entity';
import { cancelConstruction, cancelQueueItem, unloadGarrison } from './economy';
import { buyItem, heroCost, heroHireError, hireHero, hireMerc, learnAbility, sellItem, startRevive } from './heroes';
import { dist } from '../util/math';

const MAX_QUEUE = 7;

function owned(w: World, player: number, ids: number[]): Entity[] {
  const out: Entity[] = [];
  for (const id of ids) {
    const e = w.valid(id);
    if (e && e.owner === player && e.kind === 'unit' && !e.dead) out.push(e);
  }
  return out;
}

function ownedBuilding(w: World, player: number, id: number): Entity | null {
  const e = w.valid(id);
  if (!e || e.owner !== player || !e.b) return null;
  return e;
}

export function applyCommand(w: World, c: Command): void {
  const p = w.players[c.player];
  if (!p || p.defeated) return;
  switch (c.type) {
    case 'order': {
      const units = owned(w, c.player, c.units);
      if (!units.length) return;
      const o = c.order;
      if ((o.type === 'move' || o.type === 'attackMove' || o.type === 'patrol') && o.x !== undefined && o.y !== undefined && units.length > 1) {
        const offs = formation(units, o.x, o.y);
        const group = w.groupCounter++;
        units.forEach((u, i) => {
          const uo: Order = { ...o, fx: offs[i][0], fy: offs[i][1], group };
          if (o.type === 'patrol') {
            uo.ox = u.x;
            uo.oy = u.y;
          }
          setOrder(w, u, uo, c.queued);
        });
        return;
      }
      if (o.type === 'gather' && o.tree !== undefined && units.length > 1) {
        const tree = w.map.trees[o.tree];
        units.forEach((u, i) => {
          let tid = o.tree!;
          if (tree && i > 0) {
            const alt = w.map.nearestTree(tree.tx + 0.5, tree.ty + 0.5, 5, (_t, id) => id !== o.tree || i % 3 === 0);
            if (alt >= 0) {
              tid = alt;
              w.map.trees[alt].workers += 0.2; // nudge distribution
            }
          }
          setOrder(w, u, { ...o, tree: tid }, c.queued);
        });
        for (const t of w.map.trees) t.workers = Math.floor(t.workers);
        return;
      }
      for (const u of units) {
        const uo: Order = { ...o };
        if (o.type === 'patrol') {
          uo.ox = u.x;
          uo.oy = u.y;
        }
        if (o.type === 'garrison' && !u.isWorker) continue;
        const canGather = o.type === 'gather' && (o.tree !== undefined ? !!u.def.harvest?.lumber : !!u.def.harvest?.gold);
        if (o.type === 'gather' && !canGather && u.def.harvest && o.tree === undefined && o.target === undefined) continue;
        if ((o.type === 'gather' && !canGather) || ((o.type === 'repair' || o.type === 'build') && !u.isWorker)) {
          setOrder(w, u, { type: 'move', x: o.x ?? u.x, y: o.y ?? u.y }, c.queued);
          continue;
        }
        if ((o.type === 'pickup' || o.type === 'giveItem' || o.type === 'dropItem') && !u.hero) continue;
        if (o.type === 'root' && !u.def.rootTo) continue;
        setOrder(w, u, uo, c.queued);
      }
      return;
    }
    case 'stop': {
      for (const u of owned(w, c.player, c.units)) setOrder(w, u, null);
      return;
    }
    case 'train': {
      const b = ownedBuilding(w, c.player, c.building);
      if (!b || b.b!.constructing) return;
      const def = DEFS[c.unit];
      if (!def) return;
      const trains = b.def.trains ?? [];
      if (!trains.includes(c.unit)) return;
      if (b.b!.queue.length >= MAX_QUEUE) return w.msg(c.player, 'Queue is full');
      if (b.b!.queue.some((q) => q.kind === 'upgrade')) return w.msg(c.player, 'Building is upgrading');
      const req = w.requirementsMet(c.player, def.requires);
      if (req) return w.msg(c.player, req);
      let gold = def.cost.gold;
      let lumber = def.cost.lumber;
      if (def.hero) {
        const err = heroHireError(w, c.player);
        if (err) return w.msg(c.player, err);
        for (const e of w.entities) if (e.hero && e.def.id === def.id && e.owner === c.player && !e.removed) return w.msg(c.player, 'You already have that hero');
        for (const q of b.b!.queue) if (q.id === def.id) return w.msg(c.player, 'That hero is already being summoned');
        const hc = heroCost(w, c.player);
        gold = hc.gold;
        lumber = hc.lumber;
      }
      const food = def.cost.food ?? 0;
      if (p.gold < gold) return w.msg(c.player, 'Not enough gold');
      if (p.lumber < lumber) return w.msg(c.player, 'Not enough lumber');
      if (food > 0 && p.foodUsed + food > p.foodCap) {
        return w.msg(c.player, p.foodCap >= MAX_FOOD ? 'Food limit reached' : 'Not enough food — build more ' + farmName(w, c.player));
      }
      p.gold -= gold;
      p.lumber -= lumber;
      b.b!.queue.push({ kind: 'unit', id: def.id, time: def.buildTime, total: def.buildTime, gold, lumber, food });
      p.foodUsed += food;
      return;
    }
    case 'research': {
      const b = ownedBuilding(w, c.player, c.building);
      if (!b || b.b!.constructing) return;
      const up = UPGRADES[c.upgrade];
      if (!up || !(b.def.researches ?? []).includes(up.id)) return;
      if (p.researching.has(up.id)) return w.msg(c.player, 'Already researching');
      const level = p.upgradeLevel(up.id) + 1;
      if (level > up.levels.length) return w.msg(c.player, 'Research complete');
      const L = up.levels[level - 1];
      const req = w.requirementsMet(c.player, L.requires);
      if (req) return w.msg(c.player, req);
      if (b.b!.queue.length >= MAX_QUEUE) return w.msg(c.player, 'Queue is full');
      if (p.gold < L.cost.gold) return w.msg(c.player, 'Not enough gold');
      if (p.lumber < L.cost.lumber) return w.msg(c.player, 'Not enough lumber');
      p.gold -= L.cost.gold;
      p.lumber -= L.cost.lumber;
      p.researching.add(up.id);
      b.b!.queue.push({ kind: 'research', id: up.id, time: L.time, total: L.time, gold: L.cost.gold, lumber: L.cost.lumber, food: 0, level });
      return;
    }
    case 'upgradeBuilding': {
      const b = ownedBuilding(w, c.player, c.building);
      if (!b || b.b!.constructing) return;
      const allowed = b.def.upgradesTo === c.to || (b.def.upgradeOptions ?? []).includes(c.to);
      if (!allowed) return;
      if (b.b!.queue.length) return w.msg(c.player, 'Building is busy');
      const nd = getDef(c.to);
      const req = w.requirementsMet(c.player, nd.requires);
      if (req) return w.msg(c.player, req);
      if (p.gold < nd.cost.gold) return w.msg(c.player, 'Not enough gold');
      if (p.lumber < nd.cost.lumber) return w.msg(c.player, 'Not enough lumber');
      p.gold -= nd.cost.gold;
      p.lumber -= nd.cost.lumber;
      b.b!.queue.push({ kind: 'upgrade', id: nd.id, time: nd.buildTime, total: nd.buildTime, gold: nd.cost.gold, lumber: nd.cost.lumber, food: 0 });
      return;
    }
    case 'cancelQueue': {
      const b = ownedBuilding(w, c.player, c.building);
      if (!b) return;
      cancelQueueItem(w, b, c.index < 0 ? b.b!.queue.length - 1 : c.index);
      return;
    }
    case 'cancelConstruction': {
      const b = ownedBuilding(w, c.player, c.building);
      if (!b) return;
      cancelConstruction(w, b);
      return;
    }
    case 'build': {
      const def = DEFS[c.defId];
      if (!def) return;
      const workers = owned(w, c.player, c.units).filter((u) => u.isWorker && u.def.faction === def.faction);
      if (!workers.length) return;
      const req = w.requirementsMet(c.player, def.requires);
      if (req) return w.msg(c.player, req);
      const err = w.placementError(def.id, c.tx, c.ty, c.player, workers.map((u) => u.id));
      if (err) return w.msg(c.player, err);
      if (p.gold < def.cost.gold) return w.msg(c.player, 'Not enough gold');
      if (p.lumber < def.cost.lumber) return w.msg(c.player, 'Not enough lumber');
      // nearest worker builds
      const size = def.size ?? 2;
      const cx = c.tx + size / 2;
      const cy = c.ty + size / 2;
      workers.sort((a, b) => dist(a.x, a.y, cx, cy) - dist(b.x, b.y, cx, cy));
      const builder = workers.find((u) => !u.order || u.order.type !== 'build') ?? workers[0];
      p.gold -= def.cost.gold;
      p.lumber -= def.cost.lumber;
      setOrder(w, builder, { type: 'build', defId: def.id, x: c.tx, y: c.ty, itemId: 'paid' }, c.queued);
      return;
    }
    case 'rally': {
      for (const id of c.buildings) {
        const b = ownedBuilding(w, c.player, id);
        if (!b) continue;
        b.b!.rallyX = c.x;
        b.b!.rallyY = c.y;
        b.b!.rallyTarget = c.target ?? -1;
        b.b!.rallyTree = c.tree ?? -1;
        b.b!.hasRally = true;
      }
      return;
    }
    case 'cast': {
      const def = ABILITIES[c.ability];
      if (!def) return;
      const casters: Entity[] = [];
      for (const id of c.units) {
        const e = w.valid(id);
        if (!e || e.owner !== c.player) continue;
        if (e.abilities.some((a) => a.def.id === c.ability)) casters.push(e);
      }
      if (!casters.length) return;
      const target = c.target !== undefined && c.target >= 0 ? w.valid(c.target) : null;
      const tx = target ? target.x : c.x ?? casters[0].x;
      const ty = target ? target.y : c.y ?? casters[0].y;
      const ready = casters.filter((e) => {
        const a = e.abilities.find((x) => x.def.id === c.ability)!;
        return !castError(w, e, a, target, tx, ty);
      });
      if (!ready.length) {
        const e = casters[0];
        const a = e.abilities.find((x) => x.def.id === c.ability)!;
        const err = castError(w, e, a, target, tx, ty);
        if (err) w.msg(c.player, err);
        return;
      }
      const group = def.targeting === 'none' && !def.effect.single;
      const chosen = group ? ready : [ready.sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty))[0]];
      for (const e of chosen) {
        const a = e.abilities.find((x) => x.def.id === c.ability)!;
        if (def.effect.instant) {
          castInstant(w, e, a, target, tx, ty);
        } else {
          setOrder(w, e, { type: 'cast', ability: c.ability, target: target ? target.id : -1, x: tx, y: ty }, c.queued);
        }
      }
      return;
    }
    case 'autocast': {
      for (const id of c.units) {
        const e = w.valid(id);
        if (!e || e.owner !== c.player) continue;
        const a = e.abilities.find((x) => x.def.id === c.ability);
        if (a && a.def.autocast) a.autocast = c.on;
      }
      return;
    }
    case 'learn': {
      const h = w.valid(c.hero);
      if (!h || h.owner !== c.player || !h.hero) return;
      learnAbility(w, h, c.ability);
      return;
    }
    case 'useItem': {
      const h = w.valid(c.hero);
      if (!h || h.owner !== c.player || !h.hero) return;
      const it = h.hero.inventory[c.slot];
      if (!it || !it.def.ability) return;
      const def = ABILITIES[it.def.ability];
      if (!def) return;
      if (it.cd > 0) return w.msg(c.player, 'Item is not ready yet');
      const target = c.target !== undefined && c.target >= 0 ? w.valid(c.target) : null;
      const state: AbilityState = { def, level: 1, cd: it.cd, autocast: false, itemSlot: c.slot };
      if (def.targeting === 'none') {
        const err = castError(w, h, state, null, h.x, h.y);
        if (err) return w.msg(c.player, err);
        w.emit({ t: 'cast', id: h.id, ability: def.id, x: h.x, y: h.y, target: -1 });
        useItemInstant(w, h, state);
        return;
      }
      setOrder(w, h, { type: 'cast', slot: c.slot, ability: def.id, target: target ? target.id : -1, x: c.x, y: c.y });
      return;
    }
    case 'swapItem': {
      const h = w.valid(c.hero);
      if (!h || h.owner !== c.player || !h.hero) return;
      const inv = h.hero.inventory;
      if (c.from < 0 || c.to < 0 || c.from >= inv.length || c.to >= inv.length) return;
      const t = inv[c.from];
      inv[c.from] = inv[c.to];
      inv[c.to] = t;
      return;
    }
    case 'dropItem': {
      const h = w.valid(c.hero);
      if (!h || h.owner !== c.player || !h.hero || !h.hero.inventory[c.slot]) return;
      if (c.target !== undefined && c.target >= 0) setOrder(w, h, { type: 'giveItem', target: c.target, slot: c.slot });
      else setOrder(w, h, { type: 'dropItem', x: c.x, y: c.y, slot: c.slot });
      return;
    }
    case 'buyItem': {
      const shop = w.valid(c.shop);
      if (!shop) return;
      const hint = c.hero !== undefined ? w.valid(c.hero) : null;
      buyItem(w, c.player, shop, c.item, hint);
      return;
    }
    case 'sellItem': {
      const shop = w.valid(c.shop);
      const h = w.valid(c.hero);
      if (!shop || !h) return;
      sellItem(w, c.player, shop, h, c.slot);
      return;
    }
    case 'hireHero': {
      const t = w.valid(c.tavern);
      if (!t) return;
      hireHero(w, c.player, t, c.hero);
      return;
    }
    case 'hireMerc': {
      const t = w.valid(c.camp);
      if (!t) return;
      hireMerc(w, c.player, t, c.unit);
      return;
    }
    case 'revive': {
      const altar = w.valid(c.altar);
      if (!altar) return;
      if (altar.owner !== c.player && !w.players[altar.owner].passive) return;
      startRevive(w, c.player, altar, c.hero);
      return;
    }
    case 'unload': {
      const b = ownedBuilding(w, c.player, c.building);
      if (b) unloadGarrison(w, b);
      return;
    }
    case 'transfer': {
      const to = w.players[c.to];
      if (!to || !w.isAlly(c.player, c.to) || c.to === c.player) return;
      const g = Math.max(0, Math.min(p.gold, Math.floor(c.gold)));
      const l = Math.max(0, Math.min(p.lumber, Math.floor(c.lumber)));
      p.gold -= g;
      p.lumber -= l;
      to.gold += g;
      to.lumber += l;
      w.emit({ t: 'msg', owner: c.to, text: `${p.name} sent you ${g} gold and ${l} lumber`, kind: 'good' });
      return;
    }
    case 'cheat': {
      if (c.code === 'gold') {
        p.gold += 5000;
        p.lumber += 5000;
      } else if (c.code === 'reveal') {
        p.revealAll = !p.revealAll;
      } else if (c.code === 'fast') {
        for (const e of w.entities) if (e.owner === c.player && e.b) for (const q of e.b.queue) q.time = Math.min(q.time, 0.5);
      }
      return;
    }
  }
}

function useItemInstant(w: World, h: Entity, state: AbilityState): void {
  const slot = state.itemSlot!;
  const it = h.hero!.inventory[slot];
  if (!it) return;
  consumeItemCharge(w, h, slot, lv(state.def.cooldown, 1));
  EFFECTS[state.def.effect.type]?.cast(w, h, state, 1, null, h.x, h.y, null);
}

function farmName(w: World, pid: number): string {
  const f = w.players[pid].faction;
  for (const d of Object.values(DEFS)) if (d.faction === f && d.foodProvided && !d.mainHall) return d.name + 's';
  return 'farms';
}

/** Formation offsets: melee in front, ranged behind, casters and siege at the back. */
export function formation(units: Entity[], x: number, y: number): [number, number][] {
  let cx = 0;
  let cy = 0;
  for (const u of units) {
    cx += u.x;
    cy += u.y;
  }
  cx /= units.length;
  cy /= units.length;
  let dx = x - cx;
  let dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.5) {
    dx = 0;
    dy = 1;
  } else {
    dx /= d;
    dy /= d;
  }
  const px = -dy;
  const py = dx;
  const role = (u: Entity): number => {
    if (u.isAir) return 4;
    if (u.def.tags?.siege) return 3;
    if (!u.def.weapon || u.def.tags?.caster) return 2;
    if (u.def.weapon.projectile) return 1;
    return 0;
  };
  const order = units.map((u, i) => ({ u, i, r: role(u) }));
  order.sort((a, b) => a.r - b.r || a.i - b.i);
  const out: [number, number][] = new Array(units.length);
  const perRow = Math.max(3, Math.ceil(Math.sqrt(units.length * 1.6)));
  let row = 0;
  let col = 0;
  let lastRole = order[0].r;
  let rowY = 0;
  for (let k = 0; k < order.length; k++) {
    const it = order[k];
    if (it.r !== lastRole && col > 0) {
      row++;
      col = 0;
      lastRole = it.r;
    }
    if (col >= perRow) {
      row++;
      col = 0;
    }
    const spacing = Math.max(0.95, it.u.radius * 2.3);
    rowY = row * 1.25;
    // count how many share this row to center it
    let rowCount = 0;
    for (let j = k - col; j < order.length && rowCount < perRow; j++) {
      if (order[j].r !== it.r) break;
      rowCount++;
    }
    const off = (col - (rowCount - 1) / 2) * spacing;
    out[it.i] = [px * off - dx * rowY, py * off - dy * rowY];
    col++;
  }
  return out;
}

/** Translate a right-click into commands for a selection. */
export function smartCommands(
  w: World,
  player: number,
  units: Entity[],
  x: number,
  y: number,
  target: Entity | null,
  tree: number,
  queued: boolean,
): Command[] {
  const out: Command[] = [];
  const ids = (list: Entity[]) => list.map((u) => u.id);
  const movers = units.filter((u) => u.kind === 'unit');
  if (!movers.length) return out;
  if (target && target.kind === 'item') {
    const heroes = movers.filter((u) => u.hero);
    const others = movers.filter((u) => !u.hero);
    if (heroes.length) out.push({ type: 'order', player, units: [heroes[0].id], order: { type: 'pickup', target: target.id }, queued });
    if (others.length) out.push({ type: 'order', player, units: ids(others), order: { type: 'move', x, y }, queued });
    return out;
  }
  if (target && target.alive) {
    if (w.isEnemy(player, target.owner)) {
      out.push({ type: 'order', player, units: ids(movers), order: { type: 'attack', target: target.id }, queued });
      return out;
    }
    const isMine = !!(target.def.goldMine || target.def.onMine);
    const workers = movers.filter((u) => (isMine ? !!u.def.harvest?.gold : u.isWorker));
    const others = movers.filter((u) => !workers.includes(u));
    let workerOrder: Order | null = null;
    if (target.def.goldMine || target.def.onMine) workerOrder = { type: 'gather', target: target.id };
    else if (target.b && target.owner === player && target.def.garrison && workers.length && !target.b.constructing && target.hp >= target.st.maxHp) workerOrder = { type: 'garrison', target: target.id };
    else if (target.b && (target.owner === player || w.isAlly(player, target.owner)) && (target.b.constructing || target.hp < target.st.maxHp) && !target.def.noRepair)
      workerOrder = { type: 'repair', target: target.id };
    else if (target.b && target.owner === player && target.def.dropoff) workerOrder = { type: 'returnRes' };
    if (workerOrder && workers.length) {
      out.push({ type: 'order', player, units: ids(workers), order: workerOrder, queued });
      if (others.length) out.push({ type: 'order', player, units: ids(others), order: target.isUnit ? { type: 'follow', target: target.id } : { type: 'move', x, y }, queued });
      return out;
    }
    if (target.isUnit && target.id !== movers[0].id) {
      out.push({ type: 'order', player, units: ids(movers), order: { type: 'follow', target: target.id }, queued });
      return out;
    }
    out.push({ type: 'order', player, units: ids(movers), order: { type: 'move', x, y }, queued });
    return out;
  }
  if (tree >= 0) {
    const workers = movers.filter((u) => !!u.def.harvest?.lumber);
    const others = movers.filter((u) => !u.def.harvest?.lumber);
    if (workers.length) out.push({ type: 'order', player, units: ids(workers), order: { type: 'gather', tree }, queued });
    if (others.length) out.push({ type: 'order', player, units: ids(others), order: { type: 'move', x, y }, queued });
    return out;
  }
  out.push({ type: 'order', player, units: ids(movers), order: { type: 'move', x, y }, queued });
  return out;
}
