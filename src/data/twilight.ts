import { ARROW, BOULDER, ab, building, heroDef, melee, missile, orb, singleUpgrade, tieredUpgrade, unit } from './helpers';
import { regAbilities, regDefs, regFaction, regUpgrades } from './registry';
import type { EntityDef } from './types';

const F = 'twilight' as const;
const BARK = 0x5b4636;
const LEAF = 0x2f6b4f;
const VIOLET = 0xb98cff;
const MOON = 0xcfe3ff;
const SKIN = 0x9a8ac8;

/** Ancients consume the spirit that plants them and can uproot to walk. */
const ancient = (p: Parameters<typeof building>[0]): EntityDef => building({ buildMode: 'consume', tags: { ancient: true }, ...p });
const grown = (p: Parameters<typeof building>[0]): EntityDef => building({ buildMode: 'standard', ...p });

regAbilities([
  ab({ id: 'tw_bindmine', name: 'Bind Gold Mine', hotkey: 'G', icon: { glyph: 'coin', bg: 0x3a5a2a }, targeting: 'unit', filter: { goldMine: true, structure: true }, range: 14, cooldown: 2, building: true, effect: { type: 'bindMine' }, description: 'Roots of the Heart entwine a nearby gold mine so that Forest Spirits can draw gold from it.' }),
  ab({ id: 'tw_uproot', name: 'Uproot', hotkey: 'U', icon: { glyph: 'tree', bg: 0x4a3a2a }, targeting: 'none', building: true, effect: { type: 'uproot', instant: true }, description: 'Pulls up its roots and walks. While uprooted it cannot train units but can fight.' }),
  ab({ id: 'tw_root', name: 'Root', hotkey: 'R', icon: { glyph: 'tree', bg: 0x2a4a2a }, targeting: 'point', range: 0.5, effect: { type: 'root' }, description: 'Sends roots into the ground at a chosen spot, becoming a building again.' }),
  ab({ id: 'tw_nightveil', name: 'Night Veil', icon: { glyph: 'moon', bg: 0x2a2a5a }, targeting: 'passive', effect: { type: 'nightVeil' }, description: 'At night, becomes invisible while standing still. Attacking or moving reveals it.' }),
  ab({ id: 'tw_moonguard', name: 'Moonguard', icon: { glyph: 'shield', bg: 0x3a3a6a }, targeting: 'passive', requiresUpgrade: 'tw_up_moonguard', effect: { type: 'passive', mods: { evasion: 0.18 } }, description: '18% chance to evade attacks.' }),
  ab({ id: 'tw_trample', name: 'Antler Charge', hotkey: 'Q', icon: { glyph: 'beast', bg: 0x5a4a2a }, targeting: 'unit', filter: { enemy: true, ground: true }, range: 6, cooldown: 16, effect: { type: 'strike', damage: 75, stun: 1, stunHero: 0.5, thenAttack: true }, description: 'Bounds to an enemy and gores it, dealing 75 damage and stunning briefly.', ai: 'nuke' }),
  ab({ id: 'tw_renewal', name: 'Renewal', hotkey: 'Q', icon: { glyph: 'leaf', bg: 0x2a7a3a }, targeting: 'unit', filter: { ally: true, ground: true, air: true, organic: true }, range: 5.5, mana: 50, cooldown: 3, autocast: true, autocastDefault: true, effect: { type: 'heal', amount: 0, buff: 'renewal', duration: 10, hot: 15 }, description: 'Heals an ally for 150 over 10 seconds.', ai: 'heal' }),
  ab({ id: 'tw_thorns', name: 'Grasping Thorns', hotkey: 'W', icon: { glyph: 'leaf', bg: 0x4a6a2a }, targeting: 'unit', filter: { enemy: true, ground: true }, range: 6, mana: 75, cooldown: 12, effect: { type: 'buff', buff: 'entangle', duration: 4, durationHero: 2, dot: 10, fx: 'roots' }, description: 'Thorny vines bind an enemy for 4 seconds, damaging it.', ai: 'disable' }),
  ab({ id: 'tw_wildform', name: 'Wild Form', hotkey: 'E', icon: { glyph: 'paw', bg: 0x5a3a2a }, targeting: 'none', requiresUpgrade: 'tw_up_wildform', effect: { type: 'transform', into: 'tw_druid_bear', duration: 0, instant: true }, description: 'Transforms into a great bear: much tougher and stronger in melee, but unable to cast spells.' }),
  ab({ id: 'tw_humanform', name: 'Elven Form', hotkey: 'E', icon: { glyph: 'leaf', bg: 0x3a5a3a }, targeting: 'none', effect: { type: 'revert', instant: true }, description: 'Returns to elven form.' }),
  ab({ id: 'tw_moonbeam', name: 'Moonbeam', hotkey: 'Q', icon: { glyph: 'moon', bg: 0x4a4a8a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 6.5, mana: 60, cooldown: 9, effect: { type: 'damage', damage: 90, buff: 'revealed', duration: 8, fx: 'moonbeam' }, description: 'Calls a beam of moonlight on an enemy: 90 damage, and the target is revealed for 8 seconds.', ai: 'nuke' }),
  ab({ id: 'tw_cleanse', name: 'Cleanse', hotkey: 'W', icon: { glyph: 'drop', bg: 0x2a5a8a }, targeting: 'unit', filter: { enemy: true, ally: true, ground: true, air: true }, range: 6, mana: 50, cooldown: 6, effect: { type: 'dispel', radius: 0, summonDamage: 300 }, description: 'Removes all magic from a unit. Deals 300 damage to summoned enemies.' }),
  ab({ id: 'tw_moondust', name: 'Moon Dust', hotkey: 'Q', icon: { glyph: 'star', bg: 0x5a5a8a }, targeting: 'point', range: 5, aoe: 3, cooldown: 20, effect: { type: 'buff', targets: 'area', affects: 'enemies', radius: 3, buff: 'moondust', duration: 10, mods: { moveSpeedPct: -0.2 }, fx: 'dust' }, description: 'Scatters glittering dust: enemies are revealed and slowed by 20% for 10 seconds.', ai: 'debuff' }),
  ab({ id: 'tw_taunt', name: 'Taunting Roar', hotkey: 'Q', icon: { glyph: 'tree', bg: 0x4a5a2a }, targeting: 'none', aoe: 4, cooldown: 15, effect: { type: 'taunt', radius: 4, duration: 4, selfBuff: 'barkskin', selfMods: { armor: 5 } }, description: 'Forces nearby enemies to attack the Treant while its bark hardens (+5 armor).', ai: 'aoe' }),
  ab({ id: 'tw_barkhide', name: 'Barkhide', icon: { glyph: 'shield', bg: 0x4a3a2a }, targeting: 'passive', effect: { type: 'passive', mods: { rangedDamageTakenPct: -0.3 } }, description: 'Takes 30% less damage from ranged attacks.' }),
]);

regAbilities([
  // Moonbow Ranger
  ab({ id: 'tw_pinshot', name: 'Pinning Shot', hotkey: 'Q', icon: { glyph: 'bow', bg: 0x3a4a6a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 7.5, mana: 75, cooldown: 9, effect: { type: 'damage', damage: [70, 120, 170], buff: 'entangle', duration: [1.5, 2, 2.5], durationHero: 1, projectile: { kind: 'arrow', speed: 22, color: MOON } }, description: 'A moonsilver arrow pins the target in place.', levelText: ['70 damage, 1.5s', '120 damage, 2s', '170 damage, 2.5s'], ai: 'disable' }),
  ab({ id: 'tw_volley', name: 'Starfall Volley', hotkey: 'W', icon: { glyph: 'star', bg: 0x4a4a8a }, targeting: 'point', range: 8, aoe: 2.6, mana: 90, cooldown: 12, effect: { type: 'area', radius: 2.6, damage: [80, 130, 180], delay: 0.6, fx: 'arrowRain' }, description: 'Looses a volley of arrows that rains down on an area.', levelText: ['80 damage', '130 damage', '180 damage'], ai: 'aoe' }),
  ab({ id: 'tw_eagleeye', name: 'Eagle Eye', hotkey: 'E', icon: { glyph: 'eye', bg: 0x3a5a4a }, targeting: 'passive', effect: { type: 'passive', mods: { rangeBonus: [1, 1.5, 2], critChance: [0.1, 0.15, 0.2] } }, description: 'Increased range and a chance to land critical shots.', levelText: ['+1 range, 10% crit', '+1.5 range, 15% crit', '+2 range, 20% crit'] }),
  ab({ id: 'tw_huntwild', name: 'Hunt of the Wild', hotkey: 'R', icon: { glyph: 'moon', bg: 0x5a2a8a }, targeting: 'none', ultimate: true, maxLevel: 1, mana: 125, cooldown: 110, effect: { type: 'buff', targets: 'self', buff: 'huntFrenzy', duration: 15, mods: { attackSpeedPct: 0.8, damagePct: 0.25, moveSpeedPct: 0.2 }, instant: true }, description: 'For 15 seconds the Ranger attacks 80% faster and deals 25% more damage.', ai: 'ultimate' }),
  // Grove Keeper
  ab({ id: 'tw_thornburst', name: 'Thornburst', hotkey: 'Q', icon: { glyph: 'leaf', bg: 0x2a6a2a }, targeting: 'point', range: 7, aoe: 2.5, mana: 90, cooldown: 9, effect: { type: 'area', radius: 2.5, damage: [75, 125, 175], buff: 'slow', duration: 3, mods: { moveSpeedPct: -0.4 }, fx: 'thorns' }, description: 'Thorns burst from the ground, damaging and slowing enemies.', levelText: ['75 damage', '125 damage', '175 damage'], ai: 'aoe' }),
  ab({ id: 'tw_saplings', name: 'Awaken Saplings', hotkey: 'W', icon: { glyph: 'sapling', bg: 0x3a6a2a }, targeting: 'point', range: 6, mana: 110, cooldown: 25, effect: { type: 'summon', unit: 'tw_sapling', count: [2, 3, 4], duration: 35, at: 'target' }, description: 'Awakens young treants to fight for 35 seconds.', levelText: ['2 saplings', '3 saplings', '4 saplings'], ai: 'summon' }),
  ab({ id: 'tw_verdant', name: 'Verdant Aura', hotkey: 'E', icon: { glyph: 'aura', bg: 0x2a6a3a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_verdant', radius: 8, targets: 'allies', mods: { hpRegen: [1, 2, 3] } }, description: 'Nearby allies regenerate health faster.', levelText: ['+1 regen', '+2 regen', '+3 regen'] }),
  ab({ id: 'tw_wrath', name: 'Wrath of the Grove', hotkey: 'R', icon: { glyph: 'tree', bg: 0x1a4a1a }, targeting: 'point', ultimate: true, maxLevel: 1, range: 9, aoe: 6, mana: 200, cooldown: 150, effect: { type: 'zone', radius: 6, duration: 6, interval: 1, damage: 42, buff: 'entangle', fx: 'rootzone' }, description: 'Grasping roots seize and crush every enemy in a wide area for 6 seconds.', ai: 'ultimate' }),
  // Wildheart
  ab({ id: 'tw_maul', name: 'Maul', hotkey: 'Q', icon: { glyph: 'claw', bg: 0x6a3a1a }, targeting: 'unit', filter: { enemy: true, ground: true }, range: 1.5, mana: 75, cooldown: 8, effect: { type: 'damage', damage: [80, 140, 200], buff: 'slow', duration: 3, mods: { moveSpeedPct: -0.4 }, fx: 'claw' }, description: 'Savagely mauls an enemy, dealing damage and slowing it.', levelText: ['80 damage', '140 damage', '200 damage'], ai: 'nuke' }),
  ab({ id: 'tw_feralroar', name: 'Feral Roar', hotkey: 'W', icon: { glyph: 'paw', bg: 0x7a4a1a }, targeting: 'none', aoe: 7, mana: 90, cooldown: 18, effect: { type: 'buff', targets: 'aroundSelf', affects: 'allies', radius: 7, buff: 'rally', duration: 12, mods: { damagePct: [0.15, 0.25, 0.35] }, fx: 'roar' }, description: 'A primal roar: nearby allies deal more damage for 12 seconds.', levelText: ['+15% damage', '+25% damage', '+35% damage'], ai: 'buff' }),
  ab({ id: 'tw_thickhide', name: 'Thick Hide', hotkey: 'E', icon: { glyph: 'shield', bg: 0x5a4a2a }, targeting: 'passive', effect: { type: 'passive', mods: { armor: [2, 4, 6], hpRegen: [1, 2, 3] } }, description: 'Increases armor and health regeneration.', levelText: ['+2 armor', '+4 armor', '+6 armor'] }),
  ab({ id: 'tw_primalform', name: 'Primal Form', hotkey: 'R', icon: { glyph: 'paw', bg: 0x8a3a1a }, targeting: 'none', ultimate: true, maxLevel: 1, mana: 150, cooldown: 120, effect: { type: 'buff', targets: 'self', buff: 'primalForm', duration: 40, mods: { maxHp: 700, damageFlat: 25, armor: 3, attackSpeedPct: 0.15 }, instant: true }, description: 'Becomes a towering primal beast for 40 seconds.', ai: 'ultimate' }),
]);

regUpgrades([
  tieredUpgrade('tw_up_melee', 'Moonsteel Blades', F, { glyph: 'sword', bg: 0x4a4a6a }, ['tw_sentinel', 'tw_stag', 'tw_druid_bear', 'tw_treant'], { damagePct: 0.1 }, 'Melee units deal 10% more damage per level.'),
  tieredUpgrade('tw_up_ranged', 'Starwood Arrows', F, { glyph: 'bow', bg: 0x3a4a3a }, ['tw_archer', 'tw_hurler', 'tw_moth', 'tw_drake', 'tw_sylph'], { damagePct: 0.1 }, 'Ranged units deal 10% more damage per level.'),
  tieredUpgrade('tw_up_bark', 'Barkweave Armor', F, { glyph: 'helm', bg: 0x4a3a2a }, ['tag:melee', 'tag:ranged', 'tag:caster', 'tag:siege', 'tw_moth', 'tw_drake'], { armor: 2 }, 'All Warden units gain 2 armor per level.'),
  tieredUpgrade('tw_up_spirits', 'Spirit Harmony', F, { glyph: 'leaf', bg: 0x3a6a3a }, ['tw_spirit'], { lumberCarry: 4 }, 'Forest Spirits gather 2 more lumber per cycle per level.', [
    { gold: 100, lumber: 0, time: 40 },
    { gold: 150, lumber: 0, time: 50, requires: ['tier2'] },
  ]),
  singleUpgrade('tw_up_moonguard', 'Moonguard Training', F, { glyph: 'shield', bg: 0x3a3a6a }, ['tw_sentinel'], { gold: 100, lumber: 125 }, 45, 'Grove Sentinels learn to evade attacks.', { unlocksAbility: 'tw_moonguard' }),
  singleUpgrade('tw_up_wildform', 'Wild Form', F, { glyph: 'paw', bg: 0x5a3a2a }, ['tw_druid'], { gold: 150, lumber: 150 }, 55, 'Moon Druids can take the form of a great bear.', { unlocksAbility: 'tw_wildform', requires: ['tier3'] }),
  singleUpgrade('tw_up_druid', 'Druidic Lore', F, { glyph: 'book', bg: 0x2a5a3a }, ['tw_druid', 'tw_sylph'], { gold: 100, lumber: 100 }, 50, 'Moon Druids and Sylphs gain 100 mana.', { mods: { maxMana: 100, manaRegen: 0.15 } }),
  singleUpgrade('tw_up_hurler', 'Splitting Seeds', F, { glyph: 'leaf', bg: 0x4a5a2a }, ['tw_hurler'], { gold: 100, lumber: 100 }, 40, 'Thornhurlers deal 25% more damage.', { mods: { damagePct: 0.25 }, requires: ['tier2'] }),
]);

regDefs([
  unit({
    id: 'tw_spirit', name: 'Forest Spirit', faction: F, description: 'A glowing spirit of the wood. Gathers gold from bound mines and lumber without felling trees. Some structures absorb the spirit that plants them.',
    hp: 140, armor: 0, cost: { gold: 60, lumber: 0, food: 1 }, buildTime: 14, speed: 2.5, radius: 0.27, level: 1, sight: [8, 7],
    tags: { worker: true }, harvest: { gold: 'spirit', lumber: 'spirit' }, hotkey: 'S', priority: 1,
    model: { kind: 'spirit', variant: 'wisp', color: 0xbfe8ff, glow: 0x9ad8ff, scale: 0.8 },
  }),
  unit({
    id: 'tw_sentinel', name: 'Grove Sentinel', faction: F, description: 'An agile elven glaive-dancer who guards the borders of the forest.',
    hp: 480, armor: 2, armorType: 'medium', cost: { gold: 140, lumber: 0, food: 2 }, buildTime: 20, speed: 2.7, radius: 0.36, level: 2,
    weapon: melee([13, 16], 1.35), abilities: ['tw_moonguard'], tags: { organic: true, melee: true }, hotkey: 'S', priority: 4,
    model: { kind: 'humanoid', skin: SKIN, body: 0x3a3a5a, armor: 0x8a8ab0, helm: 'leafhelm', helmColor: 0x6a8ab0, weapon: 'glaive', ears: true, team: 'cape', cape: true },
  }),
  unit({
    id: 'tw_archer', name: 'Archer', faction: F, description: 'A deadly elven archer. At night she can hide in plain sight while standing still.',
    hp: 300, armor: 0, armorType: 'medium', cost: { gold: 130, lumber: 10, food: 2 }, buildTime: 20, speed: 2.7, radius: 0.34, level: 2,
    weapon: missile([17, 20], 5.5, 'pierce', ARROW, 1.5), abilities: ['tw_nightveil'], tags: { organic: true, ranged: true }, hotkey: 'A', priority: 3,
    model: { kind: 'humanoid', skin: SKIN, body: 0x2a4a3a, helm: 'hood', helmColor: 0x2a4a3a, weapon: 'bow', ears: true, team: 'cape', cape: true, hair: 0xd0e0ff },
  }),
  unit({
    id: 'tw_stag', name: 'Stag Rider', faction: F, description: 'A swift rider on a great silver stag that bounds at enemies with its antlers.',
    hp: 640, armor: 2, armorType: 'medium', cost: { gold: 210, lumber: 40, food: 3 }, buildTime: 30, speed: 3.5, radius: 0.55, level: 4, requires: ['tier2'],
    weapon: melee([22, 26], 1.5), abilities: ['tw_trample'], tags: { organic: true, melee: true, cavalry: true }, hotkey: 'T', priority: 5,
    model: { kind: 'rider', mount: 'stag', mountColor: 0xc8c8d8, skin: SKIN, body: 0x3a3a5a, armor: 0x8a8ab0, helm: 'leafhelm', helmColor: 0x6a8ab0, weapon: 'spear', ears: true, team: 'barding' },
  }),
  unit({
    id: 'tw_hurler', name: 'Thornhurler', faction: F, description: 'A walking bramble-ancient that flings explosive seed pods at buildings and armies.',
    hp: 500, armor: 2, armorType: 'heavy', cost: { gold: 210, lumber: 60, food: 3 }, buildTime: 36, speed: 2.0, radius: 0.6, level: 3, requires: ['tier2'],
    weapon: missile([70, 86], 8.5, 'siege', { ...BOULDER, kind: 'seed' }, 3.3, { targets: { ground: true, structure: true }, splash: { radius: 1.5, factor: 0.5 }, damagePoint: 0.6 }), tags: { organic: true, siege: true }, hotkey: 'H', priority: 3,
    model: { kind: 'treant', variant: 'hurler', bark: BARK, leaves: 0x6a4a8a, scale: 0.95 },
  }),
  unit({
    id: 'tw_druid', name: 'Moon Druid', faction: F, description: 'A druid who renews the wounded and binds foes in thorns. Can learn to take the form of a great bear.',
    hp: 380, mana: 250, armor: 0, armorType: 'unarmored', cost: { gold: 160, lumber: 40, food: 2 }, buildTime: 30, speed: 2.5, radius: 0.36, level: 3, requires: ['tier2'],
    weapon: missile([10, 12], 5, 'magic', orb(0x9affc0), 1.9), abilities: ['tw_renewal', 'tw_thorns', 'tw_wildform'], tags: { organic: true, caster: true }, hotkey: 'D', priority: 5,
    model: { kind: 'humanoid', skin: SKIN, body: 0x3a5a3a, robe: true, helm: 'antlers', helmColor: 0x8a6a4a, weapon: 'staff', orb: 0x9affc0, ears: true, team: 'sash' },
  }),
  unit({
    id: 'tw_druid_bear', name: 'Moon Druid (Bear)', faction: F, description: 'A druid in the shape of a great bear.',
    hp: 860, armor: 3, armorType: 'heavy', cost: { gold: 160, lumber: 40, food: 2 }, buildTime: 30, speed: 2.6, radius: 0.55, level: 4,
    weapon: melee([28, 34], 1.5), abilities: ['tw_humanform'], tags: { organic: true, melee: true }, priority: 5,
    model: { kind: 'beast', head: 'bear', color: 0x6a5a4a, scale: 1.3, glow: VIOLET },
  }),
  unit({
    id: 'tw_sylph', name: 'Sylph', faction: F, description: 'A graceful wind spirit who scorches enemies with moonbeams and cleanses magic.',
    hp: 360, mana: 220, armor: 0, armorType: 'unarmored', cost: { gold: 150, lumber: 30, food: 2 }, buildTime: 28, speed: 2.9, radius: 0.34, level: 3, requires: ['tier2'],
    weapon: missile([12, 15], 5, 'magic', orb(MOON), 1.7), abilities: ['tw_moonbeam', 'tw_cleanse'], tags: { organic: true, caster: true }, hotkey: 'Y', priority: 5,
    model: { kind: 'spirit', variant: 'sylph', color: 0xcfe3ff, glow: VIOLET, scale: 1.0 },
  }),
  unit({
    id: 'tw_moth', name: 'Lunar Moth', faction: F, description: 'A giant silver moth ridden by a lancer. Fast and agile in the air.',
    hp: 400, armor: 1, armorType: 'light', cost: { gold: 165, lumber: 40, food: 2 }, buildTime: 26, speed: 3.5, radius: 0.5, level: 3, air: true, flyHeight: 2.8, requires: ['tier2'],
    weapon: missile([15, 18], 4, 'magic', orb(MOON, 14), 1.45), abilities: ['tw_moondust'], tags: { organic: true }, hotkey: 'M', priority: 4,
    model: { kind: 'flyer', variant: 'moth', color: 0xd8d8f0, wingColor: 0xb8b0e8, glow: VIOLET, rider: true, riderColor: 0x3a3a5a },
  }),
  unit({
    id: 'tw_treant', name: 'Ancient Treant', faction: F, description: 'A colossal walking tree. Shrugs off missiles and forces enemies to strike at it.',
    hp: 1500, armor: 3, armorType: 'heavy', cost: { gold: 350, lumber: 100, food: 6 }, buildTime: 50, speed: 1.95, radius: 0.85, level: 7, requires: ['tier3'],
    weapon: melee([30, 36], 2.0, { damagePoint: 0.6 }), abilities: ['tw_taunt', 'tw_barkhide'], tags: { organic: true, melee: true }, hotkey: 'E', priority: 7,
    model: { kind: 'treant', bark: BARK, leaves: LEAF, glow: VIOLET, scale: 1.5 },
  }),
  unit({
    id: 'tw_drake', name: 'Twilight Drake', faction: F, description: 'A great violet dragon that breathes arcane fire on its enemies.',
    hp: 1100, armor: 2, armorType: 'light', cost: { gold: 330, lumber: 100, food: 5 }, buildTime: 48, speed: 2.8, radius: 0.8, level: 6, air: true, flyHeight: 3.3, requires: ['tier3'],
    weapon: missile([50, 60], 4.5, 'magic', orb(VIOLET, 12, 1.5), 2.0, { splash: { radius: 1.4, factor: 0.5 } }), tags: { organic: true }, hotkey: 'D', priority: 7,
    model: { kind: 'flyer', variant: 'drake', color: 0x5a3a8a, wingColor: 0x3a2a6a, glow: VIOLET, scale: 1.3 },
  }),
  // summons
  unit({ id: 'tw_sapling', name: 'Sapling', faction: F, description: 'A young treant.', hp: 360, armor: 2, armorType: 'heavy', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 2.5, radius: 0.4, level: 2, weapon: melee([15, 18], 1.5), tags: { summoned: true, melee: true }, model: { kind: 'treant', bark: BARK, leaves: 0x5a9a3a, scale: 0.7 } }),
  // walking ancients
  unit({ id: 'tw_wartree_walk', name: 'Living War Tree (uprooted)', faction: F, description: 'An uprooted ancient.', hp: 1150, armor: 2, armorType: 'heavy', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 1.6, radius: 1.0, level: 5, weapon: melee([40, 50], 2.0, { type: 'siege' }), abilities: ['tw_root'], rootTo: 'tw_wartree', tags: { organic: true, melee: true, ancient: true }, model: { kind: 'treant', variant: 'ancient', bark: BARK, leaves: 0x3a6a3a, glow: VIOLET, scale: 1.9 } }),
  unit({ id: 'tw_wisdom_walk', name: 'Tree of Wisdom (uprooted)', faction: F, description: 'An uprooted ancient.', hp: 900, armor: 2, armorType: 'heavy', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 1.6, radius: 0.9, level: 5, weapon: melee([30, 38], 2.0, { type: 'siege' }), abilities: ['tw_root'], rootTo: 'tw_wisdom', tags: { organic: true, melee: true, ancient: true }, model: { kind: 'treant', variant: 'ancient', bark: 0x4a4a5a, leaves: 0x4a3a7a, glow: VIOLET, scale: 1.7 } }),
  unit({ id: 'tw_winds_walk', name: 'Tree of Winds (uprooted)', faction: F, description: 'An uprooted ancient.', hp: 900, armor: 2, armorType: 'heavy', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 1.6, radius: 0.9, level: 5, weapon: melee([30, 38], 2.0, { type: 'siege' }), abilities: ['tw_root'], rootTo: 'tw_winds', tags: { organic: true, melee: true, ancient: true }, model: { kind: 'treant', variant: 'ancient', bark: 0x6a5a4a, leaves: 0x6a8ab0, glow: VIOLET, scale: 1.7 } }),
  unit({ id: 'tw_guard_walk', name: 'Thornguard (uprooted)', faction: F, description: 'An uprooted ancient.', hp: 650, armor: 3, armorType: 'heavy', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 1.6, radius: 0.75, level: 4, weapon: melee([34, 42], 1.8, { type: 'siege' }), abilities: ['tw_root'], rootTo: 'tw_guard', tags: { organic: true, melee: true, ancient: true }, model: { kind: 'treant', variant: 'ancient', bark: BARK, leaves: 0x4a6a2a, glow: VIOLET, scale: 1.35 } }),
]);

regDefs([
  heroDef({
    id: 'tw_h_ranger', name: 'Moonbow Ranger', faction: F, description: 'A peerless archer who hunts by moonlight.',
    armor: 2, speed: 2.85,
    weapon: { damage: [14, 21], cooldown: 1.9, range: 6, damagePoint: 0.3, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: { kind: 'arrow', speed: 22, arc: 0.1, color: MOON } },
    hero: { primary: 'agi', str: 17, agi: 22, int: 15, strGain: 1.9, agiGain: 2.6, intGain: 1.7, abilities: ['tw_pinshot', 'tw_volley', 'tw_eagleeye', 'tw_huntwild'], title: 'Archer Hero' },
    model: { kind: 'humanoid', scale: 1.1, skin: SKIN, body: 0x2a3a5a, armor: 0xb0b0d0, helm: 'leafhelm', helmColor: 0xb0b0d0, weapon: 'bow', ears: true, cape: true, hair: 0xe0e8ff },
    hotkey: 'R',
  }),
  heroDef({
    id: 'tw_h_keeper', name: 'Grove Keeper', faction: F, description: 'An ancient druid who speaks for the trees and awakens them to war.',
    armor: 1, speed: 2.65,
    weapon: { damage: [13, 20], cooldown: 2.1, range: 5.5, damagePoint: 0.35, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: orb(0x9affc0, 13, 1.2) },
    hero: { primary: 'int', str: 16, agi: 15, int: 21, strGain: 1.8, agiGain: 1.5, intGain: 3.0, abilities: ['tw_thornburst', 'tw_saplings', 'tw_verdant', 'tw_wrath'], title: 'Nature Caster Hero' },
    model: { kind: 'humanoid', scale: 1.2, skin: SKIN, body: 0x3a5a2a, robe: true, helm: 'antlers', helmColor: 0x8a6a4a, weapon: 'staff', orb: 0x9affc0, ears: true, beard: 0x6a8a5a, cape: true },
    hotkey: 'K',
  }),
  heroDef({
    id: 'tw_h_wildheart', name: 'Wildheart', faction: F, description: 'A shapeshifting champion who fights with claw and fang.',
    armor: 3, speed: 2.75,
    weapon: { damage: [14, 24], cooldown: 2.15, range: 0.35, damagePoint: 0.4, type: 'hero', targets: { ground: true, structure: true } },
    hero: { primary: 'str', str: 24, agi: 15, int: 14, strGain: 2.9, agiGain: 1.6, intGain: 1.5, abilities: ['tw_maul', 'tw_feralroar', 'tw_thickhide', 'tw_primalform'], title: 'Shapeshifter Hero' },
    model: { kind: 'humanoid', scale: 1.25, bulk: 1.4, skin: SKIN, body: 0x5a4a3a, armor: 0x8a6a4a, helm: 'wolfhood', helmColor: 0x7a6a5a, weapon: 'claws', ears: true, cape: true },
    hotkey: 'W',
  }),
]);

regDefs([
  grown({
    id: 'tw_heart', name: 'Heart of the Forest', faction: F, description: 'The living hall of the Wardens. Calls Forest Spirits and binds a nearby gold mine with its roots.',
    hp: 1800, armor: 4, size: 5, cost: { gold: 340, lumber: 185 }, buildTime: 110, mainHall: true, hallTier: 1, foodProvided: 12, dropoff: ['gold', 'lumber'],
    trains: ['tw_spirit'], upgradesTo: 'tw_grove', abilities: ['tw_bindmine'], hotkey: 'H', sight: [10, 8], tags: { ancient: true },
    model: { kind: 'building', faction: F, variant: 'hall' },
  }),
  grown({
    id: 'tw_grove', name: 'Heart of the Grove', faction: F, description: 'Unlocks tier two.', hp: 2200, armor: 4, size: 5, cost: { gold: 320, lumber: 200 }, buildTime: 120, mainHall: true, hallTier: 2, foodProvided: 12,
    dropoff: ['gold', 'lumber'], trains: ['tw_spirit'], upgradesTo: 'tw_oak', abilities: ['tw_bindmine'], buildable: false, requires: ['tw_wartree'], sight: [11, 8], tags: { ancient: true },
    model: { kind: 'building', faction: F, variant: 'keep' },
  }),
  grown({
    id: 'tw_oak', name: 'Ancient Oak', faction: F, description: 'Unlocks tier three.', hp: 2700, armor: 5, size: 5, cost: { gold: 350, lumber: 220 }, buildTime: 135, mainHall: true, hallTier: 3, foodProvided: 12,
    dropoff: ['gold', 'lumber'], trains: ['tw_spirit'], abilities: ['tw_bindmine'], buildable: false, requires: ['tw_altar'], sight: [12, 9], tags: { ancient: true },
    model: { kind: 'building', faction: F, variant: 'citadel' },
  }),
  grown({
    id: 'tw_pool', name: 'Glimmer Pool', faction: F, description: 'Provides 9 food. Stores moonlight that slowly restores the health and mana of nearby allies.',
    hp: 600, armor: 2, size: 3, cost: { gold: 180, lumber: 40 }, buildTime: 45, foodProvided: 9, fountain: { hp: 6, mana: 3, radius: 5, pool: 300 }, hotkey: 'P',
    model: { kind: 'building', faction: F, variant: 'farm' },
  }),
  ancient({
    id: 'tw_wartree', name: 'Living War Tree', faction: F, description: 'Trains Grove Sentinels, Archers, Stag Riders, Thornhurlers and Ancient Treants. Can uproot and walk.',
    hp: 1150, armor: 2, size: 4, cost: { gold: 150, lumber: 60 }, buildTime: 60, trains: ['tw_sentinel', 'tw_archer', 'tw_stag', 'tw_hurler', 'tw_treant'], abilities: ['tw_uproot'], uprootTo: 'tw_wartree_walk', hotkey: 'W',
    model: { kind: 'building', faction: F, variant: 'barracks' },
  }),
  grown({
    id: 'tw_lodge', name: "Hunter's Lodge", faction: F, description: 'Researches weapon, armor and spirit improvements.', hp: 1000, size: 3, cost: { gold: 210, lumber: 100 }, buildTime: 50,
    researches: ['tw_up_melee', 'tw_up_ranged', 'tw_up_bark', 'tw_up_spirits', 'tw_up_moonguard'], hotkey: 'L', model: { kind: 'building', faction: F, variant: 'smith' },
  }),
  ancient({
    id: 'tw_altar', name: 'Star Altar', faction: F, description: 'Summons and revives heroes.', hp: 950, size: 3, cost: { gold: 180, lumber: 50 }, buildTime: 55, isAltar: true,
    trains: ['tw_h_ranger', 'tw_h_keeper', 'tw_h_wildheart'], hotkey: 'A', model: { kind: 'building', faction: F, variant: 'altar' },
  }),
  ancient({
    id: 'tw_wisdom', name: 'Tree of Wisdom', faction: F, description: 'Trains Moon Druids and Sylphs. Can uproot and walk.', hp: 900, size: 4, cost: { gold: 155, lumber: 145 }, buildTime: 60, requires: ['tier2'],
    trains: ['tw_druid', 'tw_sylph'], researches: ['tw_up_druid', 'tw_up_wildform'], abilities: ['tw_uproot'], uprootTo: 'tw_wisdom_walk', advanced: true, hotkey: 'D', model: { kind: 'building', faction: F, variant: 'academy' },
  }),
  ancient({
    id: 'tw_winds', name: 'Tree of Winds', faction: F, description: 'Trains Lunar Moths. Can uproot and walk.', hp: 900, size: 4, cost: { gold: 150, lumber: 140 }, buildTime: 60, requires: ['tier2'],
    trains: ['tw_moth'], researches: ['tw_up_hurler'], abilities: ['tw_uproot'], uprootTo: 'tw_winds_walk', advanced: true, hotkey: 'N', model: { kind: 'building', faction: F, variant: 'workshop' },
  }),
  ancient({
    id: 'tw_hollow', name: 'Drake Hollow', faction: F, description: 'Trains Twilight Drakes.', hp: 1100, size: 4, cost: { gold: 140, lumber: 190 }, buildTime: 65, requires: ['tier3'],
    trains: ['tw_drake'], advanced: true, hotkey: 'K', model: { kind: 'building', faction: F, variant: 'aerie' },
  }),
  ancient({
    id: 'tw_cache', name: 'Wonder Cache', faction: F, description: 'Sells potions, scrolls and charms to nearby heroes.', hp: 650, size: 3, cost: { gold: 90, lumber: 30 }, buildTime: 50,
    shopItems: ['item_heal', 'item_mana', 'item_homeward', 'item_dust', 'item_ward', 'item_mending', 'item_boots'], advanced: true, hotkey: 'C', model: { kind: 'building', faction: F, variant: 'shop' },
  }),
  ancient({
    id: 'tw_guard', name: 'Thornguard', faction: F, description: 'A watchful ancient that hurls thorn-spikes at enemies. Can uproot and walk.', hp: 650, armor: 4, size: 2, cost: { gold: 135, lumber: 80 }, buildTime: 40, requires: ['tw_wartree'],
    weapon: missile([22, 27], 7, 'pierce', { kind: 'seed', speed: 16, arc: 0.2 }, 1.1), abilities: ['tw_uproot'], uprootTo: 'tw_guard_walk', sight: [12, 10], hotkey: 'T', tags: { ancient: true, detector: true },
    model: { kind: 'building', faction: F, variant: 'tower' },
  }),
]);

regFaction({
  id: F,
  name: 'Twilight Wardens',
  adjective: 'Warden',
  description: 'An ancient forest civilization of elves, druids and nature spirits. Mobile living buildings, night concealment and potent restoration.',
  color: 0x9a6ae0,
  worker: 'tw_spirit',
  hall: 'tw_heart',
  startUnits: [{ id: 'tw_spirit', count: 5 }],
  heroes: ['tw_h_ranger', 'tw_h_keeper', 'tw_h_wildheart'],
  altar: 'tw_altar',
  farm: 'tw_pool',
  shop: 'tw_cache',
  tower: 'tw_guard',
  barracks: 'tw_wartree',
  traits: ['Forest Spirits harvest lumber without felling trees', 'Ancients absorb their builder and can uproot to walk', 'Units regenerate faster at night; Archers hide at night'],
});
