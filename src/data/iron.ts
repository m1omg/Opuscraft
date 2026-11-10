import { BOULDER, SPEAR, ab, building, heroDef, melee, missile, orb, singleUpgrade, tieredUpgrade, unit } from './helpers';
import { regAbilities, regDefs, regFaction, regUpgrades } from './registry';
import type { EntityDef } from './types';

const F = 'iron' as const;
const HIDE = 0x8a6a4a;
const IRON = 0x5a5a60;
const RED = 0xa8322b;
const SKIN = 0x6a9a4a;

const bld = (p: Parameters<typeof building>[0]): EntityDef => building({ buildMode: 'inside', ...p });

regAbilities([
  ab({ id: 'ir_unload', name: 'Unload', hotkey: 'U', icon: { glyph: 'house', bg: 0x6a4a2a }, targeting: 'none', building: true, effect: { type: 'unload', instant: true }, description: 'Release all Clanhands sheltering in the Longhouse.' }),
  ab({ id: 'ir_rage', name: 'Blood Rage', icon: { glyph: 'fist', bg: 0x8a1a1a }, targeting: 'passive', requiresUpgrade: 'ir_up_bloodrage', effect: { type: 'lowHpBuff', threshold: 0.5, buff: 'frenzy', mods: { attackSpeedPct: 0.35, damagePct: 0.1 } }, description: 'Below half health, attacks 35% faster and deals 10% more damage.' }),
  ab({ id: 'ir_bola', name: 'Bola', hotkey: 'Q', icon: { glyph: 'chain', bg: 0x6a4a2a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 4.5, cooldown: 12, autocast: true, requiresUpgrade: 'ir_up_bolas', effect: { type: 'damage', damage: 20, buff: 'slow', duration: 6, durationHero: 3, mods: { moveSpeedPct: -0.7 } }, description: 'Hurls a weighted bola that slows the target by 70%.', ai: 'disable' }),
  ab({ id: 'ir_spiritmend', name: 'Spirit Mend', hotkey: 'Q', icon: { glyph: 'leaf', bg: 0x2a7a4a }, targeting: 'unit', filter: { ally: true, ground: true, air: true, organic: true }, range: 5, mana: 40, cooldown: 3, autocast: true, autocastDefault: true, effect: { type: 'heal', amount: 20, buff: 'spiritmend', duration: 10, hot: 12 }, description: 'Ancestral spirits mend an ally: heals 20 instantly and 12 per second for 10 seconds.', ai: 'heal' }),
  ab({ id: 'ir_healward', name: 'Ancestor Ward', hotkey: 'W', icon: { glyph: 'totem', bg: 0x3a6a3a }, targeting: 'point', range: 5, mana: 100, cooldown: 20, requiresUpgrade: 'ir_up_rites', effect: { type: 'summon', unit: 'ir_healward_u', count: 1, duration: 25, at: 'target' }, description: 'Places a totem that heals nearby allies for 25 seconds.', ai: 'summon' }),
  ab({ id: 'ir_lightninglash', name: 'Lightning Lash', hotkey: 'Q', icon: { glyph: 'bolt', bg: 0x2a4a8a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 6, mana: 70, cooldown: 6, effect: { type: 'damage', damage: 105, purge: true, summonDamage: 150, fx: 'lightningStrike' }, description: 'Strikes an enemy with lightning for 105 damage and strips its enchantments.', ai: 'nuke' }),
  ab({ id: 'ir_warpaint', name: 'War Paint', hotkey: 'W', icon: { glyph: 'mask', bg: 0x8a2a1a }, targeting: 'unit', filter: { ally: true, ground: true, air: true, organic: true }, range: 5, mana: 45, cooldown: 2, autocast: true, autocastDefault: true, requiresUpgrade: 'ir_up_seer', effect: { type: 'buff', buff: 'warpaint', duration: 40, mods: { damagePct: 0.2, attackSpeedPct: 0.15 } }, description: 'Paints an ally with sacred war marks: +20% damage and +15% attack speed for 40 seconds.', ai: 'buff' }),
  ab({ id: 'ir_drums', name: 'War Drums', icon: { glyph: 'drum', bg: 0x8a4a1a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_drums', radius: 8, targets: 'allies', mods: { damagePct: 0.15 } }, description: 'The pounding drums make nearby allies deal 15% more damage.' }),
  ab({ id: 'ir_venom', name: 'Envenomed Spears', icon: { glyph: 'drop', bg: 0x3a7a2a }, targeting: 'passive', requiresUpgrade: 'ir_up_venom', effect: { type: 'onHit', buff: 'poison', duration: 6, dot: 6, mods: { moveSpeedPct: -0.15 } }, description: 'Attacks poison the target for 6 damage per second and slow it.' }),
  ab({ id: 'ir_gore', name: 'Torch Bearers', icon: { glyph: 'flame', bg: 0x8a4a1a }, targeting: 'passive', effect: { type: 'passive' }, description: 'Tusk Riders deal 40% bonus damage to buildings.' }),
]);

regAbilities([
  // Warlord
  ab({ id: 'ir_groundslam', name: 'Ground Slam', hotkey: 'Q', icon: { glyph: 'fist', bg: 0x6a4a2a }, targeting: 'none', aoe: 2.8, mana: 90, cooldown: 7, effect: { type: 'area', center: 'self', radius: 2.8, damage: [60, 105, 150], buff: 'slow', duration: 3, mods: { moveSpeedPct: -0.5, attackSpeedPct: -0.3 }, fx: 'quake' }, description: 'Slams the earth, damaging and slowing nearby enemies.', levelText: ['60 damage', '105 damage', '150 damage'], ai: 'aoe' }),
  ab({ id: 'ir_bellow', name: 'Bellow', hotkey: 'W', icon: { glyph: 'mask', bg: 0x7a2a1a }, targeting: 'none', aoe: 6, mana: 75, cooldown: 15, effect: { type: 'buff', targets: 'aroundSelf', affects: 'enemies', radius: 6, buff: 'bellow', duration: 10, mods: { damagePct: [-0.2, -0.3, -0.4] }, fx: 'roar' }, description: 'A terrifying roar makes nearby enemies deal less damage for 10 seconds.', levelText: ['-20% damage', '-30% damage', '-40% damage'], ai: 'debuff' }),
  ab({ id: 'ir_hunger', name: 'Battle Hunger', hotkey: 'E', icon: { glyph: 'fang', bg: 0x8a1a1a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_hunger', radius: 8, targets: 'allies', meleeOnly: true, mods: { lifesteal: [0.08, 0.14, 0.2] } }, description: 'Nearby melee allies heal for a portion of the damage they deal.', levelText: ['8% life steal', '14% life steal', '20% life steal'] }),
  ab({ id: 'ir_earthshatter', name: 'Earthshatter', hotkey: 'R', icon: { glyph: 'meteor', bg: 0x6a3a1a }, targeting: 'point', ultimate: true, maxLevel: 1, range: 12, mana: 160, cooldown: 120, effect: { type: 'line', length: 13, width: 1.6, damage: 230, stun: 2, stunHero: 1, fx: 'fissure' }, description: 'Splits the ground in a long line, dealing 230 damage and stunning all enemies in it.', ai: 'ultimate' }),
  // Beastcaller
  ab({ id: 'ir_huntingspear', name: 'Hunting Spear', hotkey: 'Q', icon: { glyph: 'spear', bg: 0x6a4a2a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 7, mana: 75, cooldown: 8, effect: { type: 'damage', damage: [80, 140, 200], buff: 'marked', duration: 8, mods: { damageTakenPct: [0.15, 0.2, 0.25] }, projectile: { kind: 'spear', speed: 18 } }, description: 'Hurls a barbed spear. The target takes increased damage from all sources for 8 seconds.', levelText: ['80 damage, +15% damage taken', '140 damage, +20%', '200 damage, +25%'], ai: 'nuke' }),
  ab({ id: 'ir_boars', name: 'Call the Boars', hotkey: 'W', icon: { glyph: 'beast', bg: 0x5a3a2a }, targeting: 'none', mana: 110, cooldown: 30, effect: { type: 'summon', unit: ['ir_boar1', 'ir_boar2', 'ir_boar3'], count: 2, duration: 45 }, description: 'Summons two ferocious war boars for 45 seconds.', levelText: ['Boars', 'Tusked Boars', 'Ironback Boars'], ai: 'summon' }),
  ab({ id: 'ir_predator', name: "Predator's Instinct", hotkey: 'E', icon: { glyph: 'claw', bg: 0x7a3a1a }, targeting: 'passive', effect: { type: 'passive', mods: { critChance: [0.12, 0.18, 0.24], critMult: [2, 2.25, 2.5] } }, description: 'A chance to strike for heavy critical damage.', levelText: ['12% chance, x2', '18% chance, x2.25', '24% chance, x2.5'] }),
  ab({ id: 'ir_howl', name: 'Terrifying Howl', hotkey: 'R', icon: { glyph: 'fang', bg: 0x8a2a2a }, targeting: 'none', ultimate: true, maxLevel: 1, aoe: 8, mana: 150, cooldown: 120, effect: { type: 'fear', radius: 8, duration: 3.5, durationHero: 1.5, allyBuff: 'haste', allyDuration: 8, allyMods: { moveSpeedPct: 0.3, attackSpeedPct: 0.2 }, fx: 'roar' }, description: 'Enemies nearby flee in terror while allies surge forward with haste.', ai: 'ultimate' }),
  // Storm Speaker
  ab({ id: 'ir_forked', name: 'Forked Lightning', hotkey: 'Q', icon: { glyph: 'bolt', bg: 0x2a4a9a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 7, mana: 100, cooldown: 9, effect: { type: 'chain', damage: [85, 130, 175], bounces: [3, 4, 5], falloff: 0.85, bounceRange: 5, fx: 'lightning' }, description: 'Lightning arcs from enemy to enemy.', levelText: ['85 damage, 4 targets', '130 damage, 5 targets', '175 damage, 6 targets'], ai: 'nuke' }),
  ab({ id: 'ir_spirittotem', name: 'Totem of Spirits', hotkey: 'W', icon: { glyph: 'totem', bg: 0x2a6a4a }, targeting: 'point', range: 6, mana: 90, cooldown: 20, effect: { type: 'summon', unit: ['ir_htotem1', 'ir_htotem2', 'ir_htotem3'], count: 1, duration: 25, at: 'target' }, description: 'Raises a totem that heals nearby allies.', levelText: ['8 health per second', '14 health per second', '20 health per second'], ai: 'summon' }),
  ab({ id: 'ir_thunderstrikes', name: 'Thunderclap Strikes', hotkey: 'E', icon: { glyph: 'bolt', bg: 0x4a4a8a }, targeting: 'passive', effect: { type: 'passive', mods: { bashChance: [0.12, 0.18, 0.24], bashDuration: 0.6, bashDamage: [20, 30, 40] } }, description: 'Attacks have a chance to strike with thunder, stunning briefly and dealing bonus damage.', levelText: ['12% chance, +20 damage', '18% chance, +30 damage', '24% chance, +40 damage'] }),
  ab({ id: 'ir_tempest', name: 'Tempest', hotkey: 'R', icon: { glyph: 'cloud', bg: 0x3a3a6a }, targeting: 'point', ultimate: true, maxLevel: 1, range: 9, aoe: 5, mana: 200, cooldown: 140, effect: { type: 'zone', radius: 5, duration: 8, interval: 0.5, damage: 42, buff: 'slow', mods: { moveSpeedPct: -0.25 }, fx: 'storm' }, description: 'A raging storm lashes an area with lightning and wind for 8 seconds.', ai: 'ultimate' }),
]);

regUpgrades([
  tieredUpgrade('ir_up_melee', 'Iron Blades', F, { glyph: 'axe', bg: 0x5a5a60 }, ['ir_warrior', 'ir_tusk', 'ir_brute', 'ir_mammoth'], { damagePct: 0.1 }, 'Melee units deal 10% more damage per level.'),
  tieredUpgrade('ir_up_ranged', 'Barbed Spears', F, { glyph: 'spear', bg: 0x6a4a2a }, ['ir_spearhunter', 'ir_hurler', 'ir_vulture'], { damagePct: 0.1 }, 'Ranged units deal 10% more damage per level.'),
  tieredUpgrade('ir_up_hides', 'Thick Hides', F, { glyph: 'helm', bg: 0x6a4a2a }, ['tag:melee', 'tag:ranged', 'tag:caster', 'tag:siege', 'ir_vulture'], { armor: 2 }, 'All Clan units gain 2 armor per level.'),
  singleUpgrade('ir_up_spikes', 'Spiked Palisades', F, { glyph: 'claw', bg: 0x5a4a3a }, ['building'], { gold: 75, lumber: 175 }, 45, 'Buildings return 35% of melee damage to attackers.', { mods: { thorns: 0.35 } }),
  singleUpgrade('ir_up_bloodrage', 'Blood Rage', F, { glyph: 'fist', bg: 0x8a1a1a }, ['ir_warrior'], { gold: 100, lumber: 100 }, 40, 'Ironhide Warriors fight harder when wounded.', { unlocksAbility: 'ir_rage', requires: ['tier2'] }),
  singleUpgrade('ir_up_bolas', 'Bolas', F, { glyph: 'chain', bg: 0x6a4a2a }, ['ir_tusk'], { gold: 75, lumber: 75 }, 40, 'Tusk Riders learn to hurl bolas.', { unlocksAbility: 'ir_bola' }),
  singleUpgrade('ir_up_venom', 'Envenomed Spears', F, { glyph: 'drop', bg: 0x3a7a2a }, ['ir_vulture'], { gold: 100, lumber: 100 }, 45, 'Vulture Riders poison their targets.', { unlocksAbility: 'ir_venom', requires: ['tier3'] }),
  singleUpgrade('ir_up_rites', 'Ancestor Rites', F, { glyph: 'book', bg: 0x2a6a3a }, ['ir_bonecaster'], { gold: 100, lumber: 100 }, 50, 'Bonecasters gain 100 mana and learn Ancestor Ward.', { mods: { maxMana: 100, manaRegen: 0.15 }, unlocksAbility: 'ir_healward' }),
  singleUpgrade('ir_up_seer', 'Seer Initiation', F, { glyph: 'book', bg: 0x2a3a7a }, ['ir_seer'], { gold: 100, lumber: 125 }, 50, 'Thunder Seers gain 100 mana and learn War Paint.', { mods: { maxMana: 100, manaRegen: 0.15 }, unlocksAbility: 'ir_warpaint' }),
  singleUpgrade('ir_up_brutes', 'Ancestral Might', F, { glyph: 'fist', bg: 0x6a3a2a }, ['ir_brute'], { gold: 150, lumber: 150 }, 50, 'Ironjaw Brutes gain 200 health.', { mods: { maxHp: 200 }, requires: ['tier3'] }),
]);

regDefs([
  unit({
    id: 'ir_clanhand', name: 'Clanhand', faction: F, description: 'A tough laborer who mines, chops and builds. Can shelter in a Longhouse and throw spears from it.',
    hp: 260, armor: 0, cost: { gold: 75, lumber: 0, food: 1 }, buildTime: 15, speed: 2.4, radius: 0.33, level: 1, sight: [8, 6],
    weapon: melee([7, 8], 2.0), tags: { organic: true, worker: true }, harvest: { gold: 'standard', lumber: 'standard' }, hotkey: 'C', priority: 1,
    model: { kind: 'humanoid', skin: SKIN, body: HIDE, legs: 0x5a4030, weapon: 'axe', tusks: true, team: 'sash' },
  }),
  unit({
    id: 'ir_warrior', name: 'Ironhide Warrior', faction: F, description: 'A towering axe fighter with great endurance. The core of any Clan warband.',
    hp: 680, armor: 1, armorType: 'medium', cost: { gold: 165, lumber: 0, food: 3 }, buildTime: 24, speed: 2.5, radius: 0.42, level: 3,
    weapon: melee([18, 22], 1.5), abilities: ['ir_rage'], tags: { organic: true, melee: true }, hotkey: 'W', priority: 4,
    model: { kind: 'humanoid', scale: 1.1, bulk: 1.35, skin: SKIN, body: IRON, armor: IRON, legs: 0x4a3a2a, helm: 'horned', helmColor: IRON, weapon: 'axe', tusks: true, team: 'sash' },
  }),
  unit({
    id: 'ir_spearhunter', name: 'Spear Hunter', faction: F, description: 'A woodland hunter who hurls heavy javelins at targets on the ground and in the air.',
    hp: 360, armor: 0, armorType: 'medium', cost: { gold: 135, lumber: 20, food: 2 }, buildTime: 22, speed: 2.5, radius: 0.36, level: 2,
    weapon: missile([20, 24], 4.6, 'pierce', SPEAR, 1.6), tags: { organic: true, ranged: true }, hotkey: 'S', priority: 3,
    model: { kind: 'humanoid', skin: 0x5a8a7a, body: HIDE, legs: 0x5a4030, weapon: 'javelin', tusks: true, ears: true, hunch: true, team: 'sash', mohawk: RED },
  }),
  unit({
    id: 'ir_tusk', name: 'Tusk Rider', faction: F, description: 'A raider on a great war boar, carrying torches that set buildings ablaze. Can learn to hurl bolas.',
    hp: 620, armor: 1, armorType: 'medium', cost: { gold: 200, lumber: 40, food: 3 }, buildTime: 30, speed: 3.4, radius: 0.55, level: 3, requires: ['tier2'],
    weapon: melee([22, 27], 1.6, { vsStructure: 1.4 }), abilities: ['ir_bola', 'ir_gore'], tags: { organic: true, melee: true, cavalry: true }, hotkey: 'T', priority: 5,
    model: { kind: 'rider', mount: 'boar', mountColor: 0x6a4a3a, skin: SKIN, body: HIDE, weapon: 'axe', tusks: true, team: 'banner' },
  }),
  unit({
    id: 'ir_bonecaster', name: 'Bonecaster', faction: F, description: 'A shaman who calls on ancestor spirits to mend allies.',
    hp: 320, mana: 250, armor: 0, armorType: 'unarmored', cost: { gold: 140, lumber: 20, food: 2 }, buildTime: 28, speed: 2.4, radius: 0.35, level: 2, requires: ['tier2'],
    weapon: missile([9, 11], 5, 'magic', orb(0x8affa0), 2.0), abilities: ['ir_spiritmend', 'ir_healward'], tags: { organic: true, caster: true }, hotkey: 'B', priority: 5,
    model: { kind: 'humanoid', skin: SKIN, body: 0x6a5a3a, robe: true, helm: 'skull', helmColor: 0xe8dcc0, weapon: 'staff', orb: 0x8affa0, tusks: true, hunch: true, team: 'sash' },
  }),
  unit({
    id: 'ir_seer', name: 'Thunder Seer', faction: F, description: 'A storm shaman who lashes foes with lightning and paints allies with war marks.',
    hp: 340, mana: 300, armor: 0, armorType: 'unarmored', cost: { gold: 160, lumber: 30, food: 2 }, buildTime: 30, speed: 2.4, radius: 0.35, level: 3, requires: ['tier2'],
    weapon: missile([11, 13], 5, 'magic', orb(0x8ab0ff), 1.9), abilities: ['ir_lightninglash', 'ir_warpaint'], tags: { organic: true, caster: true }, hotkey: 'E', priority: 5,
    model: { kind: 'humanoid', skin: SKIN, body: 0x3a4a6a, robe: true, helm: 'horned', helmColor: 0xd8c8a0, weapon: 'staff', orb: 0x8ab0ff, tusks: true, team: 'sash' },
  }),
  unit({
    id: 'ir_hurler', name: 'Rock Hurler', faction: F, description: 'A crude but brutal siege engine that flings boulders over long distances.',
    hp: 520, armor: 2, armorType: 'heavy', cost: { gold: 220, lumber: 50, food: 4 }, buildTime: 38, speed: 1.85, radius: 0.6, level: 3, requires: ['tier2', 'ir_smithy'],
    weapon: missile([82, 100], 9, 'siege', BOULDER, 3.5, { targets: { ground: true, structure: true }, splash: { radius: 1.6, factor: 0.5 }, damagePoint: 0.6 }), tags: { mechanical: true, siege: true }, hotkey: 'R', priority: 3,
    model: { kind: 'wagon', variant: 'catapult', color: 0x6a4a2a, metal: IRON },
  }),
  unit({
    id: 'ir_vulture', name: 'Vulture Rider', faction: F, description: 'A hunter on a giant carrion vulture. Swift and deadly against air and ground.',
    hp: 560, armor: 0, armorType: 'light', cost: { gold: 245, lumber: 50, food: 4 }, buildTime: 35, speed: 3.4, radius: 0.55, level: 4, air: true, flyHeight: 2.9, requires: ['tier2'],
    weapon: missile([24, 30], 4.5, 'pierce', SPEAR, 1.6), abilities: ['ir_venom'], tags: { organic: true }, hotkey: 'V', priority: 5,
    model: { kind: 'flyer', variant: 'vulture', color: 0x3a2a2a, wingColor: 0x2a1a1a, rider: true, riderColor: HIDE, head: 0xd09a8a },
  }),
  unit({
    id: 'ir_mammoth', name: 'Mammoth Drummer', faction: F, description: 'A shaggy war mammoth carrying war drums. Its pounding rhythm drives nearby warriors to greater fury.',
    hp: 1150, armor: 2, armorType: 'heavy', cost: { gold: 280, lumber: 60, food: 5 }, buildTime: 45, speed: 2.0, radius: 0.85, level: 5, requires: ['tier3'],
    weapon: melee([26, 32], 1.6, { cleave: { radius: 1.4, factor: 0.25 } }), abilities: ['ir_drums'], tags: { organic: true, melee: true }, hotkey: 'D', priority: 6,
    model: { kind: 'beast', head: 'mammoth', color: 0x6a4a3a, scale: 1.7, drums: true },
  }),
  unit({
    id: 'ir_brute', name: 'Ironjaw Brute', faction: F, description: 'An enormous elite warrior whose great maul cleaves through crowds.',
    hp: 1300, armor: 3, armorType: 'heavy', cost: { gold: 300, lumber: 90, food: 5 }, buildTime: 45, speed: 2.4, radius: 0.7, level: 6, requires: ['tier3'],
    weapon: melee([34, 41], 1.8, { cleave: { radius: 1.8, factor: 0.4 }, damagePoint: 0.5 }), tags: { organic: true, melee: true }, hotkey: 'J', priority: 7,
    model: { kind: 'humanoid', scale: 1.6, bulk: 1.6, skin: 0x5a7a3a, body: IRON, armor: IRON, helm: 'horned', helmColor: 0x3a3a3a, weapon: 'hammer', tusks: true, team: 'sash' },
  }),
  // summons
  unit({ id: 'ir_boar1', name: 'War Boar', faction: F, description: 'A summoned boar.', hp: 380, armor: 1, cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 3.0, radius: 0.42, level: 2, weapon: melee([14, 17], 1.3, { damagePoint: 0.3 }), tags: { summoned: true, melee: true }, model: { kind: 'beast', head: 'boar', color: 0x5a3a2a, scale: 0.9, glow: 0x9affd0 } }),
  unit({ id: 'ir_boar2', name: 'Tusked Boar', faction: F, description: 'A summoned boar.', hp: 500, armor: 2, cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 3.1, radius: 0.46, level: 3, weapon: melee([20, 24], 1.3, { damagePoint: 0.3 }), tags: { summoned: true, melee: true }, model: { kind: 'beast', head: 'boar', color: 0x4a2a1a, scale: 1.05, glow: 0x9affd0 } }),
  unit({ id: 'ir_boar3', name: 'Ironback Boar', faction: F, description: 'A summoned boar.', hp: 640, armor: 3, cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 3.2, radius: 0.5, level: 4, weapon: melee([27, 32], 1.3, { damagePoint: 0.3 }), tags: { summoned: true, melee: true }, model: { kind: 'beast', head: 'boar', color: 0x3a2a2a, scale: 1.2, glow: 0x9affd0 } }),
  unit({ id: 'ir_healward_u', name: 'Ancestor Ward', faction: F, description: 'Heals nearby allies.', hp: 120, armor: 0, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.25, level: 1, abilities: ['ir_wardheal1'], tags: { summoned: true }, model: { kind: 'ward', variant: 'totem', color: 0x3a8a4a } }),
  unit({ id: 'ir_htotem1', name: 'Totem of Spirits', faction: F, description: 'Heals nearby allies.', hp: 150, armor: 0, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.25, level: 1, abilities: ['ir_wardheal1'], tags: { summoned: true }, model: { kind: 'ward', variant: 'totem', color: 0x3a8aaa } }),
  unit({ id: 'ir_htotem2', name: 'Totem of Spirits', faction: F, description: 'Heals nearby allies.', hp: 200, armor: 0, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.25, level: 1, abilities: ['ir_wardheal2'], tags: { summoned: true }, model: { kind: 'ward', variant: 'totem', color: 0x3a8aaa } }),
  unit({ id: 'ir_htotem3', name: 'Totem of Spirits', faction: F, description: 'Heals nearby allies.', hp: 250, armor: 0, armorType: 'fortified', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 0, radius: 0.25, level: 1, abilities: ['ir_wardheal3'], tags: { summoned: true }, model: { kind: 'ward', variant: 'totem', color: 0x3a8aaa, scale: 1.2 } }),
]);

regAbilities([
  ab({ id: 'ir_wardheal1', name: 'Healing Spirits', icon: { glyph: 'leaf', bg: 0x2a7a4a }, targeting: 'aura', effect: { type: 'aura', buff: 'regenerating', radius: 5, targets: 'allies', hot: 8, organicOnly: true }, description: 'Heals allies nearby for 8 per second.' }),
  ab({ id: 'ir_wardheal2', name: 'Healing Spirits', icon: { glyph: 'leaf', bg: 0x2a7a4a }, targeting: 'aura', effect: { type: 'aura', buff: 'regenerating', radius: 5, targets: 'allies', hot: 14, organicOnly: true }, description: 'Heals allies nearby for 14 per second.' }),
  ab({ id: 'ir_wardheal3', name: 'Healing Spirits', icon: { glyph: 'leaf', bg: 0x2a7a4a }, targeting: 'aura', effect: { type: 'aura', buff: 'regenerating', radius: 5, targets: 'allies', hot: 20, organicOnly: true }, description: 'Heals allies nearby for 20 per second.' }),
]);

regDefs([
  heroDef({
    id: 'ir_h_warlord', name: 'Warlord', faction: F, description: 'A massive chieftain whose roar shakes the courage of his enemies.',
    armor: 2, speed: 2.7,
    weapon: { damage: [14, 24], cooldown: 2.25, range: 0.35, damagePoint: 0.45, type: 'hero', targets: { ground: true, structure: true } },
    hero: { primary: 'str', str: 25, agi: 12, int: 14, strGain: 3.0, agiGain: 1.4, intGain: 1.6, abilities: ['ir_groundslam', 'ir_bellow', 'ir_hunger', 'ir_earthshatter'], title: 'Warrior Hero' },
    model: { kind: 'humanoid', scale: 1.35, bulk: 1.5, skin: SKIN, body: IRON, armor: RED, helm: 'horned', helmColor: 0x3a3a3a, weapon: 'greataxe', tusks: true, cape: true },
    hotkey: 'W',
  }),
  heroDef({
    id: 'ir_h_beastcaller', name: 'Beastcaller', faction: F, description: 'A wild huntress who fights alongside the beasts of the forest.',
    armor: 2, speed: 2.85,
    weapon: { damage: [15, 22], cooldown: 1.95, range: 4.8, damagePoint: 0.35, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: SPEAR },
    hero: { primary: 'agi', str: 18, agi: 22, int: 15, strGain: 2.0, agiGain: 2.6, intGain: 1.6, abilities: ['ir_huntingspear', 'ir_boars', 'ir_predator', 'ir_howl'], title: 'Hunter Hero' },
    model: { kind: 'humanoid', scale: 1.1, skin: 0x5a8a6a, body: HIDE, armor: 0xd8c8a0, helm: 'antlers', helmColor: 0xd8c8a0, weapon: 'javelin', tusks: true, ears: true, cape: true },
    hotkey: 'B',
  }),
  heroDef({
    id: 'ir_h_storm', name: 'Storm Speaker', faction: F, description: 'An elder shaman who commands lightning and the spirits of the ancestors.',
    armor: 1, speed: 2.65,
    weapon: { damage: [14, 20], cooldown: 2.1, range: 5.5, damagePoint: 0.35, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: orb(0x8ab0ff, 13, 1.2) },
    hero: { primary: 'int', str: 17, agi: 15, int: 22, strGain: 2.0, agiGain: 1.2, intGain: 3.0, abilities: ['ir_forked', 'ir_spirittotem', 'ir_thunderstrikes', 'ir_tempest'], title: 'Storm Caster Hero' },
    model: { kind: 'humanoid', scale: 1.15, skin: SKIN, body: 0x2a3a5a, robe: true, armor: 0xd8c8a0, helm: 'wolfhood', helmColor: 0x8a8a8a, weapon: 'staff', orb: 0x8ab0ff, tusks: true, beard: 0xd8d8d8, cape: true },
    hotkey: 'S',
  }),
]);

regDefs([
  bld({
    id: 'ir_hall', name: 'Clan Hall', faction: F, description: 'The great hall of the clan. Trains Clanhands and receives resources.',
    hp: 1700, armor: 5, size: 5, cost: { gold: 385, lumber: 185 }, buildTime: 110, mainHall: true, hallTier: 1, foodProvided: 12, dropoff: ['gold', 'lumber'],
    trains: ['ir_clanhand'], upgradesTo: 'ir_hold', hotkey: 'H', sight: [10, 8], model: { kind: 'building', faction: F, variant: 'hall' },
  }),
  bld({
    id: 'ir_hold', name: 'War Hold', faction: F, description: 'A palisaded war hold. Unlocks tier two.',
    hp: 2100, armor: 5, size: 5, cost: { gold: 315, lumber: 200 }, buildTime: 120, mainHall: true, hallTier: 2, foodProvided: 12, dropoff: ['gold', 'lumber'],
    trains: ['ir_clanhand'], upgradesTo: 'ir_bastion', buildable: false, requires: ['ir_warcamp'], sight: [11, 8], model: { kind: 'building', faction: F, variant: 'keep' },
  }),
  bld({
    id: 'ir_bastion', name: 'Iron Bastion', faction: F, description: 'An iron-bound fortress. Unlocks tier three.',
    hp: 2600, armor: 6, size: 5, cost: { gold: 340, lumber: 220 }, buildTime: 135, mainHall: true, hallTier: 3, foodProvided: 12, dropoff: ['gold', 'lumber'],
    trains: ['ir_clanhand'], buildable: false, requires: ['ir_altar'], sight: [12, 9], model: { kind: 'building', faction: F, variant: 'citadel' },
  }),
  bld({
    id: 'ir_longhouse', name: 'Longhouse', faction: F, description: 'Provides 10 food. Up to four Clanhands can shelter inside and hurl spears at attackers.',
    hp: 650, armor: 3, size: 3, cost: { gold: 160, lumber: 40 }, buildTime: 45, foodProvided: 10, garrison: 4, abilities: ['ir_unload'], hotkey: 'L', model: { kind: 'building', faction: F, variant: 'farm' },
  }),
  bld({
    id: 'ir_warcamp', name: 'War Camp', faction: F, description: 'Trains Ironhide Warriors, Spear Hunters and Rock Hurlers.', hp: 1250, size: 4, cost: { gold: 180, lumber: 50 }, buildTime: 60,
    trains: ['ir_warrior', 'ir_spearhunter', 'ir_hurler'], researches: ['ir_up_bloodrage'], hotkey: 'B', model: { kind: 'building', faction: F, variant: 'barracks' },
  }),
  bld({
    id: 'ir_smithy', name: 'Smithy', faction: F, description: 'Receives lumber and forges weapon, armor and palisade improvements.', hp: 1000, size: 3, cost: { gold: 200, lumber: 0 }, buildTime: 55, dropoff: ['lumber'],
    researches: ['ir_up_melee', 'ir_up_ranged', 'ir_up_hides', 'ir_up_spikes'], hotkey: 'S', model: { kind: 'building', faction: F, variant: 'smith' },
  }),
  bld({
    id: 'ir_altar', name: 'Blood Altar', faction: F, description: 'Summons and revives heroes.', hp: 950, size: 3, cost: { gold: 180, lumber: 50 }, buildTime: 55, isAltar: true,
    trains: ['ir_h_warlord', 'ir_h_beastcaller', 'ir_h_storm'], hotkey: 'A', model: { kind: 'building', faction: F, variant: 'altar' },
  }),
  bld({
    id: 'ir_beastpen', name: 'Beast Pen', faction: F, description: 'Trains Tusk Riders, Vulture Riders and Mammoth Drummers.', hp: 1100, size: 4, cost: { gold: 145, lumber: 140 }, buildTime: 60, requires: ['tier2'],
    trains: ['ir_tusk', 'ir_vulture', 'ir_mammoth'], researches: ['ir_up_bolas', 'ir_up_venom'], advanced: true, hotkey: 'E', model: { kind: 'building', faction: F, variant: 'beastpen' },
  }),
  bld({
    id: 'ir_totems', name: 'Totem Circle', faction: F, description: 'Trains Bonecasters and Thunder Seers.', hp: 900, size: 3, cost: { gold: 150, lumber: 150 }, buildTime: 60, requires: ['tier2'],
    trains: ['ir_bonecaster', 'ir_seer'], researches: ['ir_up_rites', 'ir_up_seer'], advanced: true, hotkey: 'T', model: { kind: 'building', faction: F, variant: 'academy' },
  }),
  bld({
    id: 'ir_mound', name: 'Ancestral Mound', faction: F, description: 'Trains Ironjaw Brutes.', hp: 1100, size: 4, cost: { gold: 135, lumber: 155 }, buildTime: 60, requires: ['tier3'],
    trains: ['ir_brute'], researches: ['ir_up_brutes'], advanced: true, hotkey: 'M', model: { kind: 'building', faction: F, variant: 'mound' },
  }),
  bld({
    id: 'ir_post', name: 'Trading Post', faction: F, description: 'Sells potions, scrolls and trinkets to nearby heroes.', hp: 700, size: 3, cost: { gold: 130, lumber: 30 }, buildTime: 50,
    shopItems: ['item_heal', 'item_mana', 'item_homeward', 'item_dust', 'item_ward', 'item_mending', 'item_claws'], advanced: true, hotkey: 'P', model: { kind: 'building', faction: F, variant: 'shop' },
  }),
  bld({
    id: 'ir_watchpost', name: 'Spiked Watchpost', faction: F, description: 'A spiked tower that hurls spears at nearby enemies.', hp: 520, armor: 4, size: 2, cost: { gold: 110, lumber: 80 }, buildTime: 40, requires: ['ir_warcamp'],
    weapon: missile([20, 25], 7, 'pierce', SPEAR, 1.0), hotkey: 'T', sight: [12, 10], tags: { detector: true }, model: { kind: 'building', faction: F, variant: 'tower' },
  }),
]);

regFaction({
  id: F,
  name: 'Iron Clans',
  adjective: 'Clan',
  description: 'A warrior culture of shamans and raiders. Durable melee warriors, swift raiders and powerful war magic.',
  color: 0xb03a2a,
  worker: 'ir_clanhand',
  hall: 'ir_hall',
  startUnits: [{ id: 'ir_clanhand', count: 5 }],
  heroes: ['ir_h_warlord', 'ir_h_beastcaller', 'ir_h_storm'],
  altar: 'ir_altar',
  farm: 'ir_longhouse',
  shop: 'ir_post',
  tower: 'ir_watchpost',
  barracks: 'ir_warcamp',
  lumberDropoff: 'ir_smithy',
  traits: ['Clanhands build from inside the structure', 'Longhouses shelter workers who throw spears', 'Spiked Palisades punish melee attackers'],
});
