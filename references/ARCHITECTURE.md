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
| `src/entities/Thief.ts` / `Cop.ts` | Role-specific AI drivers |
| `src/core/Camera.ts` | Smooth follow camera (thief-centered) |
| `src/map/ChunkWorld.ts` | Infinite chunk streaming + grid tiles |
| `src/map/biomes.ts` | City / desert / rural chunk generators |
| `src/map/gridCollision.ts` | Solid walls + raycasts (no Matter buildings) |
| `src/map/Pathfinding.ts` | Bounded A\* (road-preferring) + ambush helper |
| `src/map/RoadSpill.ts` | 20s spill events (−50% traction) |
| `src/ai/SteeringBehaviors.ts` | Path follow + feeler avoid / open-lane probe |
| `src/ai/CopManager.ts` | Spawn cadence, roles, +5% speed compounding |
| `src/ui/*` | Setup overlay, HUD, game-over |
| `src/llm/*` | WebLLM worker + JSON config parser |
| `src/config/GameConfig.ts` | Tunables, colors, difficulty presets |

## Data flow

1. Setup overlay → `MatchSettings` (mode, difficulty, biome, seed, configs).
2. `Game.startMatch` builds Matter world + `ChunkWorld`, spawns thief + lead cop near origin.
3. Each fixed tick: stream chunks → camera → CopManager / spills → AI
   (`followPath` + avoid) → `integrateControls` → Matter step → zero spin →
   grid wall resolve → catch-distance check.
4. Distance `thief`↔`cop` < catch radius → game over + survival metrics.

See also [WORLD.md](WORLD.md).

## Cop roles (cycle)

0. **Lead** — seek thief position  
1. **Flank** — intercept `P + V·lookahead`  
2. **Ambush** — nearest street intersection ahead of thief velocity  

Further cops cycle these roles. Every 30s: spawn + multiply all cop speeds by 1.05.
