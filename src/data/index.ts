// Importing this module registers all game data.
import './buffs';
import './neutral';
import './crown';
import './iron';
import './sepulchral';
import './twilight';
import { ABILITIES, BUFFS, DEFS, FACTIONS, ITEMS, UPGRADES } from './registry';

/** Cross-check every id reference so data typos fail loudly at startup. */
export function validateData(): string[] {
  const errors: string[] = [];
  const need = (cond: boolean, msg: string) => {
    if (!cond) errors.push(msg);
  };
  for (const d of Object.values(DEFS)) {
    for (const a of d.abilities ?? []) need(!!ABILITIES[a], `${d.id}: unknown ability ${a}`);
    for (const a of d.hero?.abilities ?? []) need(!!ABILITIES[a], `${d.id}: unknown hero ability ${a}`);
    for (const t of d.trains ?? []) need(!!DEFS[t], `${d.id}: trains unknown ${t}`);
    for (const r of d.researches ?? []) need(!!UPGRADES[r], `${d.id}: unknown research ${r}`);
    for (const r of d.requires ?? []) need(r === 'tier2' || r === 'tier3' || !!DEFS[r], `${d.id}: unknown requirement ${r}`);
    if (d.upgradesTo) need(!!DEFS[d.upgradesTo], `${d.id}: unknown upgradesTo ${d.upgradesTo}`);
    for (const o of d.upgradeOptions ?? []) need(!!DEFS[o], `${d.id}: unknown upgrade option ${o}`);
    for (const s of d.shopItems ?? []) need(!!ITEMS[s] || !!DEFS[s], `${d.id}: unknown shop item ${s}`);
    for (const h of d.heroesForHire ?? []) need(!!DEFS[h], `${d.id}: unknown hero ${h}`);
    for (const m of d.mercenaries ?? []) need(!!DEFS[m], `${d.id}: unknown merc ${m}`);
    if (d.uprootTo) need(!!DEFS[d.uprootTo], `${d.id}: unknown uprootTo ${d.uprootTo}`);
    if (d.rootTo) need(!!DEFS[d.rootTo], `${d.id}: unknown rootTo ${d.rootTo}`);
    if (d.kind === 'building') need(!!d.size, `${d.id}: building without size`);
  }
  for (const a of Object.values(ABILITIES)) {
    const e = a.effect as Record<string, unknown>;
    if (typeof e.buff === 'string') need(!!BUFFS[e.buff], `${a.id}: unknown buff ${e.buff}`);
    if (typeof e.selfBuff === 'string') need(!!BUFFS[e.selfBuff], `${a.id}: unknown buff ${e.selfBuff}`);
    if (typeof e.allyBuff === 'string') need(!!BUFFS[e.allyBuff], `${a.id}: unknown buff ${e.allyBuff}`);
    const units = Array.isArray(e.unit) ? (e.unit as string[]) : typeof e.unit === 'string' ? [e.unit] : [];
    for (const u of units) need(!!DEFS[u], `${a.id}: unknown summon ${u}`);
    if (typeof e.into === 'string') need(!!DEFS[e.into], `${a.id}: unknown transform ${e.into}`);
    if (a.requiresUpgrade) need(!!UPGRADES[a.requiresUpgrade], `${a.id}: unknown upgrade ${a.requiresUpgrade}`);
  }
  for (const u of Object.values(UPGRADES)) {
    for (const t of u.appliesTo) need(t === 'unit' || t === 'building' || t.startsWith('tag:') || !!DEFS[t], `${u.id}: unknown appliesTo ${t}`);
    if (u.unlocksAbility) need(!!ABILITIES[u.unlocksAbility], `${u.id}: unknown ability ${u.unlocksAbility}`);
  }
  for (const it of Object.values(ITEMS)) {
    if (it.ability) need(!!ABILITIES[it.ability], `${it.id}: unknown ability ${it.ability}`);
    if (it.aura) need(!!BUFFS[it.aura.buff], `${it.id}: unknown aura buff ${it.aura.buff}`);
  }
  for (const f of Object.values(FACTIONS)) {
    for (const k of ['worker', 'hall', 'altar', 'farm', 'shop', 'tower', 'barracks'] as const) need(!!DEFS[f[k]], `${f.id}: unknown ${k} ${f[k]}`);
    for (const h of f.heroes) need(!!DEFS[h], `${f.id}: unknown hero ${h}`);
    for (const s of f.startUnits) need(!!DEFS[s.id], `${f.id}: unknown start unit ${s.id}`);
  }
  return errors;
}

export { ABILITIES, BUFFS, DEFS, FACTIONS, ITEMS, UPGRADES };
