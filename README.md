# Opuscraft

A fantasy real-time strategy game for the browser, with RPG heroes, four asymmetric factions, neutral creeps and a day/night cycle. It runs entirely client-side: TypeScript, Three.js, synthesized audio and procedurally built low-poly models. There are no image or sound files.

Opuscraft is built from the design document *"A Complete Guide to a Fantasy Real-Time Strategy Game"*. It implements that document's systems: a gold and lumber economy, food and upkeep, three tech tiers, heroes with attributes, levels, abilities and items, attack and armor types, creeps, taverns and shops, day/night, fog of war, AI opponents, a campaign and skirmish modes.

The four factions keep the document's names (Crown League, Iron Clans, Sepulchral Conclave, Twilight Wardens) and their economic identities. The unit rosters, heroes, abilities, story, maps and visual style were designed new for this game. They are not copies of any existing game.

## Playing

**Quickest way:** open `dist/opuscraft-standalone.html` in a modern browser (Chrome, Edge, Firefox or Safari). It is a single self-contained file with no install and no server.

`dist/index.html` also works when opened directly. It loads `opuscraft.js` and `style.css` from the same folder.

A mouse and keyboard are expected. Use a window of at least about 1280×720.

### Modes

- **Campaign:** five missions that tell one story across all four factions. Each mission has scripted dialogue, objectives and its own map setup.
  1. *Embers on the Border* (Crown League)
  2. *The Shard Road* (Crown League)
  3. *Hunger of the Clans* (Iron Clans)
  4. *Roots of Night* (Twilight Wardens)
  5. *Dawn of Four Banners* (Crown League with Twilight allies)
- **Skirmish:** 1v1 up to 4-player free-for-all or 2v2 against computer opponents (Easy, Normal or Hard), on six maps:

  | Map | Size | Players | Notes |
  |---|---|---|---|
  | Thornvale Crossing | 112 | 2 | Wooded vale, inn on the central hill |
  | Frostfang Pass | 120 | 2 | Highland bases above a frozen river, narrow ramps |
  | Ashkar Badlands | 112 | 2 | Open canyons and oases |
  | Emberfall | 120 | 2 | Highland bases over burning rivers |
  | Four Banners | 144 | 4 | Rich shared heartland, good for FFA or 2v2 |
  | Mirefen Hollows | 144 | 4 | Swamp with a dragon at its heart |

  You can also spectate AI-only games.

### Rules at a glance

- Start with 500 gold, 150 lumber, a main hall and your faction's workers (five for most factions; the Sepulchral Conclave starts with three Cultists, one Gravedigger and a Cursed Lode already on its mine). Gold comes from mines and lumber from trees.
- Food structures raise your army limit, up to 100. **Upkeep** reduces the gold your workers deliver: 0–50 food 100%, 51–80 food 70%, 81–100 food 40%.
- Three tiers (upgrade your main hall) unlock buildings, units and research.
- **Heroes:** your first hero is free. A second needs tier 2 and a third needs tier 3. Heroes have Strength, Agility and Intelligence and reach level 10. Each has three abilities with three ranks, plus an ultimate at level 6, and six inventory slots. Fallen heroes are revived at an altar or at an inn.
- **Combat:** six attack types against six armor types, with a full damage table. Spells, auras, buffs, stuns, summons, invisibility and detection, and air and ground targeting are all supported.
- **World:** neutral creep camps guard mines and treasure, drop items and sleep at night. The map also has taverns (hire neutral heroes, revive), travelling merchants, mercenary camps, and fountains of health and mana.
- **Day/night:** sight shrinks at night. Some units have night-specific traits.
- **Fog of war:** per-team vision, with high ground blocking sight from below. Buildings are remembered as ghosts once seen.
- **Victory:** destroy all enemy buildings.

### Factions

| Faction | Economy and identity |
|---|---|
| **Crown League** | Several Peasants can build one structure together. Call to Arms turns Peasants into Militia. Towers specialize into arrow, cannon or arcane towers. Disciplined combined arms. |
| **Iron Clans** | Clanhands build from inside structures and can shelter in Longhouses to throw spears. Tough melee, wolves and beasts, shamans and totems. |
| **Sepulchral Conclave** | Cultists summon buildings, which rise on their own but must stand on blight. Gold is channeled from a Cursed Lode raised on a mine, and Gravediggers cut lumber. Corpses fuel necromancy. |
| **Twilight Wardens** | Forest Spirits gather lumber without felling trees and draw gold from mines bound to the Heart of the Forest. Ancients can uproot and walk. Units heal faster at night, and Archers hide at night while standing still. |

### Controls

The in-game menu (F10 or Esc) has a full **How to Play** page. The essentials:

| Input | Action |
|---|---|
| Left click / drag | Select. Box-select up to 12 units. Shift adds or removes. Double-click or Ctrl+click selects all units of that type on screen. |
| Right click | Smart order: move, attack, gather, repair, follow, pick up items. With a building selected, sets the rally point. Shift queues orders. |
| Wheel / middle drag / screen edges / arrow keys | Zoom and pan the camera. |
| M S H A P | Move, Stop, Hold, Attack-move, Patrol |
| Q W E R | Abilities. **L** opens the hero skill menu. |
| Z X C V B N | Use hero inventory items 1–6 |
| Ctrl+0–9 / 0–9 | Assign or select control groups. Double tap centers the camera. |
| F1 F2 F3 | Select heroes. Double tap centers the camera. |
| Tab | Cycle subgroups in a mixed selection |
| F8 or `.` | Select an idle worker |
| Space / Backspace | Jump to the last alert / your main hall |
| Alt | Show all health bars |
| + / − / Pause | Change game speed / pause (single player) |

Buildings and build menus use the command card grid keys (Q W E R / A S D F / Z X C V).

### Options

Separate volume for master, music, effects and voices. Toggle voice lines and shadows. Set render quality and resolution scale, edge scrolling, scroll speed, always-on health bars and game speed. Settings and campaign progress are saved in the browser's local storage.

## Building from source

Requires Node.js 18 or newer.

```bash
npm install
```

```bash
npm run build
```

This writes `dist/index.html`, `dist/opuscraft.js`, `dist/style.css` and the single-file `dist/opuscraft-standalone.html`.

```bash
npm run dev
```

This serves the game at http://localhost:8080 and rebuilds on change.

```bash
npm run typecheck
```

```bash
npm test
```

`npm test` validates all game data and runs headless AI-vs-AI games.

### Headless tests and tools

The simulation has no rendering dependencies, so whole games run in Node:

```bash
node tools/build.mjs --tests
```

```bash
node dist-tests/simtest.js crown iron thornvale normal hard 3
```

That command runs one game with a two-minute status log. Other modes of the same script: `all` plays every faction pairing once, `ffa` plays a 4-player free-for-all, and `balance thornvale,ashkar 4` runs a round robin with several seeds per pairing and tallies wins per faction.

Browser tools use the pre-installed Playwright:

- `node tools/shot.cjs "<query>" out.png [waitMs]` takes a screenshot of the built game.
- `node tools/playtest.cjs <outDir> <faction>` runs a scripted play-test of hero training, skills, casting, shops, items and revival through the real keyboard and mouse input.

Debug URL parameters for `dist/index.html`:

- `?quick&f=crown&e=iron&map=thornvale` starts a skirmish immediately.
- `?spectate&t=600&reveal` starts an AI-vs-AI game fast-forwarded by 600 seconds, with the map revealed.
- `?mission=m3` starts a campaign mission.
- `?gallery=crown` shows every unit model of a faction. Add `&b` for buildings, or use `gallery=neutral` for creeps.

## Technical notes

- **Refresh-rate independent:** the simulation runs at a fixed 20 ticks per second, deterministically and with seeded randomness. Rendering interpolates between ticks. Camera motion, animation and effects use frame-time-based smoothing, and music is scheduled on the audio clock, so the game plays the same at 30, 60, 144 or 240 Hz.
- **Simulation:** grid A* pathfinding with clearance for large units, line-of-sight path smoothing, spatial hashing and soft collisions. A data-driven registry of units, buildings, abilities, buffs, upgrades and items is validated at startup.
- **AI:** faction build orders, worker economy and expansions, creeping with heroes, army composition, attack waves, defense, retreating when outmatched, hero retreat and potion use, and ability casting. Easy, Normal and Hard differ in reaction speed, worker count, attack timing, expansion, casting frequency and focus fire.
- **Rendering:** Three.js with procedurally generated low-poly models and part-based rig animation. Terrain has height, cliffs and ramps, water, instanced trees and doodads. Also included: fog-of-war shading, particles, projectile and spell effects, an offscreen portrait renderer and a dynamic sun for day/night.
- **Audio:** all sound effects and the procedural faction music are synthesized with WebAudio. Unit acknowledgements use the browser's speech synthesis when available.

### Project layout

```
src/
  data/       factions, units, heroes, abilities, items, creeps, rules and damage table
  sim/        deterministic simulation: world, orders, combat, economy, heroes, vision, map generation
  ai/         computer opponent
  render/     Three.js renderer, models, terrain, effects, camera
  ui/         HUD, command card, menus, options, icons, portraits, input
  audio/      synthesized sound and music
  campaign/   campaign missions and scripts
  game.ts     game session (fixed-step loop, event routing)
  main.ts     app entry: menus, skirmish, campaign flow
tests/        headless simulation and campaign tests
tools/        build script, screenshot and play-test tools
```

## Not included

- **Online multiplayer:** all games are local against the computer. The deterministic lockstep-friendly simulation would be the base for it.
- **Map editor:** maps are generated from presets by `src/sim/mapgen.ts`.
- **Save/load in the middle of a match.**

## License

GPL-3.0. See [LICENSE](LICENSE).
