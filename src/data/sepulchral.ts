import { ARROW, ab, building, heroDef, melee, missile, orb, singleUpgrade, tieredUpgrade, unit } from './helpers';
import { regAbilities, regDefs, regFaction, regUpgrades } from './registry';
import type { EntityDef } from './types';

const F = 'sepulchral' as const;
const BONE = 0xd9d2bf;
const BASALT = 0x2e2b33;
const GLOW = 0x6dffb0;

const bld = (p: Parameters<typeof building>[0]): EntityDef => building({ buildMode: 'summon', needsBlight: true, blightRadius: 5, noRepair: true, ...p });

regAbilities([
  ab({ id: 'sep_devour', name: 'Devour Corpse', hotkey: 'Q', icon: { glyph: 'bone', bg: 0x5a3a3a }, targeting: 'none', cooldown: 1, autocast: true, autocastDefault: true, effect: { type: 'devour', duration: 18, hot: 15 }, description: 'Consumes a nearby corpse, regenerating 270 health over 18 seconds.', ai: 'heal' }),
  ab({ id: 'sep_wither', name: 'Withering Shafts', icon: { glyph: 'arrowUp', bg: 0x4a5a3a }, targeting: 'passive', requiresUpgrade: 'sep_up_wither', effect: { type: 'onHit', buff: 'withered', duration: 6, mods: { armor: -1 } }, description: 'Each arrow strips 1 armor from the target for 6 seconds, stacking up to 3 times.' }),
  ab({ id: 'sep_soulreap', name: 'Soul Reap', icon: { glyph: 'skull', bg: 0x3a5a4a }, targeting: 'passive', effect: { type: 'passive', mods: { lifesteal: 0.2 } }, description: 'Heals for 20% of damage dealt.' }),
  ab({ id: 'sep_raisedead', name: 'Raise Dead', hotkey: 'Q', icon: { glyph: 'skull', bg: 0x2a5a3a }, targeting: 'none', range: 6, mana: 75, cooldown: 4, autocast: true, autocastDefault: true, effect: { type: 'raiseDead', unit: 'sep_skeleton', perCorpse: 2, corpses: 1, duration: 40 }, description: 'Raises two skeleton warriors from a nearby corpse. They crumble after 40 seconds.', ai: 'summon' }),
  ab({ id: 'sep_bonearmor', name: 'Bone Armor', hotkey: 'W', icon: { glyph: 'bone', bg: 0x6a6a5a }, targeting: 'unit', filter: { ally: true, ground: true, air: true }, range: 5, mana: 60, cooldown: 4, autocast: true, autocastDefault: true, requiresUpgrade: 'sep_up_necro', effect: { type: 'buff', buff: 'boneArmor', duration: 30, absorb: 160 }, description: 'Encases an ally in bone plates that absorb 160 damage.', ai: 'buff' }),
  ab({ id: 'sep_soulleech', name: 'Soul Leech', hotkey: 'Q', icon: { glyph: 'drop', bg: 0x4a2a5a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true, organic: true }, range: 5, mana: 60, cooldown: 10, channel: 6, effect: { type: 'drain', dps: 20, healFactor: 1, fx: 'drain' }, description: 'Drains 20 life per second from an enemy for 6 seconds, healing the Hexwraith.', ai: 'nuke' }),
  ab({ id: 'sep_wail', name: 'Wail of Silence', hotkey: 'W', icon: { glyph: 'mask', bg: 0x3a2a5a }, targeting: 'point', range: 6, aoe: 2.8, mana: 75, cooldown: 15, requiresUpgrade: 'sep_up_hex', effect: { type: 'buff', targets: 'area', affects: 'enemies', radius: 2.8, buff: 'silence', duration: 6, durationHero: 3, fx: 'wail' }, description: 'A piercing wail silences enemies in an area, preventing spellcasting.', ai: 'debuff' }),
  ab({ id: 'sep_miasma', name: 'Miasma Payload', icon: { glyph: 'cloud', bg: 0x3a6a2a }, targeting: 'passive', requiresUpgrade: 'sep_up_miasma', effect: { type: 'onHit', buff: 'plague', duration: 8, dot: 5 }, description: 'Shots infect the target with plague, dealing 5 damage per second for 8 seconds.' }),
  ab({ id: 'sep_disease', name: 'Disease Cloud', icon: { glyph: 'cloud', bg: 0x4a6a2a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_disease', radius: 2.5, targets: 'enemies', dot: 5, organicOnly: true }, description: 'Enemies standing close suffer 5 damage per second.' }),
  ab({ id: 'sep_obelisk_pulse', name: 'Grave Light', icon: { glyph: 'orb', bg: 0x2a5a3a }, targeting: 'passive', effect: { type: 'passive' }, description: 'Spreads blight.' }),
]);

regAbilities([
  // Grave Lord
  ab({ id: 'sep_gravechains', name: 'Grave Chains', hotkey: 'Q', icon: { glyph: 'chain', bg: 0x2a4a3a }, targeting: 'unit', filter: { enemy: true, ground: true }, range: 6, mana: 80, cooldown: 12, effect: { type: 'damage', damage: 0, buff: 'entangle', duration: [2.5, 3.5, 4.5], durationHero: [1.5, 2, 2.5], dot: [22, 32, 42], fx: 'chains' }, description: 'Spectral chains erupt from the ground, binding the target and draining its life.', levelText: ['2.5s, 22 dps', '3.5s, 32 dps', '4.5s, 42 dps'], ai: 'disable' }),
  ab({ id: 'sep_corpsebomb', name: 'Corpse Explosion', hotkey: 'W', icon: { glyph: 'bone', bg: 0x5a2a2a }, targeting: 'point', range: 7, aoe: 2.5, mana: 75, cooldown: 10, effect: { type: 'corpseExplode', radius: 2.5, damage: [100, 160, 220], corpses: [1, 2, 3] }, description: 'Detonates nearby corpses, damaging enemies around each.', levelText: ['1 corpse, 100 damage', '2 corpses, 160 damage', '3 corpses, 220 damage'], ai: 'aoe' }),
  ab({ id: 'sep_deathchill', name: 'Deathly Chill', hotkey: 'E', icon: { glyph: 'frost', bg: 0x2a4a5a }, targeting: 'aura', effect: { type: 'aura', buff: 'aura_chill', radius: 6, targets: 'enemies', mods: { attackSpeedPct: [-0.1, -0.18, -0.26] } }, description: 'The cold of the grave slows the attacks of nearby enemies.', levelText: ['-10% attack speed', '-18% attack speed', '-26% attack speed'] }),
  ab({ id: 'sep_armyofdead', name: 'Army of the Dead', hotkey: 'R', icon: { glyph: 'skull', bg: 0x1a3a2a }, targeting: 'none', ultimate: true, maxLevel: 1, range: 10, mana: 175, cooldown: 150, effect: { type: 'raiseDead', unit: 'sep_deathknight', perCorpse: 1, corpses: 10, duration: 45 }, description: 'Raises up to ten corpses as armored death guards for 45 seconds.', ai: 'ultimate' }),
  // Rot Witch
  ab({ id: 'sep_plaguebolt', name: 'Plague Bolt', hotkey: 'Q', icon: { glyph: 'drop', bg: 0x3a6a1a }, targeting: 'unit', filter: { enemy: true, ground: true, air: true }, range: 7, mana: 85, cooldown: 7, effect: { type: 'damage', damage: [70, 110, 150], buff: 'plague', duration: 8, dot: [10, 16, 22], projectile: { kind: 'orb', speed: 12, color: 0x9cff5a, size: 1.4 } }, description: 'A bolt of pestilence that damages and sickens the target.', levelText: ['70 + 80 damage', '110 + 128 damage', '150 + 176 damage'], ai: 'nuke' }),
  ab({ id: 'sep_witherfield', name: 'Withering Field', hotkey: 'W', icon: { glyph: 'swirl', bg: 0x3a4a2a }, targeting: 'point', range: 7, aoe: 3.5, mana: 100, cooldown: 16, effect: { type: 'zone', radius: 3.5, duration: 8, interval: 1, buff: 'withering', mods: { moveSpeedPct: -0.35, armor: [-2, -3, -4] }, fx: 'witherzone' }, description: 'Corrupts the ground: enemies in it are slowed and lose armor.', levelText: ['-2 armor', '-3 armor', '-4 armor'], ai: 'aoe' }),
  ab({ id: 'sep_soulsiphon', name: 'Soul Siphon', hotkey: 'E', icon: { glyph: 'orb', bg: 0x2a3a5a }, targeting: 'passive', effect: { type: 'passive', mods: { maxMana: [60, 120, 180], manaRegen: [0.5, 1.0, 1.5] } }, description: 'Draws power from the dying world: more mana and faster mana regeneration.', levelText: ['+60 mana', '+120 mana', '+180 mana'] }),
  ab({ id: 'sep_pestilence', name: 'Pestilence', hotkey: 'R', icon: { glyph: 'cloud', bg: 0x2a5a1a }, targeting: 'point', ultimate: true, maxLevel: 1, range: 9, aoe: 6, mana: 200, cooldown: 150, effect: { type: 'zone', radius: 6, duration: 12, interval: 1, damage: 40, structures: true, structureMult: 0.5, buff: 'plague', mods: { damagePct: -0.15 }, fx: 'plaguezone' }, description: 'A vast plague cloud damages and weakens everything in the area for 12 seconds.', ai: 'ultimate' }),
  // Shadowblade
  ab({ id: 'sep_shadowstep', name: 'Shadowstep', hotkey: 'Q', icon: { glyph: 'dagger', bg: 0x2a2a3a }, targeting: 'unit', filter: { enemy: true, ground: true }, range: 7, mana: 70, cooldown: 10, effect: { type: 'strike', behind: true, damage: [60, 110, 160], buff: 'slow', duration: 2, mods: { moveSpeedPct: -0.6 }, thenAttack: true }, description: 'Steps through the shadows behind an enemy and strikes, crippling it.', levelText: ['60 damage', '110 damage', '160 damage'], ai: 'nuke' }),
  ab({ id: 'sep_fade', name: 'Fade', hotkey: 'W', icon: { glyph: 'ghost', bg: 0x2a2a4a }, targeting: 'none', mana: 75, cooldown: 12, effect: { type: 'buff', targets: 'self', buff: 'fade', duration: 20, mods: { moveSpeedPct: [0.1, 0.2, 0.3] }, bonusDamage: [40, 80, 120], instant: true }, description: 'Vanishes from sight. The first strike from the shadows deals bonus damage.', levelText: ['+40 damage', '+80 damage', '+120 damage'], ai: 'escape' }),
  ab({ id: 'sep_vampedge', name: 'Vampiric Edge', hotkey: 'E', icon: { glyph: 'drop', bg: 0x6a1a2a }, targeting: 'passive', effect: { type: 'passive', mods: { lifesteal: [0.12, 0.2, 0.28] } }, description: 'Attacks drain life.', levelText: ['12% life steal', '20% life steal', '28% life steal'] }),
  ab({ id: 'sep_thousandcuts', name: 'Thousand Cuts', hotkey: 'R', icon: { glyph: 'twinblades', bg: 0x3a1a2a }, targeting: 'none', ultimate: true, maxLevel: 1, aoe: 7, mana: 150, cooldown: 120, channel: 2.4, effect: { type: 'multiStrike', radius: 7, interval: 0.3, damage: 110 }, description: 'Becomes a flicker of shadow, striking up to 8 enemies nearby for 110 damage each.', ai: 'ultimate' }),
]);

regUpgrades([
  tieredUpgrade('sep_up_melee', 'Bone Blades', F, { glyph: 'bone', bg: 0x5a5a4a }, ['sep_gravedigger', 'sep_rider', 'sep_colossus', 'sep_skeleton'], { damagePct: 0.1 }, 'Melee units deal 10% more damage per level.'),
  tieredUpgrade('sep_up_ranged', 'Grave Shafts', F, { glyph: 'arrowUp', bg: 0x4a4a3a }, ['sep_archer', 'sep_rotwing', 'sep_cart', 'sep_manta'], { damagePct: 0.1 }, 'Ranged units deal 10% more damage per level.'),
  tieredUpgrade('sep_up_armor', 'Bone Carapace', F, { glyph: 'helm', bg: 0x4a4a4a }, ['tag:melee', 'tag:ranged', 'tag:caster', 'tag:siege', 'sep_rotwing', 'sep_manta'], { armor: 2 }, 'All Conclave units gain 2 armor per level.'),
  singleUpgrade('sep_up_wither', 'Withering Shafts', F, { glyph: 'arrowUp', bg: 0x4a5a3a }, ['sep_archer'], { gold: 100, lumber: 125 }, 45, 'Bone Archer arrows strip armor.', { unlocksAbility: 'sep_wither', requires: ['tier2'] }),
  singleUpgrade('sep_up_necro', 'Necromancy Rites', F, { glyph: 'book', bg: 0x2a5a3a }, ['sep_necro'], { gold: 100, lumber: 100 }, 50, 'Necromancers gain 100 mana and learn Bone Armor.', { mods: { maxMana: 100, manaRegen: 0.15 }, unlocksAbility: 'sep_bonearmor' }),
  singleUpgrade('sep_up_hex', 'Wraith Binding', F, { glyph: 'book', bg: 0x3a2a5a }, ['sep_hexwraith'], { gold: 125, lumber: 125 }, 55, 'Hexwraiths gain 100 mana and learn Wail of Silence.', { mods: { maxMana: 100, manaRegen: 0.15 }, unlocksAbility: 'sep_wail', requires: ['tier3'] }),
  singleUpgrade('sep_up_miasma', 'Miasma Payload', F, { glyph: 'cloud', bg: 0x3a6a2a }, ['sep_cart'], { gold: 100, lumber: 100 }, 45, 'Plague Carts infect their targets.', { unlocksAbility: 'sep_miasma' }),
  singleUpgrade('sep_up_ghoulspeed', 'Grave Haste', F, { glyph: 'boot', bg: 0x3a4a3a }, ['sep_gravedigger', 'sep_rider'], { gold: 100, lumber: 75 }, 40, 'Gravediggers and Barrow Riders move 15% faster.', { mods: { moveSpeedPct: 0.15 }, requires: ['tier2'] }),
]);

regDefs([
  unit({
    id: 'sep_cultist', name: 'Cultist', faction: F, description: 'A hooded acolyte. Channels gold from a Cursed Lode and summons Conclave structures, which then rise on their own.',
    hp: 220, armor: 0, cost: { gold: 60, lumber: 0, food: 1 }, buildTime: 14, speed: 2.4, radius: 0.32, level: 1, sight: [8, 6],
    weapon: melee([6, 7], 2.0), tags: { organic: true, worker: true }, harvest: { gold: 'channel' }, hotkey: 'C', priority: 1,
    model: { kind: 'humanoid', skin: 0xb8b0a0, body: 0x2a2a3a, robe: true, helm: 'hood', helmColor: 0x2a2a3a, weapon: 'wand', glow: GLOW, team: 'sash' },
  }),
  unit({
    id: 'sep_gravedigger', name: 'Gravedigger', faction: F, description: 'A ravenous undead brute. Fights in melee, chops lumber and devours corpses to heal.',
    hp: 380, armor: 0, armorType: 'heavy', cost: { gold: 120, lumber: 0, food: 2 }, buildTime: 18, speed: 2.8, radius: 0.36, level: 2,
    weapon: melee([12, 14], 1.3, { damagePoint: 0.3 }), abilities: ['sep_devour'], tags: { undead: true, melee: true }, harvest: { lumber: 'standard' }, hotkey: 'G', priority: 3,
    model: { kind: 'humanoid', skin: 0x8a9a8a, body: 0x3a3a3a, legs: 0x2a2a2a, weapon: 'shovel', hunch: true, glow: GLOW, team: 'sash' },
  }),
  unit({
    id: 'sep_archer', name: 'Bone Archer', faction: F, description: 'A skeletal bowman. Can learn to strip armor with withering arrows.',
    hp: 400, armor: 1, armorType: 'medium', cost: { gold: 200, lumber: 40, food: 3 }, buildTime: 26, speed: 2.4, radius: 0.36, level: 2,
    weapon: missile([21, 25], 5, 'pierce', ARROW, 1.6), abilities: ['sep_wither'], tags: { undead: true, ranged: true }, hotkey: 'A', priority: 3,
    model: { kind: 'humanoid', skeletal: true, skin: BONE, body: 0x4a3a3a, weapon: 'bow', helm: 'helm', helmColor: 0x4a4a4a, glow: GLOW, team: 'sash' },
  }),
  unit({
    id: 'sep_rider', name: 'Barrow Rider', faction: F, description: 'A dead knight on a skeletal steed. Its soul-reaping blade restores it with every blow.',
    hp: 640, armor: 2, armorType: 'heavy', cost: { gold: 230, lumber: 40, food: 3 }, buildTime: 32, speed: 3.4, radius: 0.55, level: 4, requires: ['tier2'],
    weapon: melee([23, 28], 1.5), abilities: ['sep_soulreap'], tags: { undead: true, melee: true, cavalry: true }, hotkey: 'R', priority: 5,
    model: { kind: 'rider', mount: 'skeletalHorse', mountColor: BONE, skin: BONE, skeletal: true, body: BASALT, armor: 0x3a4a4a, helm: 'helm', helmColor: 0x3a4a4a, weapon: 'sword', glow: GLOW, team: 'barding' },
  }),
  unit({
    id: 'sep_necro', name: 'Necromancer', faction: F, description: 'A caster who raises skeletons from fresh corpses and wraps allies in bone.',
    hp: 300, mana: 250, armor: 0, armorType: 'unarmored', cost: { gold: 145, lumber: 20, food: 2 }, buildTime: 30, speed: 2.4, radius: 0.34, level: 2, requires: ['tier2'],
    weapon: missile([9, 12], 5, 'magic', orb(GLOW), 2.0), abilities: ['sep_raisedead', 'sep_bonearmor'], tags: { organic: true, caster: true }, hotkey: 'N', priority: 5,
    model: { kind: 'humanoid', skin: 0xc8c0b0, body: 0x1a1a2a, robe: true, helm: 'hood', helmColor: 0x1a1a2a, weapon: 'scythe', glow: GLOW, team: 'sash' },
  }),
  unit({
    id: 'sep_hexwraith', name: 'Hexwraith', faction: F, description: 'A wailing ghost that leeches the life of the living and silences enemy casters.',
    hp: 320, mana: 280, armor: 0, armorType: 'unarmored', cost: { gold: 155, lumber: 30, food: 2 }, buildTime: 30, speed: 2.6, radius: 0.34, level: 3, requires: ['tier2'],
    weapon: missile([10, 12], 5, 'magic', orb(0xb08aff), 1.9), abilities: ['sep_soulleech', 'sep_wail'], tags: { undead: true, caster: true }, hotkey: 'H', priority: 5,
    model: { kind: 'spirit', variant: 'wraith', color: 0x9aa0c0, glow: 0xb08aff, scale: 1.0 },
  }),
  unit({
    id: 'sep_cart', name: 'Plague Cart', faction: F, description: 'A creaking siege cart that flings bone-filled pots. Can learn to spread plague.',
    hp: 460, armor: 2, armorType: 'heavy', cost: { gold: 220, lumber: 50, food: 3 }, buildTime: 35, speed: 2.0, radius: 0.58, level: 3, requires: ['tier2'],
    weapon: missile([75, 90], 8.5, 'siege', { kind: 'bone', speed: 10, arc: 0.45 }, 3.4, { targets: { ground: true, structure: true }, splash: { radius: 1.5, factor: 0.5 }, damagePoint: 0.6 }), abilities: ['sep_miasma'], tags: { mechanical: true, siege: true }, hotkey: 'P', priority: 3,
    model: { kind: 'wagon', variant: 'plaguecart', color: 0x3a3a2a, metal: BONE, glow: 0x9cff5a },
  }),
  unit({
    id: 'sep_rotwing', name: 'Rotwing', faction: F, description: 'A carrion bird stitched together by necromancy. Hunts enemy fliers.',
    hp: 430, armor: 3, armorType: 'light', cost: { gold: 185, lumber: 30, food: 2 }, buildTime: 26, speed: 3.4, radius: 0.48, level: 3, air: true, flyHeight: 2.7, requires: ['tier2'],
    weapon: missile([18, 22], 3.5, 'pierce', { kind: 'bone', speed: 16 }, 1.4), tags: { undead: true }, hotkey: 'W', priority: 4,
    model: { kind: 'flyer', variant: 'rotwing', color: 0x5a4a4a, wingColor: 0x3a2a2a, glow: GLOW },
  }),
  unit({
    id: 'sep_colossus', name: 'Bone Colossus', faction: F, description: 'A giant woven from a thousand bones. Its rotting stench sickens nearby foes.',
    hp: 1400, armor: 2, armorType: 'heavy', cost: { gold: 320, lumber: 100, food: 5 }, buildTime: 48, speed: 2.1, radius: 0.78, level: 6, requires: ['tier3'],
    weapon: melee([38, 46], 1.9, { cleave: { radius: 1.6, factor: 0.35 }, damagePoint: 0.5 }), abilities: ['sep_disease'], tags: { undead: true, melee: true }, hotkey: 'O', priority: 7,
    model: { kind: 'golem', variant: 'bone', color: BONE, crystal: GLOW, scale: 1.45 },
  }),
  unit({
    id: 'sep_manta', name: 'Shadow Manta', faction: F, description: 'A vast ghostly ray gliding through the air, raining soul fire on armies below.',
    hp: 1100, armor: 1, armorType: 'light', cost: { gold: 360, lumber: 120, food: 6 }, buildTime: 55, speed: 2.6, radius: 0.85, level: 7, air: true, flyHeight: 3.4, requires: ['tier3'],
    weapon: missile([60, 72], 4, 'magic', orb(0x7affd0, 11, 1.5), 2.2, { splash: { radius: 1.3, factor: 0.5 } }), tags: { undead: true }, hotkey: 'M', priority: 7,
    model: { kind: 'flyer', variant: 'manta', color: 0x2a3a4a, wingColor: 0x1a2a3a, glow: 0x7affd0, scale: 1.4 },
  }),
  // summons
  unit({ id: 'sep_skeleton', name: 'Skeleton Warrior', faction: F, description: 'A raised skeleton.', hp: 200, armor: 1, armorType: 'medium', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 2.5, radius: 0.33, level: 1, weapon: melee([11, 13], 1.5), tags: { undead: true, summoned: true, melee: true }, model: { kind: 'humanoid', skeletal: true, skin: BONE, body: 0x5a5a5a, weapon: 'sword', shield: 'round', glow: GLOW } }),
  unit({ id: 'sep_deathknight', name: 'Death Guard', faction: F, description: 'An armored revenant.', hp: 500, armor: 4, armorType: 'heavy', cost: { gold: 0, lumber: 0 }, buildTime: 1, speed: 2.6, radius: 0.38, level: 3, weapon: melee([22, 26], 1.4), tags: { undead: true, summoned: true, melee: true }, model: { kind: 'humanoid', skeletal: true, skin: BONE, body: BASALT, armor: 0x3a4a4a, helm: 'helm', helmColor: 0x2a3a3a, weapon: 'sword', shield: 'kite', glow: GLOW } }),
]);

regDefs([
  heroDef({
    id: 'sep_h_gravelord', name: 'Grave Lord', faction: F, description: 'A fallen paladin-king bound in death to the Conclave, commanding chains and corpses.',
    armor: 3, speed: 2.7,
    weapon: { damage: [14, 24], cooldown: 2.2, range: 0.35, damagePoint: 0.45, type: 'hero', targets: { ground: true, structure: true } },
    hero: { primary: 'str', str: 23, agi: 14, int: 16, strGain: 2.8, agiGain: 1.5, intGain: 1.8, abilities: ['sep_gravechains', 'sep_corpsebomb', 'sep_deathchill', 'sep_armyofdead'], title: 'Undead Warrior Hero' },
    model: { kind: 'humanoid', scale: 1.25, skeletal: true, skin: BONE, body: BASALT, armor: 0x3a4a4a, helm: 'crown', helmColor: 0x6a7a7a, weapon: 'greatsword', cape: true, glow: GLOW },
    tags: { undead: true }, hotkey: 'G',
  }),
  heroDef({
    id: 'sep_h_witch', name: 'Rot Witch', faction: F, description: 'A crone of the plague pits who brews pestilence and decay.',
    armor: 1, speed: 2.65,
    weapon: { damage: [13, 20], cooldown: 2.1, range: 5.5, damagePoint: 0.35, type: 'hero', targets: { ground: true, air: true, structure: true }, projectile: orb(0x9cff5a, 13, 1.2) },
    hero: { primary: 'int', str: 16, agi: 14, int: 22, strGain: 1.8, agiGain: 1.4, intGain: 3.1, abilities: ['sep_plaguebolt', 'sep_witherfield', 'sep_soulsiphon', 'sep_pestilence'], title: 'Plague Caster Hero' },
    model: { kind: 'humanoid', scale: 1.05, hunch: true, skin: 0x9aa890, body: 0x2a3a2a, robe: true, helm: 'hood', helmColor: 0x3a4a2a, weapon: 'staff', orb: 0x9cff5a, cape: true, glow: 0x9cff5a },
    tags: { organic: true }, hotkey: 'R',
  }),
  heroDef({
    id: 'sep_h_shadowblade', name: 'Shadowblade', faction: F, description: 'An assassin who walks between life and death, striking from nowhere.',
    armor: 2, speed: 2.9,
    weapon: { damage: [13, 21], cooldown: 1.85, range: 0.35, damagePoint: 0.3, type: 'hero', targets: { ground: true, structure: true } },
    hero: { primary: 'agi', str: 17, agi: 24, int: 13, strGain: 2.0, agiGain: 3.0, intGain: 1.3, abilities: ['sep_shadowstep', 'sep_fade', 'sep_vampedge', 'sep_thousandcuts'], title: 'Assassin Hero' },
    model: { kind: 'humanoid', scale: 1.05, skin: 0x9a9aa8, body: 0x1a1a24, armor: 0x2a2a3a, helm: 'hood', helmColor: 0x1a1a24, weapon: 'twinblades', cape: true, glow: 0xb08aff },
    tags: { undead: true }, hotkey: 'S',
  }),
]);

regDefs([
  building({
    id: 'sep_spire', name: 'Necrotic Spire', faction: F, description: 'The seat of the Conclave. Summons Cultists and receives lumber. Spreads blight.',
    hp: 1600, armor: 5, size: 5, cost: { gold: 400, lumber: 180 }, buildTime: 110, mainHall: true, hallTier: 1, foodProvided: 12, dropoff: ['lumber', 'gold'],
    trains: ['sep_cultist'], upgradesTo: 'sep_ossuary', buildMode: 'summon', blightRadius: 9, noRepair: true, hotkey: 'H', sight: [10, 8],
    model: { kind: 'building', faction: F, variant: 'hall' },
  }),
  building({
    id: 'sep_ossuary', name: 'Ossuary Spire', faction: F, description: 'Unlocks tier two.', hp: 2000, armor: 5, size: 5, cost: { gold: 320, lumber: 210 }, buildTime: 120, mainHall: true, hallTier: 2, foodProvided: 12,
    dropoff: ['lumber', 'gold'], trains: ['sep_cultist'], upgradesTo: 'sep_citadel', buildMode: 'summon', blightRadius: 9, noRepair: true, buildable: false, requires: ['sep_barrow'], sight: [11, 8],
    model: { kind: 'building', faction: F, variant: 'keep' },
  }),
  building({
    id: 'sep_citadel', name: 'Necrotic Citadel', faction: F, description: 'Unlocks tier three.', hp: 2500, armor: 6, size: 5, cost: { gold: 360, lumber: 230 }, buildTime: 135, mainHall: true, hallTier: 3, foodProvided: 12,
    dropoff: ['lumber', 'gold'], trains: ['sep_cultist'], buildMode: 'summon', blightRadius: 9, noRepair: true, buildable: false, requires: ['sep_altar'], sight: [12, 9],
    model: { kind: 'building', faction: F, variant: 'citadel' },
  }),
  building({
    id: 'sep_lode', name: 'Cursed Lode', faction: F, description: 'Summoned over a gold mine. Cultists channel gold from it without carrying it home.',
    hp: 900, armor: 5, size: 3, cost: { gold: 250, lumber: 0 }, buildTime: 30, onMine: true, buildMode: 'summon', blightRadius: 5, noRepair: true, hotkey: 'C',
    model: { kind: 'building', faction: F, variant: 'lode' },
  }),
  bld({
    id: 'sep_obelisk', name: 'Grave Obelisk', faction: F, description: 'Provides 8 food and spreads blight. Can be awakened into a defensive tower.',
    hp: 550, armor: 3, size: 2, cost: { gold: 150, lumber: 0 }, buildTime: 35, foodProvided: 8, blightRadius: 6, upgradeOptions: ['sep_obelisk_spirit', 'sep_obelisk_bone'], hotkey: 'O',
    model: { kind: 'building', faction: F, variant: 'farm' },
  }),
  bld({
    id: 'sep_obelisk_spirit', name: 'Spirit Obelisk', faction: F, description: 'Provides 8 food. Fires bolts of soul energy at ground and air units.', hp: 650, armor: 5, size: 2, cost: { gold: 120, lumber: 80 }, buildTime: 30, foodProvided: 8, blightRadius: 6, buildable: false,
    weapon: missile([22, 27], 7, 'magic', orb(GLOW, 14), 1.1), sight: [11, 9], tags: { detector: true }, model: { kind: 'building', faction: F, variant: 'towerArcane' },
  }),
  bld({
    id: 'sep_obelisk_bone', name: 'Bone Obelisk', faction: F, description: 'Provides 8 food. Launches bone shards, effective against air units.', hp: 650, armor: 5, size: 2, cost: { gold: 100, lumber: 40 }, buildTime: 30, foodProvided: 8, blightRadius: 6, buildable: false, requires: ['sep_boneyard'],
    weapon: missile([24, 28], 7.5, 'pierce', { kind: 'bone', speed: 18 }, 1.0, { targets: { air: true, ground: false, structure: false } }), sight: [12, 10], tags: { detector: true }, model: { kind: 'building', faction: F, variant: 'towerArrow' },
  }),
  bld({
    id: 'sep_barrow', name: 'Barrow', faction: F, description: 'Raises Gravediggers, Bone Archers, Barrow Riders and Rotwings.', hp: 1200, size: 4, cost: { gold: 200, lumber: 50 }, buildTime: 60,
    trains: ['sep_gravedigger', 'sep_archer', 'sep_rider', 'sep_rotwing'], researches: ['sep_up_ghoulspeed'], hotkey: 'B', model: { kind: 'building', faction: F, variant: 'barracks' },
  }),
  bld({
    id: 'sep_boneyard', name: 'Boneyard', faction: F, description: 'Receives lumber. Researches weapon and armor improvements.', hp: 950, size: 3, cost: { gold: 215, lumber: 0 }, buildTime: 50, dropoff: ['lumber'],
    researches: ['sep_up_melee', 'sep_up_ranged', 'sep_up_armor', 'sep_up_wither'], hotkey: 'Y', model: { kind: 'building', faction: F, variant: 'smith' },
  }),
  bld({
    id: 'sep_altar', name: 'Altar of Souls', faction: F, description: 'Summons and revives heroes.', hp: 900, size: 3, cost: { gold: 180, lumber: 50 }, buildTime: 55, isAltar: true,
    trains: ['sep_h_gravelord', 'sep_h_witch', 'sep_h_shadowblade'], hotkey: 'A', model: { kind: 'building', faction: F, variant: 'altar' },
  }),
  bld({
    id: 'sep_shrine', name: 'Shrine of Whispers', faction: F, description: 'Trains Necromancers and Hexwraiths.', hp: 1000, size: 3, cost: { gold: 150, lumber: 150 }, buildTime: 60, requires: ['tier2'],
    trains: ['sep_necro', 'sep_hexwraith'], researches: ['sep_up_necro', 'sep_up_hex'], advanced: true, hotkey: 'W', model: { kind: 'building', faction: F, variant: 'academy' },
  }),
  bld({
    id: 'sep_forge', name: 'Bone Forge', faction: F, description: 'Builds Plague Carts and Bone Colossi.', hp: 1100, size: 4, cost: { gold: 140, lumber: 135 }, buildTime: 60, requires: ['tier2', 'sep_boneyard'],
    trains: ['sep_cart', 'sep_colossus'], researches: ['sep_up_miasma'], advanced: true, hotkey: 'F', model: { kind: 'building', faction: F, variant: 'workshop' },
  }),
  bld({
    id: 'sep_rift', name: 'Abyssal Rift', faction: F, description: 'Calls Shadow Mantas from the abyss.', hp: 1100, size: 4, cost: { gold: 160, lumber: 200 }, buildTime: 65, requires: ['tier3'],
    trains: ['sep_manta'], advanced: true, hotkey: 'R', model: { kind: 'building', faction: F, variant: 'aerie' },
  }),
  bld({
    id: 'sep_vault', name: 'Relic Vault', faction: F, description: 'Sells potions, scrolls and dark relics to nearby heroes.', hp: 700, size: 3, cost: { gold: 130, lumber: 30 }, buildTime: 50,
    shopItems: ['item_heal', 'item_mana', 'item_homeward', 'item_dust', 'item_ward', 'item_mending', 'item_moonstone'], advanced: true, hotkey: 'V', model: { kind: 'building', faction: F, variant: 'shop' },
  }),
]);

regFaction({
  id: F,
  name: 'Sepulchral Conclave',
  adjective: 'Conclave',
  description: 'A necromantic realm of the restless dead. Summons its buildings, spreads blight and turns corpses into new soldiers.',
  color: 0x3ec98a,
  worker: 'sep_cultist',
  hall: 'sep_spire',
  goldStructure: 'sep_lode',
  startUnits: [
    { id: 'sep_cultist', count: 3 },
    { id: 'sep_gravedigger', count: 1 },
  ],
  heroes: ['sep_h_gravelord', 'sep_h_witch', 'sep_h_shadowblade'],
  altar: 'sep_altar',
  farm: 'sep_obelisk',
  shop: 'sep_vault',
  tower: 'sep_obelisk',
  barracks: 'sep_barrow',
  lumberDropoff: 'sep_boneyard',
  traits: ['Cultists summon buildings that rise on their own', 'Must build on blight; undead heal on blight', 'Gravediggers harvest lumber and fight', 'Corpses fuel necromancy'],
});
