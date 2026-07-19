# Infinite World & Biomes

## Design

The playfield is an **infinite 2D top-down world**, not a single screen-sized map.

- **Chunks:** 16×16 cells (40px each). Generated on demand around the camera focus.
- **Camera:** Smooth follow on the thief so chase action stays centered.
- **Physics:** Matter.js holds **cars only**. Buildings/rocks use grid collision
  (no static Matter bodies — city BLOCK density would freeze the tab).

## Biomes

| Biome | Status | Look / structure |
|-------|--------|------------------|
| **City** | **Active** (only option on setup) | Black asphalt, white curb + dashed lane split, zebra junctions, blue river band + bridge decks, rectangular buildings |
| **Desert** | Implemented, UI disabled | Open sand + rocks (re-enable later) |
| **Rural** | Implemented, UI disabled | Dirt tracks + fields (re-enable later) |

City paint lives in `src/map/cityRender.ts`. Arterials use **world-aligned**
row/col periods so roads never dead-end at chunk borders. Junctions are only
cells with both E–W and N–S road neighbors (dual-lane parallel neighbors alone
do **not** count — that was painting zebra on whole streets). Rivers are
world-aligned `GAP` bands; vertical roads become `BRIDGE` where they cross.
Buildings are random axis-aligned rects. Off-road (OPEN lots) is still
traversable but capped to ~32% speed so AI stays on asphalt.

Difficulty still scales obstacle density / AI presets.

## Why cops used to vanish

1. No camera — cars left the fixed viewport and looked “gone”.
2. Spawns were on the static map rim, far from the thief.
3. Drive forces were too weak vs Matter air friction, so steering felt random / stalled.

Fixes: camera follow, spawn around the thief at ~camera-edge distance, arcade
drive + A\* pathing around buildings, feeler-based sideways avoid.

## Crash fix (Matter + buildings)

City chunks are mostly `BLOCK` cells. Registering each as a Matter static body
(~thousands per screen) froze the tab on Start.

**Current approach:**
- Matter.js holds car bodies; drive is **arcade** (throttle + limited turn rate +
  lateral grip). Never `applyForce` for thrust (that blew positions into 1e16+).
- Car inertia is infinite; angular velocity is forced to 0 each frame (no spin).
- Buildings use **grid collision** / raycasts; A\* routes around `BLOCK` cells
  and prefers roads. Feelers steer sideways when the nose is blocked.
- Capture is a distance check after the physics step (not a Matter collision
  callback mid-update).
- Tile render loops clamp to safe integer ranges. If cell indices exceed
  `Number.MAX_SAFE_INTEGER`, `col++` can stop advancing and freeze the tab.
