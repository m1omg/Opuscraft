import { ARROW, BULLET, SHELL, ab, building, heroDef, melee, missile, orb, singleUpgrade, tieredUpgrade, unit } from './helpers';
import { regAbilities, regBuffs, regDefs, regFaction, regUpgrades } from './registry';

const F = 'crown' as const;
const STEEL = 0x9aa4b0;
const BLUE = 0x3d5a8a;
const GOLD = 0xd4a843;

// ---------------------------------------------------------------------------
// abilities
// ---------------------------------------------------------------------------
regBuffs([
  { id: 'shieldwall', name: 'Shield Wall', positive: true, fx: 'shieldwall', dispellable: false },
  { id: 'militia', name: 'Militia', positive: true },
]);

regAbilities([
  ab({ id: 'cr_calltoarms', name: 'Call to Arms', hotkey: 'C', icon: { glyph: 'banner', bg: 0x8a2a2a }, targeting: 'none', cooldown: 45, building: true, effect: { type: 'callToArms', radius: 15, into: 'cr_militia', duration: 45, instant: true, single: true }, description: 'Nearby Peasants take up arms as Militia for 45 seconds.' }),
  ab({ id: 'cr_backtowork', name: 'Back to Work', hotkey: 'B', icon: { glyph: 'pick', bg: 0x5a4a2a }, targeting: 'none', effect: { type: 'revert', instant: true }, description: 'Return to peasant work.' }),
  ab({ id: 'cr_shieldwall', name: 'Shield Wall', hotkey: 'D', icon: { glyph: 'shield', bg: 0x3a4a7a }, targeting: 'none', requiresUpgrade: 'cr_up_shieldwall', effect: { type: 'toggleBuff', buff: 'shieldwall', mods: { rangedDamageTakenPct: -0.4, armor: 2, moveSpeedPct: -0.3 }, instant: true }, description: 'Toggle: lock shields. Takes 40% less damage from ranged attacks and gains 2 armor, but moves 30% slower.' }),
  ab({ id: 'charge', name: 'Lance Charge', icon: { glyph: 'spear', bg: 0x6a5a2a }, targeting: 'passive', effect: { type: 'passive' }, description: 'After galloping at least 4 tiles, the next strike deals 75% bonus damage and briefly stuns.' }),
  ab({ id: 'cr_mend', name: 'Mend', hotkey: 'Q', icon: { glyph: 'cross', bg: 0x2a7a4a }, targeting: 'unit', filter: { ally: true, ground: true, air: true, organic: true }, range: 5, mana: 25, cooldown: 2.5, autocast: true, autocastDefault: true, effect: { type: 'heal', amount: 90 }, description: 'Heals a friendly unit for 90 health. Can be cast automatically.', ai: 'heal' }),
  ab({ id: 'cr_sanctify', name: 'Sanctify', hotkey: 'W', icon: { glyph: 'sun', bg: 0x8a7a2a }, targeting: 'point', range: 6, aoe: 2.6, mana: 75, cooldown: 6, effect: { type: 'dispel', radius: 2.6, summonDamage: 300 }, description: 'Purges magic in an area: removes enemy enchantments and ally afflictions, and deals 300 damage to summoned enemies.', ai: 'utility' }),
  ab({ id: 'cr_wardlight', name: 'Ward of Light', hotkey: 'E', icon: { glyph: 'shield', bg: 0x9a8a3a }, targeting: 'unit', filter: { ally: true, ground: true, air: true }, range: 5, mana: 35, cooldown: 2, autocast: true, autocastDefault: true, requiresUpgrade: 'cr_up_cleric', effect: { type: 'buff', buff: 'wardOfLight', duration: 60, mods: { armor: 4 } }, description: 'Shields an ally with light: +4 armor for 60 seconds.', ai: 'buff' }),
  ab({ id: 'cr_chronoweave', name: 'Chronoweave', hotkey: 'Q', icon: { glyph: 'hourglass', bg: 0x3a3a8a }, targeting: 'point', range: 6.5, aoe: 2.6, mana: 70, cooldown: 10, effect: { type: 'buff', targets: 'area', affects: 'enemies', radius: 2.6, buff: 'slow', duration: 8, durationHero: 4, mods: { moveSpeedPct: -0.5, attackSpeedPct: -0.3 }, fx: 'timeField' }, description: 'Warps time in an area: enemies move 50% and attack 30% slower for 8 seconds.', ai: 'debuff' }),
  ab({ id: 'cr_shackle', name: 'Arcane Shackle', hotkey: 'W', icon: { glyph: 'chain', bg: 0x5a2a8a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 6, mana: 100, cooldown: 14, requiresUpgrade: 'cr_up_weaver', effect: { type: 'buff', buff: 'shackle', duration: 5, durationHero: 2 }, description: 'Binds a target in arcane chains, holding it helpless for 5 seconds (2 on heroes).', ai: 'disable' }),
  ab({ id: 'cr_detect', name: 'Keen Lookout', icon: { glyph: 'eye', bg: 0x4a6a7a }, targeting: 'passive', effect: { type: 'passive' }, description: 'Detects invisible units.' }),
]);

// hero abilities
regAbilities([
  // Sword Marshal
  ab({ id: 'cr_shieldbash', name: 'Shield Bash', hotkey: 'Q', icon: { glyph: 'shield', bg: 0x7a3a2a }, targeting: 'unit', filter: { enemy: true, ground: true }, range: 1.8, mana: 90, cooldown: 9, effect: { type: 'damage', damage: [75, 140, 205], stun: [1.5, 2, 2.5], stunHero: [1, 1.25, 1.5], fx: 'bash' }, description: 'Smashes an enemy with the shield, dealing damage and stunning it.', levelText: ['75 damage, 1.5s stun', '140 damage, 2s stun', '205 damage, 2.5s stun'], ai: 'disable' }),
  ab({ id: 'cr_banner', name: 'Rallying Banner', hotkey: 'W', icon: { glyph: 'banner', bg: 0x2a4a8a }, targeting: 'point', range: 6, mana: 80, cooldown: 22, effect: { type: 'summon', unit: ['cr_banner1', 'cr_banner2', 'cr_banner3'], count: 1, duration: 25, at: 'target' }, description: 'Plants a war banner. Allies near it deal bonus damage for 25 seconds.', levelText: ['+10% damage', '+20% damage', '+30% damage'], ai: 'summon' }),
  ab({ id: 'cr_fortitude', name: 'Fortitude Aura', hotkey: 'E', icon: { glyph: 'aura', bg: 0x3a5a8a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_fortitude', radius: 8, targets: 'allies', mods: { armor: [1, 2, 3], hpRegen: [0.5, 1, 1.5] } }, description: 'Nearby allies gain armor and health regeneration.', levelText: ['+1 armor, +0.5 regen', '+2 armor, +1 regen', '+3 armor, +1.5 regen'] }),
  ab({ id: 'cr_laststand', name: 'Last Stand', hotkey: 'R', icon: { glyph: 'crown', bg: 0x8a6a1a }, targeting: 'none', ultimate: true, maxLevel: 1, aoe: 9, mana: 150, cooldown: 150, effect: { type: 'buff', targets: 'aroundSelf', affects: 'allies', radius: 9, buff: 'undying', duration: 8, mods: { attackSpeedPct: 0.4 }, fx: 'laststand' }, description: 'For 8 seconds nearby allies cannot be slain and attack 40% faster.', ai: 'ultimate' }),
  // Lightwarden
  ab({ id: 'cr_radiantlance', name: 'Radiant Lance', hotkey: 'Q', icon: { glyph: 'sun', bg: 0xaa8a2a }, targeting: 'point', range: 9, mana: 100, cooldown: 10, effect: { type: 'line', length: 9, width: 1.1, damage: [90, 160, 230], undeadDouble: true, fx: 'holyline' }, description: 'A spear of light pierces all enemies in a line. Undead take double damage.', levelText: ['90 damage', '160 damage', '230 damage'], ai: 'aoe' }),
  ab({ id: 'cr_sanctuary', name: 'Sanctuary', hotkey: 'W', icon: { glyph: 'cross', bg: 0x2a8a5a }, targeting: 'point', range: 7, aoe: 3.5, mana: 110, cooldown: 18, effect: { type: 'zone', radius: 3.5, duration: 8, interval: 1, heal: [15, 25, 35], fx: 'holyzone' }, description: 'Consecrates the ground, healing allies standing in it every second for 8 seconds.', levelText: ['15 health per second', '25 health per second', '35 health per second'], ai: 'heal' }),
  ab({ id: 'cr_halo', name: 'Halo Aura', hotkey: 'E', icon: { glyph: 'aura', bg: 0x8a8a3a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_halo', radius: 8, targets: 'allies', mods: { spellDamageTakenPct: [-0.12, -0.22, -0.32], manaRegen: [0.2, 0.4, 0.6] } }, description: 'Nearby allies resist spell damage and regenerate mana faster.', levelText: ['-12% spell damage', '-22% spell damage', '-32% spell damage'] }),
  ab({ id: 'cr_dawnbreak', name: 'Dawnbreak', hotkey: 'R', icon: { glyph: 'sun', bg: 0xcc9a2a }, targeting: 'none', ultimate: true, maxLevel: 1, aoe: 10, mana: 175, cooldown: 140, effect: { type: 'area', center: 'self', affects: 'all', radius: 10, damage: 240, heal: 240, undeadDouble: true, forceDay: 60, fx: 'dawn' }, description: 'Calls the dawn: enemies nearby take 240 damage (double to undead), allies are healed for 240, and day breaks for 60 seconds.', ai: 'ultimate' }),
  // Gunsmith Thane
  ab({ id: 'cr_scattershot', name: 'Scatter Shot', hotkey: 'Q', icon: { glyph: 'rifle', bg: 0x6a4a2a }, targeting: 'point', range: 7, mana: 85, cooldown: 9, effect: { type: 'line', length: 7, width: 2.2, damage: [70, 125, 180], buff: 'slow', duration: 3, mods: { moveSpeedPct: -0.4 }, fx: 'shotgun' }, description: 'Fires a spray of shot in a wide cone, damaging and slowing enemies.', levelText: ['70 damage', '125 damage', '180 damage'], ai: 'aoe' }),
  ab({ id: 'cr_turret', name: 'Clockwork Turret', hotkey: 'W', icon: { glyph: 'gear', bg: 0x5a5a6a }, targeting: 'point', range: 5, mana: 100, cooldown: 22, effect: { type: 'summon', unit: ['cr_turret1', 'cr_turret2', 'cr_turret3'], count: 1, duration: 25, at: 'target' }, description: 'Deploys a self-aiming rifle turret for 25 seconds.', levelText: ['Light turret', 'Medium turret', 'Heavy turret'], ai: 'summon' }),
  ab({ id: 'cr_keeneye', name: 'Keen Eye', hotkey: 'E', icon: { glyph: 'eye', bg: 0x4a6a3a }, targeting: 'passive', effect: { type: 'passive', mods: { rangeBonus: [1, 2, 3], damageFlat: [4, 8, 12] } }, description: 'Increases attack range and damage.', levelText: ['+1 range, +4 damage', '+2 range, +8 damage', '+3 range, +12 damage'] }),
  ab({ id: 'cr_siegebarrage', name: 'Siege Barrage', hotkey: 'R', icon: { glyph: 'cannon', bg: 0x7a3a1a }, targeting: 'point', ultimate: true, maxLevel: 1, range: 10, aoe: 5, mana: 200, cooldown: 150, channel: 6, castPoint: 0.4, effect: { type: 'barrage', radius: 5, interval: 0.28, damage: 70, strikeRadius: 1.5, structureMult: 2, fx: 'shellstrike' }, description: 'Signals the batteries: explosive shells rain on the area while the Thane channels.', ai: 'ultimate' }),
]);

// ---------------------------------------------------------------------------
// upgrades
// ---------------------------------------------------------------------------
regUpgrades([
  tieredUpgrade('cr_up_melee', 'Tempered Steel', F, { glyph: 'sword', bg: 0x5a5a6a }, ['cr_shieldbearer', 'cr_lancer', 'cr_militia', 'cr_colossus'], { damagePct: 0.1 }, 'Increases the damage of melee units by 10% per level.'),
  tieredUpgrade('cr_up_ranged', 'Rifled Bores', F, { glyph: 'rifle', bg: 0x5a4a3a }, ['cr_rifleman', 'cr_mortar', 'cr_skyskiff', 'cr_roc'], { damagePct: 0.1 }, 'Increases the damage of ranged units by 10% per level.'),
  tieredUpgrade('cr_up_plate', 'Plate Armor', F, { glyph: 'helm', bg: 0x4a5a6a }, ['cr_shieldbearer', 'cr_lancer', 'cr_militia', 'cr_colossus'], { armor: 2 }, 'Increases the armor of heavily armored units by 2 per level.'),
  tieredUpgrade('cr_up_leather', 'Hardened Leather', F, { glyph: 'helm', bg: 0x6a4a2a }, ['cr_rifleman', 'cr_mortar', 'cr_skyskiff', 'cr_roc', 'cr_cleric', 'cr_weaver'], { armor: 2 }, 'Increases the armor of lightly armored units by 2 per level.'),
  tieredUpgrade('cr_up_saws', 'Serrated Saws', F, { glyph: 'log', bg: 0x6a4a2a }, ['cr_peasant'], { lumberCarry: 5 }, 'Peasants carry 5 more lumber per trip per level.', [
    { gold: 120, lumber: 0, time: 40 },
    { gold: 160, lumber: 0, time: 50, requires: ['tier2'] },
  ]),
  tieredUpgrade('cr_up_masonry', 'Masonry', F, { glyph: 'castle', bg: 0x6a6a6a }, ['building'], { buildingHpPct: 0.15, armor: 1 }, 'Buildings gain 15% health and +1 armor per level.', [
    { gold: 125, lumber: 25, time: 40 },
    { gold: 150, lumber: 50, time: 50, requires: ['tier2'] },
    { gold: 175, lumber: 75, time: 60, requires: ['tier3'] },
  ]),
  singleUpgrade('cr_up_shieldwall', 'Shield Wall Drill', F, { glyph: 'shield', bg: 0x3a4a7a }, ['cr_shieldbearer'], { gold: 100, lumber: 150 }, 45, 'Trains Shieldbearers to form a Shield Wall.', { unlocksAbility: 'cr_shieldwall' }),
  singleUpgrade('cr_up_sharpshot', 'Long Barrels', F, { glyph: 'rifle', bg: 0x4a5a3a }, ['cr_rifleman'], { gold: 75, lumber: 125 }, 40, 'Riflemen gain +1.5 attack range.', { mods: { rangeBonus: 1.5 }, requires: ['tier2'] }),
  singleUpgrade('cr_up_cleric', 'Cleric Ordination', F, { glyph: 'book', bg: 0x2a7a4a }, ['cr_cleric'], { gold: 100, lumber: 100 }, 50, 'Clerics gain 100 mana and learn Ward of Light.', { mods: { maxMana: 100, manaRegen: 0.15 }, unlocksAbility: 'cr_wardlight' }),
  singleUpgrade('cr_up_weaver', 'Spellweaver Mastery', F, { glyph: 'book', bg: 0x5a2a8a }, ['cr_weaver'], { gold: 125, lumber: 125 }, 55, 'Spellweavers gain 100 mana and learn Arcane Shackle.', { mods: { maxMana: 100, manaRegen: 0.15 }, unlocksAbility: 'cr_shackle', requires: ['tier3'] }),
  singleUpgrade('cr_up_shells', 'Heavy Shells', F, { glyph: 'bomb', bg: 0x6a3a1a }, ['cr_mortar'], { gold: 100, lumber: 100 }, 40, 'Mortar Teams deal 25% more damage.', { mods: { damagePct: 0.25 } }),
  singleUpgrade('cr_up_flak', 'Harpoon Winches', F, { glyph: 'spear', bg: 0x4a4a5a }, ['cr_skyskiff'], { gold: 100, lumber: 75 }, 40, 'Skyskiffs deal 35% more damage.', { mods: { damagePct: 0.35 } }),
]);

// ---------------------------------------------------------------------------
// units
// ---------------------------------------------------------------------------
regDefs([
  unit({
    id: 'cr_peasant', name: 'Peasant', faction: F, description: 'A hardy villager. Gathers gold and lumber, builds and repairs. Several Peasants can work on a building together.',
    hp: 230, armor: 0, cost: { gold: 75, lumber: 0, food: 1 }, buildTime: 15, speed: 2.4, radius: 0.32, level: 1, sight: [8, 6],
    weapon: melee([5, 7], 2.0), tags: { organic: true, worker: true }, harvest: { gold: 'standard', lumber: 'standard' }, hotkey: 'P', priority: 1,
    model: { kind: 'humanoid', skin: 0xe0b090, body: 0x8a6a3a, legs: 0x5a4a3a, helm: 'cap', helmColor: 0x6a4a2a, weapon: 'pick', team: 'tabard' },
  }),
  unit({
    id: 'cr_militia', name: 'Militia', faction: F, description: 'Peasants armed for the defense of their town.',
    hp: 230, armor: 3, armorType: 'heavy', cost: { gold: 0, lumber: 0, food: 1 }, buildTime: 1, speed: 2.5, radius: 0.32, level: 1, sight: [8, 6],
    weapon: melee([11, 13], 1.3), abilities: ['cr_backtowork'], tags: { organic: true, melee: true }, priority: 2,
    model: { kind: 'humanoid', skin: 0xe0b090, body: 0x6a6a72, legs: 0x5a4a3a, helm: 'helm', helmColor: STEEL, weapon: 'sword', shield: 'buckler', team: 'tabard' },
  }),
  unit({
    id: 'cr_shieldbearer', name: 'Shieldbearer', faction: F, description: 'Steadfast sword-and-shield infantry, the backbone of the League. Can form a Shield Wall against missiles.',
    hp: 450, armor: 2, armorType: 'heavy', cost: { gold: 135, lumber: 0, food: 2 }, buildTime: 20, speed: 2.5, radius: 0.38, level: 2,
    weapon: melee([12, 14], 1.35), abilities: ['cr_shieldwall'], tags: { organic: true, melee: true }, hotkey: 'S', priority: 4,
    model: { kind: 'humanoid', skin: 0xe0b090, body: STEEL, legs: 0x4a4a52, armor: STEEL, helm: 'helm', helmColor: STEEL, weapon: 'sword', shield: 'kite', team: 'shield' },
  }),
  unit({
    id: 'cr_rifleman', name: 'Hill Rifleman', faction: F, description: 'A sturdy mountain-folk marksman. Strong against air units and light armor.',
    hp: 330, armor: 0, armorType: 'medium', cost: { gold: 205, lumber: 30, food: 3 }, buildTime: 26, speed: 2.35, radius: 0.36, level: 2, requires: ['cr_smith'],
    weapon: missile([20, 24], 5, 'pierce', BULLET, 1.5), tags: { organic: true, ranged: true }, hotkey: 'R', priority: 3,
    model: { kind: 'humanoid', scale: 0.88, bulk: 1.3, skin: 0xe8b890, body: 0x5a4a3a, legs: 0x3a3a3a, helm: 'helm', helmColor: 0x8a7a5a, weapon: 'rifle', beard: 0xb06a2a, team: 'tabard' },
  }),
  unit({
    id: 'cr_lancer', name: 'Lancer', faction: F, description: 'Heavily armored cavalry. A lance charge after a gallop strikes with crushing force.',
    hp: 830, armor: 5, armorType: 'heavy', cost: { gold: 250, lumber: 65, food: 4 }, buildTime: 40, speed: 3.4, radius: 0.55, level: 4, requires: ['tier2', 'cr_smith', 'cr_mill'],
    weapon: melee([30, 36], 1.4), abilities: ['charge'], tags: { organic: true, melee: true, cavalry: true }, hotkey: 'L', priority: 6,
    model: { kind: 'rider', mount: 'horse', mountColor: 0xd8d0c0, barding: true, skin: 0xe0b090, body: STEEL, armor: STEEL, helm: 'helm', helmColor: STEEL, weapon: 'lance', shield: 'kite', team: 'barding' },
  }),
  unit({
    id: 'cr_cleric', name: 'Cleric', faction: F, description: 'A temple healer who mends wounds, purges hostile magic and shields allies with light.',
    hp: 290, mana: 250, armor: 0, armorType: 'unarmored', cost: { gold: 135, lumber: 10, food: 2 }, buildTime: 28, speed: 2.35, radius: 0.34, level: 2, requires: ['tier2'],
    weapon: missile([8, 10], 5, 'magic', orb(0xfff0a0), 2.0), abilities: ['cr_mend', 'cr_sanctify', 'cr_wardlight'], tags: { organic: true, caster: true }, hotkey: 'C', priority: 5,
    model: { kind: 'humanoid', skin: 0xe0b090, body: 0xece4d0, robe: true, helm: 'hood', helmColor: 0xece4d0, weapon: 'staff', orb: 0xfff0a0, team: 'sash' },
  }),
  unit({
    id: 'cr_weaver', name: 'Spellweaver', faction: F, description: 'An academy mage who bends time to slow foes and chains the strongest in arcane shackles.',
    hp: 320, mana: 300, armor: 0, armorType: 'unarmored', cost: { gold: 155, lumber: 20, food: 2 }, buildTime: 30, speed: 2.35, radius: 0.34, level: 3, requires: ['tier2'],
    weapon: missile([10, 12], 5, 'magic', orb(0xb48aff), 1.9), abilities: ['cr_chronoweave', 'cr_shackle'], tags: { organic: true, caster: true }, hotkey: 'W', priority: 5,
    model: { kind: 'humanoid', skin: 0xf0c8a8, body: 0x4a2a7a, robe: true, helm: 'pointed', helmColor: 0x4a2a7a, weapon: 'staff', orb: 0xb48aff, team: 'sash' },
  }),
  unit({
    id: 'cr_mortar', name: 'Mortar Team', faction: F, description: 'Two mountain-folk gunners with a heavy mortar. Devastating against buildings and clustered troops, but helpless in melee.',
    hp: 380, armor: 0, armorType: 'heavy', cost: { gold: 180, lumber: 70, food: 3 }, buildTime: 34, speed: 2.1, radius: 0.48, level: 3, requires: ['tier2'],
    weapon: missile([58, 68], 9, 'siege', SHELL, 3.4, { targets: { ground: true, structure: true }, splash: { radius: 1.6, factor: 0.5 }, damagePoint: 0.5 }), tags: { organic: true, siege: true }, hotkey: 'M', priority: 3,
    model: { kind: 'wagon', variant: 'mortar', color: 0x5a5a5a, crew: 0xe8b890 },
  }),
  unit({
    id: 'cr_skyskiff', name: 'Skyskiff', faction: F, description: 'A small gas-bag airship crewed by a harpoonist. Fast, far-sighted and able to spot invisible units.',
    hp: 270, armor: 2, armorType: 'light', cost: { gold: 110, lumber: 30, food: 1 }, buildTime: 22, speed: 3.6, radius: 0.45, level: 2, air: true, flyHeight: 3.0, requires: ['tier2'], sight: [13, 9],
    weapon: missile([12, 15], 4, 'pierce', { kind: 'spear', speed: 18 }, 1.4), abilities: ['cr_detect'], tags: { mechanical: true, detector: true }, hotkey: 'K', priority: 2,
    model: { kind: 'flyer', variant: 'balloon', color: 0xc8b890, wingColor: 0x6a4a2a },
  }),
  unit({
    id: 'cr_colossus', name: 'Steam Colossus', faction: F, description: 'A towering steam-driven war machine that smashes fortifications. Immune to magic.',
    hp: 1350, armor: 4, armorType: 'heavy', cost: { gold: 300, lumber: 120, food: 5 }, buildTime: 50, speed: 1.9, radius: 0.75, level: 6, requires: ['tier3'],
    weapon: melee([55, 65], 2.2, { type: 'siege', vsStructure: 1.4, damagePoint: 0.6 }), tags: { mechanical: true, melee: true, magicImmune: true }, hotkey: 'O', priority: 7,
    model: { kind: 'machine', variant: 'colossus', color: 0x8a6a4a, metal: 0x6a6a72, glow: 0xffa040 },
  }),
  unit({
    id: 'cr_roc', name: 'Roc Knight', faction: F, description: 'An elite knight mounted on a great golden roc, hurling lances of light at foes on land and in the air.',
    hp: 900, armor: 1, armorType: 'light', cost: { gold: 290, lumber: 80, food: 5 }, buildTime: 50, speed: 3.0, radius: 0.65, level: 6, air: true, flyHeight: 3.2, requires: ['tier3'],
    weapon: missile([48, 56], 3.8, 'magic', { kind: 'bolt', speed: 16, color: 0xffe080 }, 2.0, { splash: { radius: 1.0, factor: 0.5 } }), tags: { organic: true }, hotkey: 'G', priority: 7,
    model: { kind: 'flyer', variant: 'roc', color: 0xd8a040, wingColor: 0xb08030, rider: true, riderColor: STEEL, scale: 1.1 },
  }),
  // summons
  unit({ id: 'cr_banner1', name: 'War Banner', faction: F, description: 'Allies nearby deal 10% more damage.', hp: 180, armor: 2, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.25, level: 1, abilities: ['cr_banneraura1'], tags: { summoned: true }, model: { kind: 'ward', variant: 'banner', color: BLUE } }),
  unit({ id: 'cr_banner2', name: 'War Banner', faction: F, description: 'Allies nearby deal 20% more damage.', hp: 240, armor: 3, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.25, level: 1, abilities: ['cr_banneraura2'], tags: { summoned: true }, model: { kind: 'ward', variant: 'banner', color: BLUE } }),
  unit({ id: 'cr_banner3', name: 'War Banner', faction: F, description: 'Allies nearby deal 30% more damage.', hp: 300, armor: 4, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.25, level: 1, abilities: ['cr_banneraura3'], tags: { summoned: true }, model: { kind: 'ward', variant: 'banner', color: BLUE } }),
  unit({ id: 'cr_turret1', name: 'Clockwork Turret', faction: F, description: 'A self-aiming rifle.', hp: 260, armor: 2, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.4, level: 2, weapon: missile([16, 19], 6, 'pierce', BULLET, 0.9), tags: { summoned: true, mechanical: true }, model: { kind: 'ward', variant: 'turret', color: 0x6a5a4a } }),
  unit({ id: 'cr_turret2', name: 'Clockwork Turret', faction: F, description: 'A self-aiming rifle.', hp: 360, armor: 3, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.4, level: 3, weapon: missile([24, 28], 6, 'pierce', BULLET, 0.9), tags: { summoned: true, mechanical: true }, model: { kind: 'ward', variant: 'turret', color: 0x6a5a4a, scale: 1.1 } }),
  unit({ id: 'cr_turret3', name: 'Clockwork Turret', faction: F, description: 'A self-aiming rifle.', hp: 480, armor: 4, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.45, level: 4, weapon: missile([32, 37], 6.5, 'pierce', BULLET, 0.9), tags: { summoned: true, mechanical: true }, model: { kind: 'ward', variant: 'turret', color: 0x6a5a4a, scale: 1.25 } }),
]);

regAbilities([
  ab({ id: 'cr_banneraura1', name: 'Rallying Banner', icon: { glyph: 'banner', bg: 0x2a4a8a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_banner', radius: 7, targets: 'allies', mods: { damagePct: 0.1 } }, description: 'Allies nearby deal 10% more damage.' }),
  ab({ id: 'cr_banneraura2', name: 'Rallying Banner', icon: { glyph: 'banner', bg: 0x2a4a8a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_banner', radius: 7, targets: 'allies', mods: { damagePct: 0.2 } }, description: 'Allies nearby deal 20% more damage.' }),
  ab({ id: 'cr_banneraura3', name: 'Rallying Banner', icon: { glyph: 'banner', bg: 0x2a4a8a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_banner', radius: 7, targets: 'allies', mods: { damagePct: 0.3 } }, description: 'Allies nearby deal 30% more damage.' }),
]);

// heroes
regDefs([
  heroDef({
    id: 'cr_h_marshal', name: 'Sword Marshal', faction: F, description: 'A veteran commander who leads from the front line, bolstering every soldier around her.',
    armor: 2, speed: 2.7,
    weapon: { damage: [12, 22], cooldown: 2.2, range: 0.35, damagePoint: 0.4, type: 'hero', targets: { ground: true, structure: true } },
    hero: { primary: 'str', str: 24, agi: 13, int: 15, strGain: 2.7, agiGain: 1.5, intGain: 1.8, abilities: ['cr_shieldbash', 'cr_banner', 'cr_fortitude', 'cr_laststand'], title: 'Warrior Hero' },
    model: { kind: 'humanoid', scale: 1.15, skin: 0xe8c0a0, body: STEEL, armor: GOLD, helm: 'crown', helmColor: GOLD, weapon: 'sword', shield: 'kite', cape: true, hair: 0xd8b060 },
    hotkey: 'M',
  }),
  heroDef({
    id: 'cr_h_lightwarden', name: 'Lightwarden', faction: F, description: 'A priest-mage of the dawn, scourge of the restless dead and healer of the faithful.',
    armor: 1, speed: 2.65,
    weapon: { damage: [14, 20], cooldown: 2.1, range: 5.5, damagePoint: 0.35, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: orb(0xfff0a0, 13, 1.2) },
    hero: { primary: 'int', str: 17, agi: 14, int: 21, strGain: 2.0, agiGain: 1.3, intGain: 3.0, abilities: ['cr_radiantlance', 'cr_sanctuary', 'cr_halo', 'cr_dawnbreak'], title: 'Light Caster Hero' },
    model: { kind: 'humanoid', scale: 1.1, skin: 0xe8c0a0, body: 0xf0e8d0, armor: GOLD, robe: true, helm: 'circlet', helmColor: GOLD, weapon: 'staff', orb: 0xfff0a0, cape: true, hair: 0xe8e0d0 },
    hotkey: 'L',
  }),
  heroDef({
    id: 'cr_h_thane', name: 'Gunsmith Thane', faction: F, description: 'A mountain-folk master engineer with an enchanted long rifle and a talent for clockwork.',
    armor: 2, speed: 2.6,
    weapon: { damage: [13, 21], cooldown: 1.9, range: 5.5, damagePoint: 0.3, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: BULLET },
    hero: { primary: 'agi', str: 19, agi: 20, int: 14, strGain: 2.2, agiGain: 2.7, intGain: 1.5, abilities: ['cr_scattershot', 'cr_turret', 'cr_keeneye', 'cr_siegebarrage'], title: 'Ranged Agility Hero' },
    model: { kind: 'humanoid', scale: 1.0, bulk: 1.4, skin: 0xe8b890, body: 0x6a4a2a, armor: GOLD, helm: 'goggles', helmColor: 0x8a6a3a, weapon: 'rifle', beard: 0xd07030, cape: true },
    hotkey: 'T',
  }),
]);

// ---------------------------------------------------------------------------
// buildings
// ---------------------------------------------------------------------------
regDefs([
  building({
    id: 'cr_hall', name: 'Town Hall', faction: F, description: 'The heart of a League settlement. Trains Peasants, receives gold and lumber, and can call Peasants to arms.',
    hp: 1600, armor: 5, size: 5, cost: { gold: 385, lumber: 185 }, buildTime: 110, mainHall: true, hallTier: 1, foodProvided: 12, dropoff: ['gold', 'lumber'],
    trains: ['cr_peasant'], upgradesTo: 'cr_keep', abilities: ['cr_calltoarms'], hotkey: 'H', sight: [10, 8],
    model: { kind: 'building', faction: F, variant: 'hall' },
  }),
  building({
    id: 'cr_keep', name: 'Stone Keep', faction: F, description: 'A fortified keep. Unlocks tier two technology.',
    hp: 2000, armor: 5, size: 5, cost: { gold: 320, lumber: 210 }, buildTime: 120, mainHall: true, hallTier: 2, foodProvided: 12, dropoff: ['gold', 'lumber'],
    trains: ['cr_peasant'], upgradesTo: 'cr_citadel', abilities: ['cr_calltoarms'], buildable: false, requires: ['cr_barracks'], sight: [11, 8],
    model: { kind: 'building', faction: F, variant: 'keep' },
  }),
  building({
    id: 'cr_citadel', name: 'Grand Citadel', faction: F, description: 'The seat of League power. Unlocks tier three technology.',
    hp: 2500, armor: 6, size: 5, cost: { gold: 360, lumber: 230 }, buildTime: 135, mainHall: true, hallTier: 3, foodProvided: 12, dropoff: ['gold', 'lumber'],
    trains: ['cr_peasant'], abilities: ['cr_calltoarms'], buildable: false, requires: ['cr_altar'], sight: [12, 9],
    model: { kind: 'building', faction: F, variant: 'citadel' },
  }),
  building({
    id: 'cr_farm', name: 'Farm', faction: F, description: 'Provides 7 food.', hp: 500, armor: 2, size: 2, cost: { gold: 80, lumber: 20 }, buildTime: 35, foodProvided: 7, hotkey: 'F',
    model: { kind: 'building', faction: F, variant: 'farm' },
  }),
  building({
    id: 'cr_barracks', name: 'Barracks', faction: F, description: 'Trains Shieldbearers, Riflemen and Lancers.', hp: 1200, size: 4, cost: { gold: 160, lumber: 50 }, buildTime: 60,
    trains: ['cr_shieldbearer', 'cr_rifleman', 'cr_lancer'], researches: ['cr_up_shieldwall', 'cr_up_sharpshot'], hotkey: 'B',
    model: { kind: 'building', faction: F, variant: 'barracks' },
  }),
  building({
    id: 'cr_mill', name: 'Lumber Mill', faction: F, description: 'Receives lumber. Researches lumber harvesting and masonry.', hp: 900, size: 3, cost: { gold: 120, lumber: 0 }, buildTime: 45, dropoff: ['lumber'],
    researches: ['cr_up_saws', 'cr_up_masonry'], hotkey: 'L', model: { kind: 'building', faction: F, variant: 'mill' },
  }),
  building({
    id: 'cr_smith', name: 'Blacksmith', faction: F, description: 'Forges weapon and armor improvements.', hp: 1000, size: 3, cost: { gold: 140, lumber: 60 }, buildTime: 50,
    researches: ['cr_up_melee', 'cr_up_ranged', 'cr_up_plate', 'cr_up_leather'], requires: ['cr_hall'], hotkey: 'S', model: { kind: 'building', faction: F, variant: 'smith' },
  }),
  building({
    id: 'cr_altar', name: 'Altar of Kings', faction: F, description: 'Summons and revives heroes.', hp: 900, size: 3, cost: { gold: 180, lumber: 50 }, buildTime: 55, isAltar: true,
    trains: ['cr_h_marshal', 'cr_h_lightwarden', 'cr_h_thane'], hotkey: 'A', model: { kind: 'building', faction: F, variant: 'altar' },
  }),
  building({
    id: 'cr_academy', name: 'Arcane Academy', faction: F, description: 'Trains Clerics and Spellweavers.', hp: 1000, size: 3, cost: { gold: 150, lumber: 140 }, buildTime: 60, requires: ['tier2'],
    trains: ['cr_cleric', 'cr_weaver'], researches: ['cr_up_cleric', 'cr_up_weaver'], advanced: true, hotkey: 'Y', model: { kind: 'building', faction: F, variant: 'academy' },
  }),
  building({
    id: 'cr_workshop', name: 'Engineering Workshop', faction: F, description: 'Builds Mortar Teams, Skyskiffs and the Steam Colossus.', hp: 1100, size: 4, cost: { gold: 140, lumber: 140 }, buildTime: 60, requires: ['tier2', 'cr_smith'],
    trains: ['cr_mortar', 'cr_skyskiff', 'cr_colossus'], researches: ['cr_up_shells', 'cr_up_flak'], advanced: true, hotkey: 'W', model: { kind: 'building', faction: F, variant: 'workshop' },
  }),
  building({
    id: 'cr_aerie', name: 'Roc Aerie', faction: F, description: 'Trains Roc Knights.', hp: 1000, size: 4, cost: { gold: 140, lumber: 150 }, buildTime: 60, requires: ['tier3', 'cr_mill'],
    trains: ['cr_roc'], advanced: true, hotkey: 'E', model: { kind: 'building', faction: F, variant: 'aerie' },
  }),
  building({
    id: 'cr_shop', name: 'Royal Supply House', faction: F, description: 'Sells potions, scrolls and enchanted gear to nearby heroes.', hp: 700, size: 3, cost: { gold: 130, lumber: 30 }, buildTime: 50, requires: ['cr_hall'],
    shopItems: ['item_heal', 'item_mana', 'item_homeward', 'item_dust', 'item_ward', 'item_mending', 'item_armor'], advanced: true, hotkey: 'U', model: { kind: 'building', faction: F, variant: 'shop' },
  }),
  building({
    id: 'cr_tower', name: 'Watchtower', faction: F, description: 'A lookout tower. Can be upgraded into a Bowman, Bombard or Spellward Tower.', hp: 420, armor: 3, size: 2, cost: { gold: 30, lumber: 80 }, buildTime: 25, sight: [12, 10],
    upgradeOptions: ['cr_tower_arrow', 'cr_tower_cannon', 'cr_tower_arcane'], hotkey: 'T', tags: { detector: true }, model: { kind: 'building', faction: F, variant: 'tower' },
  }),
  building({
    id: 'cr_tower_arrow', name: 'Bowman Tower', faction: F, description: 'Fires arrows at ground and air units.', hp: 560, armor: 5, size: 2, cost: { gold: 70, lumber: 50 }, buildTime: 30, sight: [12, 10], buildable: false,
    weapon: missile([22, 26], 7, 'pierce', ARROW, 0.95), tags: { detector: true }, model: { kind: 'building', faction: F, variant: 'towerArrow' },
  }),
  building({
    id: 'cr_tower_cannon', name: 'Bombard Tower', faction: F, description: 'Lobs exploding shells at ground units and buildings.', hp: 620, armor: 5, size: 2, cost: { gold: 170, lumber: 100 }, buildTime: 40, sight: [12, 10], buildable: false, requires: ['cr_workshop'],
    weapon: missile([75, 92], 8, 'siege', SHELL, 2.6, { targets: { ground: true, structure: true }, splash: { radius: 1.6, factor: 0.5 } }), tags: { detector: true }, model: { kind: 'building', faction: F, variant: 'towerCannon' },
  }),
  building({
    id: 'cr_tower_arcane', name: 'Spellward Tower', faction: F, description: 'Burns mana with each bolt and deals heavy damage to summoned creatures.', hp: 560, armor: 5, size: 2, cost: { gold: 100, lumber: 150 }, buildTime: 35, sight: [12, 10], buildable: false, requires: ['cr_academy'],
    weapon: missile([18, 22], 7, 'magic', orb(0x9a7aff), 1.1), abilities: ['cr_spellward'], tags: { detector: true }, model: { kind: 'building', faction: F, variant: 'towerArcane' },
  }),
]);

regAbilities([
  ab({ id: 'cr_spellward', name: 'Spellfire', icon: { glyph: 'orb', bg: 0x5a3a8a }, targeting: 'passive', effect: { type: 'passive', mods: { manaBurnOnHit: 16, bonusVsSummoned: 30 } }, description: 'Each attack burns 16 mana and deals +30 damage to summoned units.' }),
]);

regFaction({
  id: F,
  name: 'Crown League',
  adjective: 'League',
  description: 'An organized alliance of humans, mountain craftsmen and accomplished spellcasters. Balanced combined arms, strong fortifications and versatile magic.',
  color: 0x3d6ad0,
  worker: 'cr_peasant',
  hall: 'cr_hall',
  startUnits: [{ id: 'cr_peasant', count: 5 }],
  heroes: ['cr_h_marshal', 'cr_h_lightwarden', 'cr_h_thane'],
  altar: 'cr_altar',
  farm: 'cr_farm',
  shop: 'cr_shop',
  tower: 'cr_tower',
  barracks: 'cr_barracks',
  lumberDropoff: 'cr_mill',
  traits: ['Several Peasants can build together', 'Call to Arms turns Peasants into Militia', 'Towers specialize into three types'],
});
