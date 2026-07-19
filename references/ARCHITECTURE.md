# Architecture Notes — Synchronized Chase

## Module map

| Path | Role |
|------|------|
| `src/main.ts` | Entry; mounts canvas + UI root |
| `src/core/Game.ts` | Match lifecycle, update/render orchestration |
| `src/core/GameLoop.ts` | Fixed 60 Hz accumulator via `requestAnimationFrame` |
| `src/core/Vector2.ts` | 2D vector math |
| `src/core/rng.ts` | String-seeded PRNG (xmur3 → mulberry32) + gaussian |
| `src/core/types.ts` | Behavior config, modes, clamp helpers |
| `src/physics/world.ts` | Matter.js engine/world helpers |
| `src/entities/Car.ts` | Arcade car: throttle, turn rate, grip/drift |
| `src/entities/Thief.ts` / `Cop.ts` | Role-specific AI drivers; thief nitro boost |
| `src/core/Camera.ts` | Smooth follow camera (thief-centered) |
| `src/map/ChunkWorld.ts` | Infinite chunk streaming + grid tiles |
| `src/map/biomes.ts` | City / desert / rural chunk generators |
| `src/map/gridCollision.ts` | Solid walls + raycasts (no Matter buildings) |
| `src/map/Pathfinding.ts` | Bounded A\* (road-preferring) + ambush helper |
| `src/map/RoadSpill.ts` | 20s spill events (−50% traction) |
| `src/ai/SteeringBehaviors.ts` | Path follow + feeler avoid / open-lane probe |
| `src/ai/CopManager.ts` | Spawn cadence, roles, radio net, speed compounding |
| `src/ai/CopRadio.ts` | Shared last-known thief contact from visual broadcasts |
| `src/ui/*` | Setup overlay, HUD, game-over |
| `src/llm/*` | WebLLM worker + JSON config parser |
| `src/config/GameConfig.ts` | Tunables, colors, difficulty presets |

## Data flow

1. Setup overlay → `MatchSettings` (mode, difficulty, biome, seed, configs,
   `manual` — Thief-only keyboard drive).
2. `Game.startMatch` builds Matter world + `ChunkWorld`, spawns thief + lead
   cop near origin; attaches `KeyboardInput` when `manual`.
3. Each fixed tick: stream chunks → camera → CopManager / spills → thief
   (AI flee **or** WASD/arrows) + cop AI → `integrateControls` → Matter step →
   zero spin → grid wall resolve → catch-distance check.
4. Distance `thief`↔`cop` < catch radius → game over + survival metrics.

See also [WORLD.md](WORLD.md).

## Cop roles (cycle)

Roles target the **radio last-known** contact (not omniscient live thief coords):

0. **Lead** — seek last-known position  
1. **Flank** — intercept `P + V·lookahead` from last-known  
2. **Ambush** — nearest street intersection ahead of last-known velocity  

Further cops cycle these roles. Spawn timer adds units + compounds speed (capped).

## Cop radio

1. Match start seeds a one-shot **dispatch** ping at the thief spawn.
2. Each tick: any cop inside sense radius with clear grid LOS (`raycastGrid`)
   sets `hasVisual` and broadcasts live thief pos/vel onto `CopRadio`
   (`revision++` when the fix moves).
3. Periodic intel (`radioIntelIntervalSec`) also refreshes the contact.
4. Every cop reads the shared radio. On revision / fresh visual they invalidate
   A* and hard-seek `radio.pos` (snap desired heading so they turn around if
   the fix is behind them). Flank/ambush offsets only while contact is stale.
5. Road discipline via `GAMEPLAY.allowOffRoad`. False → always asphalt.
   True → cops off-road only with thief in cop sense; thief on-road while
   any cop in thief sense. Off-screen catch-up still 2× on asphalt only.
