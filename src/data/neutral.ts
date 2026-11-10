import { regAbilities, regDefs, regItems } from './registry';
import type { AbilityDef, EntityDef, ItemDef, WeaponDef } from './types';

const A = (a: AbilityDef) => a;
const D = (d: EntityDef) => d;
const I = (i: ItemDef) => i;
const NOCOST = { gold: 0, lumber: 0, food: 0 };

// ---------------------------------------------------------------------------
// item abilities
// ---------------------------------------------------------------------------
regAbilities([
  A({ id: 'it_heal', name: 'Drink Draught', icon: { glyph: 'potion', bg: 0x8a1f1f }, targeting: 'none', cooldown: 1, effect: { type: 'restore', hp: 320, fx: 'heal' }, description: 'Restores 320 health.', ai: 'heal' }),
  A({ id: 'it_mana', name: 'Drink Draught', icon: { glyph: 'potion', bg: 0x1f3c8a }, targeting: 'none', cooldown: 1, effect: { type: 'restore', mana: 175, fx: 'mana' }, description: 'Restores 175 mana.' }),
  A({ id: 'it_elixir', name: 'Drink Elixir', icon: { glyph: 'potion', bg: 0x7a2a8a }, targeting: 'none', cooldown: 1, effect: { type: 'restore', hp: 520, mana: 250, fx: 'heal' }, description: 'Restores 520 health and 250 mana.' }),
  A({ id: 'it_mending', name: 'Read Scroll', icon: { glyph: 'scroll', bg: 0x2a7a3a }, targeting: 'none', cooldown: 1, effect: { type: 'restore', hp: 220, radius: 6, fx: 'healArea' }, description: 'Heals nearby allied units for 220.' }),
  A({ id: 'it_homeward', name: 'Read Scroll', icon: { glyph: 'scroll', bg: 0x3a4a9a }, targeting: 'none', cooldown: 1, castPoint: 0, effect: { type: 'teleportHome' }, description: 'Teleports the hero and nearby units back to your town hall.' }),
  A({ id: 'it_haste', name: 'Read Scroll', icon: { glyph: 'boot', bg: 0x9a8a2a }, targeting: 'none', cooldown: 1, effect: { type: 'buff', targets: 'aroundSelf', affects: 'allies', radius: 6, buff: 'haste', duration: 12, mods: { moveSpeedPct: 0.4 } }, description: 'Nearby allies move 40% faster for 12 seconds.' }),
  A({ id: 'it_thunder', name: 'Thunder Wand', icon: { glyph: 'bolt', bg: 0x2a3a8a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 7, cooldown: 8, effect: { type: 'chain', damage: 130, bounces: 3, falloff: 0.85, bounceRange: 5, fx: 'lightning' }, description: 'Hurls lightning that leaps between 4 enemies.', ai: 'nuke' }),
  A({ id: 'it_whistle', name: 'Bone Whistle', icon: { glyph: 'fang', bg: 0x5a4a3a }, targeting: 'none', cooldown: 20, effect: { type: 'summon', unit: 'sum_wolf', count: 2, duration: 50 }, description: 'Summons two dire wolves for 50 seconds.', ai: 'summon' }),
  A({ id: 'it_censer', name: 'Censer of Unbinding', icon: { glyph: 'swirl', bg: 0x4a6a8a }, targeting: 'point', range: 7, aoe: 4, cooldown: 10, effect: { type: 'dispel', radius: 4, summonDamage: 250 }, description: 'Dispels all magic in an area. Damages summoned units.' }),
  A({ id: 'it_ward', name: "Watcher's Eye", icon: { glyph: 'eye', bg: 0x3a6a5a }, targeting: 'point', range: 7, cooldown: 2, effect: { type: 'summon', unit: 'watcher_ward', count: 1, duration: 180, at: 'target' }, description: 'Plants an invisible ward that watches the area for 3 minutes.' }),
  A({ id: 'it_dust', name: 'Revealing Dust', icon: { glyph: 'eye2', bg: 0x8a7a4a }, targeting: 'none', cooldown: 2, effect: { type: 'reveal', radius: 9, duration: 8 }, description: 'Reveals invisible units around the hero for 8 seconds.' }),
]);

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------
regItems([
  I({ id: 'item_heal', name: 'Healing Draught', icon: { glyph: 'potion', bg: 0x8a1f1f }, description: 'Restores 320 health.', cost: 150, level: 1, ability: 'it_heal', consumable: true, charges: 1 }),
  I({ id: 'item_mana', name: 'Mana Draught', icon: { glyph: 'potion', bg: 0x1f3c8a }, description: 'Restores 175 mana.', cost: 120, level: 1, ability: 'it_mana', consumable: true, charges: 1 }),
  I({ id: 'item_dust', name: 'Revealing Dust', icon: { glyph: 'eye2', bg: 0x8a7a4a }, description: 'Reveals invisible units nearby. 2 uses.', cost: 75, level: 1, ability: 'it_dust', consumable: true, charges: 2 }),
  I({ id: 'item_ward', name: "Watcher's Eye", icon: { glyph: 'eye', bg: 0x3a6a5a }, description: 'Plant an invisible observer ward. 2 uses.', cost: 100, level: 1, ability: 'it_ward', consumable: true, charges: 2 }),
  I({ id: 'item_mending', name: 'Scroll of Mending', icon: { glyph: 'scroll', bg: 0x2a7a3a }, description: 'Heals nearby allies for 220.', cost: 250, level: 2, ability: 'it_mending', consumable: true, charges: 1 }),
  I({ id: 'item_homeward', name: 'Homeward Scroll', icon: { glyph: 'scroll', bg: 0x3a4a9a }, description: 'Teleport home with nearby units.', cost: 300, level: 2, ability: 'it_homeward', consumable: true, charges: 1 }),
  I({ id: 'item_str', name: 'Bracers of the Bear', icon: { glyph: 'fist', bg: 0x8a3a2a }, description: '+3 Strength.', cost: 350, level: 2, mods: { str: 3 } }),
  I({ id: 'item_agi', name: 'Feather Anklets', icon: { glyph: 'feather', bg: 0x2a8a4a }, description: '+3 Agility.', cost: 350, level: 2, mods: { agi: 3 } }),
  I({ id: 'item_int', name: "Sage's Circlet", icon: { glyph: 'crown', bg: 0x2a4a8a }, description: '+3 Intelligence.', cost: 350, level: 2, mods: { int: 3 } }),
  I({ id: 'item_armor', name: 'Ironbark Band', icon: { glyph: 'ring', bg: 0x5a5a6a }, description: '+3 armor.', cost: 400, level: 2, mods: { armor: 3 } }),
  I({ id: 'item_tome_str', name: 'Tome of Might', icon: { glyph: 'book', bg: 0x8a2a2a }, description: 'Permanently grants +1 Strength.', cost: 450, level: 2, mods: { str: 1 }, usedOnPickup: true }),
  I({ id: 'item_tome_agi', name: 'Tome of Grace', icon: { glyph: 'book', bg: 0x2a7a2a }, description: 'Permanently grants +1 Agility.', cost: 450, level: 2, mods: { agi: 1 }, usedOnPickup: true }),
  I({ id: 'item_tome_int', name: 'Tome of Wisdom', icon: { glyph: 'book', bg: 0x2a3a8a }, description: 'Permanently grants +1 Intelligence.', cost: 450, level: 2, mods: { int: 1 }, usedOnPickup: true }),
  I({ id: 'item_claws', name: 'Talon Gauntlets', icon: { glyph: 'claw', bg: 0x7a3a1a }, description: '+8 attack damage.', cost: 500, level: 3, mods: { damageFlat: 8 } }),
  I({ id: 'item_boots', name: "Wayfarer's Boots", icon: { glyph: 'boot', bg: 0x6a5a2a }, description: '+20% movement speed.', cost: 450, level: 3, mods: { moveSpeedPct: 0.2 } }),
  I({ id: 'item_haste', name: 'Scroll of Haste', icon: { glyph: 'scroll', bg: 0x9a8a2a }, description: 'Nearby allies move 40% faster for 12 seconds.', cost: 200, level: 3, ability: 'it_haste', consumable: true, charges: 1 }),
  I({ id: 'item_bloodstone', name: 'Bloodstone', icon: { glyph: 'gem', bg: 0x9a1a2a }, description: '+220 health.', cost: 500, level: 3, mods: { maxHp: 220 } }),
  I({ id: 'item_moonstone', name: 'Moonstone', icon: { glyph: 'gem', bg: 0x2a4aaa }, description: '+200 mana and +0.6 mana regeneration.', cost: 500, level: 3, mods: { maxMana: 200, manaRegen: 0.6 } }),
  I({ id: 'item_tome_xp', name: 'Tome of Knowledge', icon: { glyph: 'book', bg: 0x8a7a2a }, description: 'Grants 220 experience.', cost: 400, level: 3, usedOnPickup: true }),
  I({ id: 'item_elixir', name: 'Elixir of Vigor', icon: { glyph: 'potion', bg: 0x7a2a8a }, description: 'Restores 520 health and 250 mana.', cost: 350, level: 4, ability: 'it_elixir', consumable: true, charges: 1 }),
  I({ id: 'item_thunder', name: 'Thunder Wand', icon: { glyph: 'bolt', bg: 0x2a3a8a }, description: 'Chain lightning. 3 charges.', cost: 450, level: 4, ability: 'it_thunder', charges: 3, consumable: true }),
  I({ id: 'item_whistle', name: 'Bone Whistle', icon: { glyph: 'fang', bg: 0x5a4a3a }, description: 'Summon two dire wolves. 2 charges.', cost: 400, level: 4, ability: 'it_whistle', charges: 2, consumable: true }),
  I({ id: 'item_censer', name: 'Censer of Unbinding', icon: { glyph: 'swirl', bg: 0x4a6a8a }, description: 'Dispel magic in an area. 3 charges.', cost: 300, level: 4, ability: 'it_censer', charges: 3, consumable: true }),
  I({ id: 'item_heartwood', name: 'Heartwood Charm', icon: { glyph: 'leaf', bg: 0x3a7a2a }, description: '+3 health regeneration.', cost: 450, level: 4, mods: { hpRegen: 3 } }),
  I({ id: 'item_frost', name: 'Frostbite Charm', icon: { glyph: 'frost', bg: 0x3a7aaa }, description: 'Attacks chill the target, slowing it by 25%.', cost: 650, level: 4, mods: { slowOnHit: 0.25 } }),
  I({ id: 'item_valor', name: 'Warhorn of Valor', icon: { glyph: 'banner', bg: 0x9a5a1a }, description: 'Nearby allies deal 12% more damage.', cost: 800, level: 5, aura: { buff: 'aura_valor', radius: 8 } }),
  I({ id: 'item_aegis', name: 'Aegis Charm', icon: { glyph: 'shield', bg: 0x4a5a8a }, description: 'Nearby allies gain +2 armor.', cost: 800, level: 5, aura: { buff: 'aura_guard', radius: 8 } }),
  I({ id: 'item_diadem', name: 'Diadem of the Ancients', icon: { glyph: 'crown', bg: 0x8a6a1a }, description: '+5 to all attributes.', cost: 900, level: 5, mods: { str: 5, agi: 5, int: 5 } }),
  I({ id: 'item_phoenix', name: 'Phoenix Ember', icon: { glyph: 'flame', bg: 0xaa4a1a }, description: 'When the bearer falls it rises again with half health. Consumed.', cost: 1200, level: 6 }),
  I({ id: 'item_sunblade', name: 'Sunforged Blade', icon: { glyph: 'sword', bg: 0xaa8a2a }, description: '+15 damage, 15% chance to strike for double damage.', cost: 1100, level: 6, mods: { damageFlat: 15, critChance: 0.15 } }),
  I({ id: 'item_tome_power', name: 'Tome of Ascension', icon: { glyph: 'book', bg: 0xaa2aaa }, description: 'Grants a full hero level.', cost: 900, level: 6, usedOnPickup: true }),
]);

// ---------------------------------------------------------------------------
// creep abilities
// ---------------------------------------------------------------------------
regAbilities([
  A({ id: 'cr_creepheal', name: 'Mend', icon: { glyph: 'cross', bg: 0x2a7a3a }, targeting: 'unit', filter: { ally: true, ground: true, air: true }, range: 5, mana: 30, cooldown: 6, effect: { type: 'heal', amount: 110 }, description: 'Heals an ally.', ai: 'heal' }),
  A({ id: 'cr_howl', name: 'Pack Howl', icon: { glyph: 'fang', bg: 0x6a5a3a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_howl', radius: 7, targets: 'allies', mods: { damagePct: 0.15 } }, description: 'Nearby allies deal 15% more damage.' }),
  A({ id: 'cr_stomp', name: 'Stomp', icon: { glyph: 'fist', bg: 0x6a4a2a }, targeting: 'none', aoe: 2.6, mana: 50, cooldown: 9, effect: { type: 'area', center: 'self', radius: 2.6, damage: 90, stun: 1.5, stunHero: 1 }, description: 'Slams the ground, damaging and stunning nearby enemies.', ai: 'aoe' }),
  A({ id: 'cr_slam', name: 'Boulder Slam', icon: { glyph: 'fist', bg: 0x5a5a5a }, targeting: 'unit', filter: { enemy: true, ground: true }, range: 1.5, mana: 50, cooldown: 10, effect: { type: 'damage', damage: 80, stun: 2, stunHero: 1 }, description: 'Stuns a target.', ai: 'disable' }),
  A({ id: 'cr_web', name: 'Web', icon: { glyph: 'web', bg: 0x5a5a5a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 5, mana: 40, cooldown: 12, effect: { type: 'buff', buff: 'entangle', duration: 4, durationHero: 2 }, description: 'Binds a target in webbing.', ai: 'disable' }),
  A({ id: 'cr_brood', name: 'Spawn Brood', icon: { glyph: 'spider', bg: 0x4a3a4a }, targeting: 'none', mana: 60, cooldown: 18, effect: { type: 'summon', unit: 'spiderling', count: 2, duration: 30 }, description: 'Spawns spiderlings.', ai: 'summon' }),
  A({ id: 'cr_firebreath', name: 'Fire Breath', icon: { glyph: 'flame', bg: 0xaa4a1a }, targeting: 'point', range: 6, mana: 80, cooldown: 10, effect: { type: 'line', length: 7, width: 1.6, damage: 150, fx: 'fireline' }, description: 'Breathes fire in a line.', ai: 'aoe' }),
  A({ id: 'cr_slowcurse', name: 'Mire Curse', icon: { glyph: 'swirl', bg: 0x3a5a3a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 6, mana: 40, cooldown: 8, effect: { type: 'buff', buff: 'slow', duration: 6, durationHero: 3, mods: { moveSpeedPct: -0.4, attackSpeedPct: -0.25 } }, description: 'Slows a target.', ai: 'debuff' }),
]);

// ---------------------------------------------------------------------------
// neutral units (creeps, summons, wards)
// ---------------------------------------------------------------------------
const melee = (dmg: [number, number], cd = 1.5, dp = 0.4): WeaponDef => ({ damage: dmg, cooldown: cd, range: 0.35, damagePoint: dp, type: 'normal', targets: { ground: true, structure: true } });
const ranged = (dmg: [number, number], range: number, type: 'pierce' | 'magic' | 'siege' = 'pierce', kind: 'arrow' | 'spear' | 'orb' | 'bolt' | 'blade' = 'arrow', cd = 1.6, air = true): WeaponDef => ({
  damage: dmg,
  cooldown: cd,
  range,
  damagePoint: 0.35,
  type,
  targets: { ground: true, air, structure: true },
  projectile: { kind, speed: kind === 'orb' || kind === 'bolt' ? 11 : 16, arc: kind === 'arrow' || kind === 'spear' ? 0.12 : 0, color: kind === 'orb' ? 0x8affc0 : undefined },
});

regDefs([
  D({
    id: 'goldmine',
    name: 'Gold Mine',
    kind: 'building',
    faction: 'neutral',
    description: 'A rich vein of gold. Workers carry ore from here to your town hall.',
    hp: 5000,
    armor: 10,
    armorType: 'fortified',
    sight: [4, 4],
    cost: NOCOST,
    buildTime: 1,
    size: 3,
    goldMine: true,
    goldAmount: 9000,
    model: { kind: 'mine' },
    icon: { glyph: 'coin', bg: 0x7a5a1a },
  }),
  // ---- creeps ----
  D({ id: 'kobold_digger', name: 'Kobold Digger', kind: 'unit', faction: 'neutral', description: 'A scrappy tunnel-dweller.', hp: 230, armor: 0, armorType: 'medium', sight: [8, 6], speed: 2.4, radius: 0.3, weapon: melee([8, 10], 1.4), cost: NOCOST, buildTime: 1, level: 1, bounty: [6, 10], tags: { organic: true, melee: true }, model: { kind: 'humanoid', scale: 0.72, skin: 0x9a6a3a, body: 0x5a4a3a, helm: 'cap', helmColor: 0xc8a050, weapon: 'pick', hunch: true, ears: true } }),
  D({ id: 'kobold_shaman', name: 'Kobold Geomancer', kind: 'unit', faction: 'neutral', description: 'Heals its kin with earthen magic.', hp: 260, mana: 200, armor: 0, armorType: 'medium', sight: [8, 6], speed: 2.4, radius: 0.3, weapon: ranged([10, 12], 4.5, 'magic', 'orb', 1.8), cost: NOCOST, buildTime: 1, level: 2, bounty: [8, 12], abilities: ['cr_creepheal'], tags: { organic: true, caster: true }, model: { kind: 'humanoid', scale: 0.72, skin: 0x9a6a3a, body: 0x3a5a3a, robe: true, weapon: 'staff', orb: 0x8affc0, hunch: true, ears: true } }),
  D({ id: 'gray_wolf', name: 'Gray Wolf', kind: 'unit', faction: 'neutral', description: 'A hungry forest wolf.', hp: 320, armor: 1, armorType: 'medium', sight: [9, 8], speed: 3.2, radius: 0.4, weapon: melee([12, 15], 1.3, 0.3), cost: NOCOST, buildTime: 1, level: 2, bounty: [8, 12], tags: { organic: true, melee: true }, model: { kind: 'beast', head: 'wolf', color: 0x7a7a80, scale: 0.9 } }),
  D({ id: 'dire_alpha', name: 'Dire Wolf Alpha', kind: 'unit', faction: 'neutral', description: 'Leads the pack; its howl emboldens its kin.', hp: 680, armor: 2, armorType: 'medium', sight: [10, 9], speed: 3.2, radius: 0.5, weapon: melee([22, 26], 1.3, 0.3), cost: NOCOST, buildTime: 1, level: 4, bounty: [14, 20], abilities: ['cr_howl'], tags: { organic: true, melee: true }, model: { kind: 'beast', head: 'wolf', color: 0x3a3a42, scale: 1.25 } }),
  D({ id: 'bandit', name: 'Bandit Cutthroat', kind: 'unit', faction: 'neutral', description: 'A highway robber with a wicked knife.', hp: 340, armor: 1, armorType: 'medium', sight: [8, 6], speed: 2.6, radius: 0.35, weapon: melee([13, 16], 1.4), cost: { gold: 150, lumber: 0, food: 2 }, buildTime: 1, level: 2, bounty: [8, 12], tags: { organic: true, melee: true }, model: { kind: 'humanoid', skin: 0xd0a080, body: 0x4a3a2a, helm: 'hood', helmColor: 0x3a2a2a, weapon: 'dagger', cape: false } }),
  D({ id: 'bandit_xbow', name: 'Bandit Crossbowman', kind: 'unit', faction: 'neutral', description: 'Shoots travellers from the brush.', hp: 380, armor: 0, armorType: 'medium', sight: [9, 7], speed: 2.5, radius: 0.35, weapon: ranged([18, 21], 5), cost: NOCOST, buildTime: 1, level: 3, bounty: [10, 14], tags: { organic: true, ranged: true }, model: { kind: 'humanoid', skin: 0xd0a080, body: 0x3a4a2a, helm: 'hood', helmColor: 0x2a3a2a, weapon: 'crossbow' } }),
  D({ id: 'bandit_captain', name: 'Bandit Captain', kind: 'unit', faction: 'neutral', description: 'A scarred brigand leader.', hp: 840, armor: 3, armorType: 'heavy', sight: [9, 7], speed: 2.6, radius: 0.42, weapon: { ...melee([30, 36], 1.6), cleave: { radius: 1.5, factor: 0.35 } }, cost: NOCOST, buildTime: 1, level: 5, bounty: [18, 26], tags: { organic: true, melee: true }, model: { kind: 'humanoid', scale: 1.15, skin: 0xd0a080, body: 0x6a2a2a, armor: 0x5a5a5a, helm: 'helm', helmColor: 0x6a6a6a, weapon: 'greatsword', cape: true } }),
  D({ id: 'gnoll_brute', name: 'Gnoll Brute', kind: 'unit', faction: 'neutral', description: 'A hyena-faced savage.', hp: 500, armor: 1, armorType: 'medium', sight: [8, 6], speed: 2.5, radius: 0.42, weapon: melee([17, 21], 1.5), cost: { gold: 190, lumber: 0, food: 3 }, buildTime: 1, level: 3, bounty: [10, 15], tags: { organic: true, melee: true }, model: { kind: 'humanoid', scale: 1.05, skin: 0xa08050, body: 0x5a3a2a, weapon: 'club', hunch: true, ears: true, snout: true } }),
  D({ id: 'bog_troll', name: 'Bog Troll', kind: 'unit', faction: 'neutral', description: 'Hurls bone spears; regenerates quickly.', hp: 430, hpRegen: 2, armor: 1, armorType: 'medium', sight: [9, 7], speed: 2.6, radius: 0.38, weapon: ranged([17, 20], 5, 'pierce', 'spear', 1.7), cost: { gold: 200, lumber: 30, food: 3 }, buildTime: 1, level: 3, bounty: [10, 15], tags: { organic: true, ranged: true }, model: { kind: 'humanoid', scale: 1.05, skin: 0x5a8a7a, body: 0x4a3a2a, weapon: 'javelin', tusks: true, hunch: true, ears: true } }),
  D({ id: 'bog_hexer', name: 'Bog Hexer', kind: 'unit', faction: 'neutral', description: 'Curses intruders to slow them down.', hp: 400, mana: 220, armor: 0, armorType: 'medium', sight: [9, 7], speed: 2.5, radius: 0.38, weapon: ranged([12, 15], 5, 'magic', 'orb', 1.8), cost: NOCOST, buildTime: 1, level: 4, bounty: [12, 17], abilities: ['cr_slowcurse'], tags: { organic: true, caster: true }, model: { kind: 'humanoid', scale: 1.0, skin: 0x5a8a7a, body: 0x2a4a3a, robe: true, weapon: 'staff', orb: 0x9aff60, tusks: true, hunch: true, ears: true } }),
  D({ id: 'ogre_mauler', name: 'Ogre Mauler', kind: 'unit', faction: 'neutral', description: 'A hulking brute with a tree-trunk club.', hp: 920, armor: 2, armorType: 'heavy', sight: [8, 6], speed: 2.3, radius: 0.6, weapon: melee([28, 34], 1.7, 0.5), cost: { gold: 330, lumber: 60, food: 4 }, buildTime: 1, level: 5, bounty: [16, 24], tags: { organic: true, melee: true }, model: { kind: 'humanoid', scale: 1.55, bulk: 1.5, skin: 0xb08a6a, body: 0x5a4a2a, weapon: 'club', tusks: true } }),
  D({ id: 'ogre_warlord', name: 'Ogre Warlord', kind: 'unit', faction: 'neutral', description: 'Rules its clan by stomping rivals flat.', hp: 1350, mana: 200, armor: 4, armorType: 'heavy', sight: [9, 7], speed: 2.3, radius: 0.7, weapon: melee([38, 46], 1.7, 0.5), cost: NOCOST, buildTime: 1, level: 7, bounty: [26, 36], abilities: ['cr_stomp'], tags: { organic: true, melee: true }, model: { kind: 'humanoid', scale: 1.8, bulk: 1.6, skin: 0x9a7a5a, body: 0x6a2a2a, armor: 0x6a6a6a, helm: 'horned', helmColor: 0x5a5a5a, weapon: 'hammer', tusks: true } }),
  D({ id: 'stone_golem', name: 'Stone Golem', kind: 'unit', faction: 'neutral', description: 'An ancient animated guardian.', hp: 1150, mana: 150, armor: 4, armorType: 'heavy', sight: [8, 6], speed: 1.9, radius: 0.65, weapon: melee([32, 38], 1.9, 0.6), cost: NOCOST, buildTime: 1, level: 6, bounty: [22, 30], abilities: ['cr_slam'], tags: { mechanical: true, melee: true }, model: { kind: 'golem', color: 0x7a7468, crystal: 0x6ac0ff, scale: 1.25 } }),
  D({ id: 'harpy', name: 'Harpy Skirmisher', kind: 'unit', faction: 'neutral', description: 'A shrieking winged raider.', hp: 360, armor: 0, armorType: 'light', sight: [10, 8], speed: 3.2, radius: 0.4, air: true, flyHeight: 2.3, weapon: ranged([15, 18], 4, 'pierce', 'blade', 1.5), cost: { gold: 180, lumber: 40, food: 2 }, buildTime: 1, level: 3, bounty: [10, 14], tags: { organic: true, ranged: true }, model: { kind: 'flyer', variant: 'harpy', color: 0x8a6a8a, wingColor: 0x6a4a6a } }),
  D({ id: 'forest_drake', name: 'Moss Drake', kind: 'unit', faction: 'neutral', description: 'A young dragon that nests in deep forests.', hp: 1050, armor: 3, armorType: 'light', sight: [10, 8], speed: 2.8, radius: 0.65, air: true, flyHeight: 2.8, weapon: { ...ranged([32, 38], 4.5, 'magic', 'orb', 1.9), splash: { radius: 1.2, factor: 0.5 } }, cost: NOCOST, buildTime: 1, level: 6, bounty: [22, 30], tags: { organic: true }, model: { kind: 'flyer', variant: 'drake', color: 0x4a7a3a, wingColor: 0x3a5a2a, scale: 1.1 } }),
  D({ id: 'ancient_wyrm', name: 'Cinder Wyrm', kind: 'unit', faction: 'neutral', description: 'A colossal elder dragon guarding a vast hoard.', hp: 3400, mana: 400, armor: 5, armorType: 'heavy', sight: [12, 10], speed: 2.6, radius: 1.0, air: true, flyHeight: 3.4, weapon: { ...ranged([70, 85], 5, 'magic', 'orb', 2.1), splash: { radius: 1.6, factor: 0.5 } }, cost: NOCOST, buildTime: 1, level: 10, bounty: [60, 90], abilities: ['cr_firebreath'], tags: { organic: true }, model: { kind: 'flyer', variant: 'drake', color: 0x8a2a1a, wingColor: 0x5a1a10, scale: 2.0 } }),
  D({ id: 'giant_spider', name: 'Thicket Spider', kind: 'unit', faction: 'neutral', description: 'Webs its prey before biting.', hp: 600, mana: 120, armor: 2, armorType: 'medium', sight: [8, 7], speed: 2.8, radius: 0.5, weapon: melee([20, 24], 1.4, 0.3), cost: NOCOST, buildTime: 1, level: 4, bounty: [12, 18], abilities: ['cr_web'], tags: { organic: true, melee: true }, model: { kind: 'beast', head: 'spider', legs: 8, color: 0x3a3a2a, scale: 1.0 } }),
  D({ id: 'broodmother', name: 'Broodmother', kind: 'unit', faction: 'neutral', description: 'Endlessly spawns her children.', hp: 1250, mana: 300, armor: 3, armorType: 'medium', sight: [9, 8], speed: 2.6, radius: 0.75, weapon: melee([30, 36], 1.5, 0.35), cost: NOCOST, buildTime: 1, level: 7, bounty: [26, 34], abilities: ['cr_brood', 'cr_web'], tags: { organic: true, melee: true }, model: { kind: 'beast', head: 'spider', legs: 8, color: 0x4a2a3a, scale: 1.6 } }),
  D({ id: 'spiderling', name: 'Spiderling', kind: 'unit', faction: 'neutral', description: 'A small, fast spider.', hp: 180, armor: 0, armorType: 'medium', sight: [7, 6], speed: 3.0, radius: 0.3, weapon: melee([9, 11], 1.2, 0.3), cost: NOCOST, buildTime: 1, level: 1, tags: { organic: true, summoned: true, melee: true }, model: { kind: 'beast', head: 'spider', legs: 8, color: 0x4a3a3a, scale: 0.55 } }),
  // ---- summons from items ----
  D({ id: 'sum_wolf', name: 'Dire Wolf', kind: 'unit', faction: 'neutral', description: 'A summoned wolf.', hp: 420, armor: 1, armorType: 'medium', sight: [9, 8], speed: 3.2, radius: 0.42, weapon: melee([15, 18], 1.3, 0.3), cost: NOCOST, buildTime: 1, level: 2, tags: { summoned: true, melee: true }, model: { kind: 'beast', head: 'wolf', color: 0x4a4a6a, scale: 1.0, glow: 0x9ab0ff } }),
  D({ id: 'watcher_ward', name: "Watcher's Eye", kind: 'unit', faction: 'neutral', description: 'An invisible observer.', hp: 50, armor: 0, armorType: 'unarmored', sight: [11, 10], speed: 0, radius: 0.2, cost: NOCOST, buildTime: 1, level: 0, abilities: ['ward_invis'], tags: { summoned: true, detector: true }, model: { kind: 'ward', variant: 'eye', color: 0x5aaa8a } }),
]);

regAbilities([
  A({ id: 'ward_invis', name: 'Unseen', icon: { glyph: 'eye', bg: 0x3a6a5a }, targeting: 'passive', effect: { type: 'permaInvis' }, description: 'This ward is invisible.' }),
]);

// ---------------------------------------------------------------------------
// neutral heroes (hired at the Wayfarer's Inn)
// ---------------------------------------------------------------------------
regAbilities([
  // Ember Djinn
  A({ id: 'nd_fireball', name: 'Ember Bolt', hotkey: 'Q', icon: { glyph: 'flame', bg: 0xaa3a1a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 7, mana: [85, 95, 105], cooldown: 8, effect: { type: 'damage', damage: [95, 165, 235], projectile: { kind: 'orb', speed: 12, color: 0xff7a2a, size: 1.5 } }, description: 'Hurls a ball of fire at an enemy.', levelText: ['95 damage', '165 damage', '235 damage'], ai: 'nuke' }),
  A({ id: 'nd_flameward', name: 'Flame Ward', hotkey: 'W', icon: { glyph: 'totem', bg: 0x9a4a1a }, targeting: 'point', range: 6, mana: 100, cooldown: 18, effect: { type: 'summon', unit: ['fire_ward1', 'fire_ward2', 'fire_ward3'], count: 1, duration: [20, 25, 30], at: 'target' }, description: 'Plants a ward that spits fire at nearby enemies.', levelText: ['20 seconds', '25 seconds', '30 seconds'], ai: 'summon' }),
  A({ id: 'nd_searing', name: 'Searing Aura', hotkey: 'E', icon: { glyph: 'aura', bg: 0xaa5a1a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_searing', radius: 4.5, targets: 'enemies', dot: [6, 11, 16] }, description: 'Enemies near the Djinn burn continuously.', levelText: ['6 damage per second', '11 damage per second', '16 damage per second'] }),
  A({ id: 'nd_inferno', name: 'Pillar of Inferno', hotkey: 'R', icon: { glyph: 'meteor', bg: 0xaa2a0a }, targeting: 'point', ultimate: true, maxLevel: 1, range: 8, aoe: 5, mana: 200, cooldown: 150, channel: 6, castPoint: 0.5, effect: { type: 'barrage', radius: 5, interval: 0.32, damage: 85, strikeRadius: 1.6, structureMult: 1.5, fx: 'meteor' }, description: 'Calls down a rain of fire on an area while channelling.', ai: 'ultimate' }),
  // Clockwork Tinkerer
  A({ id: 'nt_rockets', name: 'Rocket Salvo', hotkey: 'Q', icon: { glyph: 'bomb', bg: 0x6a5a3a }, targeting: 'point', range: 8, aoe: 2.3, mana: [90, 100, 110], cooldown: 9, effect: { type: 'area', radius: 2.3, damage: [70, 120, 170], stun: 0.6, delay: 0.5, fx: 'explosion' }, description: 'Launches rockets that explode in an area.', levelText: ['70 damage', '120 damage', '170 damage'], ai: 'aoe' }),
  A({ id: 'nt_turret', name: 'Deploy Turret', hotkey: 'W', icon: { glyph: 'gear', bg: 0x5a5a6a }, targeting: 'point', range: 5, mana: 110, cooldown: 20, effect: { type: 'summon', unit: ['tink_turret1', 'tink_turret2', 'tink_turret3'], count: 1, duration: 30, at: 'target' }, description: 'Deploys an automated gun turret.', levelText: ['Light turret', 'Medium turret', 'Heavy turret'], ai: 'summon' }),
  A({ id: 'nt_overclock', name: 'Overclock', hotkey: 'E', icon: { glyph: 'gear', bg: 0x8a6a2a }, targeting: 'passive', effect: { type: 'passive', mods: { attackSpeedPct: [0.1, 0.2, 0.3], moveSpeedPct: [0.05, 0.1, 0.15] } }, description: 'Gears and springs make the Tinkerer faster.', levelText: ['+10% attack, +5% move speed', '+20% attack, +10% move speed', '+30% attack, +15% move speed'] }),
  A({ id: 'nt_exosuit', name: 'Iron Exosuit', hotkey: 'R', icon: { glyph: 'golem', bg: 0x4a4a5a }, targeting: 'none', ultimate: true, maxLevel: 1, mana: 150, cooldown: 120, effect: { type: 'buff', targets: 'self', buff: 'mechsuit', duration: 35, mods: { maxHp: 650, armor: 5, damageFlat: 25, attackSpeedPct: 0.2 }, instant: true }, description: 'Climbs into a steam-powered battle suit for 35 seconds.', ai: 'ultimate' }),
  // Ashen Reaver
  A({ id: 'nr_cinder', name: 'Cinder Sweep', hotkey: 'Q', icon: { glyph: 'axe', bg: 0x8a2a1a }, targeting: 'none', aoe: 2.6, mana: [80, 90, 100], cooldown: 8, effect: { type: 'area', center: 'self', radius: 2.6, damage: [70, 120, 170], buff: 'burn', duration: 4, dot: [8, 12, 16], fx: 'fireRing' }, description: 'A blazing sweep that burns all nearby enemies.', levelText: ['70 damage', '120 damage', '170 damage'], ai: 'aoe' }),
  A({ id: 'nr_soulburn', name: 'Soul Burn', hotkey: 'W', icon: { glyph: 'flame', bg: 0x6a1a3a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 6, mana: 90, cooldown: 12, effect: { type: 'damage', damage: 0, buff: 'burn', duration: 8, dot: [20, 32, 44], mods: { damagePct: -0.25 } }, description: 'Sets an enemy ablaze, dealing damage over time and weakening its attacks.', levelText: ['160 damage over 8s', '256 damage over 8s', '352 damage over 8s'], ai: 'debuff' }),
  A({ id: 'nr_infernalskin', name: 'Infernal Skin', hotkey: 'E', icon: { glyph: 'aura', bg: 0x8a3a1a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_infernal', radius: 6, targets: 'allies', mods: { thorns: [0.12, 0.2, 0.28] } }, description: 'Nearby allies return a portion of melee damage to attackers.', levelText: ['12% returned', '20% returned', '28% returned'] }),
  A({ id: 'nr_ascend', name: 'Infernal Ascension', hotkey: 'R', icon: { glyph: 'flame', bg: 0xaa1a0a }, targeting: 'none', ultimate: true, maxLevel: 1, mana: 150, cooldown: 120, effect: { type: 'buff', targets: 'self', buff: 'infernal', duration: 40, mods: { maxHp: 800, damageFlat: 30, armor: 4 }, instant: true }, description: 'Becomes a towering fiend of ash and flame for 40 seconds.', ai: 'ultimate' }),
]);

const heroBase = {
  kind: 'unit' as const,
  faction: 'neutral' as const,
  armorType: 'hero' as const,
  sight: [11, 8] as [number, number],
  cost: { gold: 425, lumber: 100, food: 5 },
  buildTime: 55,
  radius: 0.45,
  speed: 2.7,
  hpRegen: 0.25,
  manaRegen: 0.2,
  priority: 10,
};

regDefs([
  D({
    ...heroBase,
    id: 'nh_djinn',
    name: 'Ember Djinn',
    description: 'A free spirit of living flame who sells his services for gold and glory.',
    hp: 100,
    mana: 0,
    armor: 0,
    weapon: { damage: [16, 22], cooldown: 2.1, range: 5.5, damagePoint: 0.35, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: { kind: 'orb', speed: 12, color: 0xff7a2a } },
    hero: { primary: 'int', str: 16, agi: 14, int: 22, strGain: 1.8, agiGain: 1.3, intGain: 3.1, abilities: ['nd_fireball', 'nd_flameward', 'nd_searing', 'nd_inferno'], title: 'Elemental Mercenary' },
    model: { kind: 'spirit', variant: 'djinn', color: 0xff7a2a, glow: 0xffc060, scale: 1.2 },
    tags: { organic: true },
  }),
  D({
    ...heroBase,
    id: 'nh_tinker',
    name: 'Clockwork Tinkerer',
    description: 'An inventor whose gadgets turn the tide of battle.',
    hp: 100,
    mana: 0,
    armor: 1,
    weapon: { damage: [17, 23], cooldown: 2.0, range: 5, damagePoint: 0.3, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: { kind: 'bullet', speed: 18 } },
    hero: { primary: 'int', str: 18, agi: 16, int: 20, strGain: 2.0, agiGain: 1.6, intGain: 2.6, abilities: ['nt_rockets', 'nt_turret', 'nt_overclock', 'nt_exosuit'], title: 'Mechanical Genius' },
    model: { kind: 'humanoid', scale: 0.85, skin: 0xd8b088, body: 0x6a4a2a, armor: 0x8a7a5a, helm: 'goggles', helmColor: 0x8a6a3a, weapon: 'wrench', beard: 0xb05a2a, cape: false, backpack: true },
    tags: { organic: true },
  }),
  D({
    ...heroBase,
    id: 'nh_reaver',
    name: 'Ashen Reaver',
    description: 'A fiend exiled from the burning pits, fighting for whoever pays.',
    hp: 100,
    mana: 0,
    armor: 2,
    weapon: { damage: [20, 28], cooldown: 2.2, range: 0.35, damagePoint: 0.4, type: 'hero', targets: { ground: true, structure: true } },
    hero: { primary: 'str', str: 25, agi: 13, int: 14, strGain: 3.0, agiGain: 1.4, intGain: 1.5, abilities: ['nr_cinder', 'nr_soulburn', 'nr_infernalskin', 'nr_ascend'], title: 'Exiled Fiend' },
    model: { kind: 'humanoid', scale: 1.2, bulk: 1.3, skin: 0x5a2a2a, body: 0x2a1a1a, armor: 0x3a2a2a, helm: 'horned', helmColor: 0x2a1a1a, weapon: 'axe', glow: 0xff6a1a },
    tags: { organic: true },
  }),
  // summons used by neutral heroes
  D({ id: 'fire_ward1', name: 'Flame Ward', kind: 'unit', faction: 'neutral', description: 'Spits fire.', hp: 150, armor: 0, armorType: 'fortified', sight: [8, 7], speed: 0, radius: 0.3, weapon: { ...ranged([15, 18], 6, 'magic', 'orb', 1.3), projectile: { kind: 'orb', speed: 12, color: 0xff7a2a } }, cost: NOCOST, buildTime: 1, level: 1, tags: { summoned: true }, model: { kind: 'ward', variant: 'flame', color: 0xff7a2a } }),
  D({ id: 'fire_ward2', name: 'Flame Ward', kind: 'unit', faction: 'neutral', description: 'Spits fire.', hp: 220, armor: 0, armorType: 'fortified', sight: [8, 7], speed: 0, radius: 0.3, weapon: { ...ranged([24, 28], 6, 'magic', 'orb', 1.3), projectile: { kind: 'orb', speed: 12, color: 0xff7a2a } }, cost: NOCOST, buildTime: 1, level: 2, tags: { summoned: true }, model: { kind: 'ward', variant: 'flame', color: 0xff7a2a } }),
  D({ id: 'fire_ward3', name: 'Flame Ward', kind: 'unit', faction: 'neutral', description: 'Spits fire.', hp: 300, armor: 0, armorType: 'fortified', sight: [8, 7], speed: 0, radius: 0.3, weapon: { ...ranged([33, 38], 6, 'magic', 'orb', 1.3), projectile: { kind: 'orb', speed: 12, color: 0xff7a2a } }, cost: NOCOST, buildTime: 1, level: 3, tags: { summoned: true }, model: { kind: 'ward', variant: 'flame', color: 0xff7a2a, scale: 1.2 } }),
  D({ id: 'tink_turret1', name: 'Gun Turret', kind: 'unit', faction: 'neutral', description: 'Automated turret.', hp: 300, armor: 2, armorType: 'fortified', sight: [9, 7], speed: 0, radius: 0.4, weapon: { ...ranged([16, 19], 6, 'pierce', 'arrow', 0.9), projectile: { kind: 'bullet', speed: 20 } }, cost: NOCOST, buildTime: 1, level: 2, tags: { summoned: true, mechanical: true }, model: { kind: 'ward', variant: 'turret', color: 0x7a6a5a } }),
  D({ id: 'tink_turret2', name: 'Gun Turret', kind: 'unit', faction: 'neutral', description: 'Automated turret.', hp: 400, armor: 3, armorType: 'fortified', sight: [9, 7], speed: 0, radius: 0.4, weapon: { ...ranged([24, 28], 6, 'pierce', 'arrow', 0.9), projectile: { kind: 'bullet', speed: 20 } }, cost: NOCOST, buildTime: 1, level: 3, tags: { summoned: true, mechanical: true }, model: { kind: 'ward', variant: 'turret', color: 0x7a6a5a, scale: 1.1 } }),
  D({ id: 'tink_turret3', name: 'Gun Turret', kind: 'unit', faction: 'neutral', description: 'Automated turret.', hp: 520, armor: 4, armorType: 'fortified', sight: [10, 8], speed: 0, radius: 0.45, weapon: { ...ranged([32, 38], 6.5, 'pierce', 'arrow', 0.9), projectile: { kind: 'bullet', speed: 20 } }, cost: NOCOST, buildTime: 1, level: 4, tags: { summoned: true, mechanical: true }, model: { kind: 'ward', variant: 'turret', color: 0x7a6a5a, scale: 1.25 } }),
]);

// ---------------------------------------------------------------------------
// neutral buildings
// ---------------------------------------------------------------------------
regDefs([
  D({
    id: 'wayfarers_inn',
    name: "Wayfarer's Inn",
    kind: 'building',
    faction: 'neutral',
    description: 'A roadside tavern where heroes for hire wait for a patron. Fallen heroes can be revived here.',
    hp: 2500,
    armor: 10,
    armorType: 'fortified',
    sight: [6, 6],
    cost: NOCOST,
    buildTime: 1,
    size: 4,
    neutralService: true,
    heroesForHire: ['nh_djinn', 'nh_tinker', 'nh_reaver'],
    model: { kind: 'building', faction: 'neutral', variant: 'tavern' },
    icon: { glyph: 'house', bg: 0x7a5a2a },
  }),
  D({
    id: 'peddler_wagon',
    name: "Peddler's Wagon",
    kind: 'building',
    faction: 'neutral',
    description: 'A travelling merchant selling potions, scrolls and curiosities. A hero must be nearby to buy.',
    hp: 1500,
    armor: 10,
    armorType: 'fortified',
    sight: [6, 6],
    cost: NOCOST,
    buildTime: 1,
    size: 3,
    neutralService: true,
    shopItems: ['item_heal', 'item_mana', 'item_dust', 'item_ward', 'item_homeward', 'item_mending', 'item_haste', 'item_whistle', 'item_censer', 'item_thunder', 'item_elixir', 'item_boots'],
    model: { kind: 'building', faction: 'neutral', variant: 'merchant' },
    icon: { glyph: 'coin', bg: 0x8a6a1a },
  }),
  D({
    id: 'sellsword_camp',
    name: 'Sellsword Camp',
    kind: 'building',
    faction: 'neutral',
    description: 'Hardened mercenaries hire out to anyone with coin.',
    hp: 1500,
    armor: 10,
    armorType: 'fortified',
    sight: [6, 6],
    cost: NOCOST,
    buildTime: 1,
    size: 3,
    neutralService: true,
    mercenaries: ['bandit', 'gnoll_brute', 'bog_troll', 'harpy', 'ogre_mauler'],
    shopItems: ['bandit', 'gnoll_brute', 'bog_troll', 'harpy', 'ogre_mauler'],
    model: { kind: 'building', faction: 'neutral', variant: 'mercs' },
    icon: { glyph: 'tent', bg: 0x6a3a2a },
  }),
  D({
    id: 'spring_life',
    name: 'Spring of Renewal',
    kind: 'building',
    faction: 'neutral',
    description: 'Restores the health of nearby units.',
    hp: 1500,
    armor: 10,
    armorType: 'fortified',
    sight: [5, 5],
    cost: NOCOST,
    buildTime: 1,
    size: 3,
    neutralService: true,
    fountain: { hp: 14, radius: 5 },
    model: { kind: 'building', faction: 'neutral', variant: 'fountainLife' },
    icon: { glyph: 'drop', bg: 0x2a7a4a },
  }),
  D({
    id: 'spring_mana',
    name: 'Arcane Spring',
    kind: 'building',
    faction: 'neutral',
    description: 'Restores the mana of nearby units.',
    hp: 1500,
    armor: 10,
    armorType: 'fortified',
    sight: [5, 5],
    cost: NOCOST,
    buildTime: 1,
    size: 3,
    neutralService: true,
    fountain: { mana: 7, radius: 5 },
    model: { kind: 'building', faction: 'neutral', variant: 'fountainMana' },
    icon: { glyph: 'drop', bg: 0x2a4a8a },
  }),
]);
