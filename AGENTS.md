# auto-crash — Agent Guide

This file is the persistent memory for AI agents working in this repo. Read it at
the start of every task, and keep it up to date as described in the loop below.

## Blueprint / Source of Truth (READ FIRST)

Before starting **any** task, read [references/BLUEPRINT.MD](references/BLUEPRINT.MD).
It is the authoritative system-design spec for this project — it defines the
expectations, mechanics, math, visual philosophy, performance budget, and quality
parameters. When this guide or your own reasoning conflicts with the blueprint,
**the blueprint wins** (unless the user explicitly overrides it in the current task).

Supporting architecture notes: [references/ARCHITECTURE.md](references/ARCHITECTURE.md)

- All agent-facing documentation lives in the [`references/`](references/) folder
  (the blueprint, per-section design notes, decision logs, etc.).
- This `AGENTS.md` stays at the repo root as the **index** — it must remain here so
  it auto-loads. It points to the docs in `references/`; it does not get moved.
- `README.md` stays at the root as the human-facing setup/run doc.

## Living Documentation Loop (ALWAYS follow)

On **every** prompt, before finishing your turn, run this check:

1. **Detect new knowledge.** Ask yourself: did this prompt introduce or change any
   of the following?
   - A new rule, convention, or constraint the user wants followed.
   - A change to an existing rule (the user corrected or updated something).
   - A design/architecture decision (e.g. "this section will be built like X").
   - A structural choice about how the project is organized (folders, modules,
     naming, tech stack, data flow, etc.).
   - Any reasoning or "sense of logic" a future agent would need to stay consistent.

2. **Sync the docs.** If any of the above is true, update the relevant `.md`
   file(s) in the same turn as you make the code change — do not defer it:
   - Project-wide rules, conventions, and decisions → this `AGENTS.md` (root index).
   - Detailed design notes for a specific area → the section's own doc under
     [`references/`](references/) (e.g. `references/<area>.md`; create it if it
     doesn't exist) and link it from the
     [Architecture & Decisions](#architecture--decisions) section below.
   - A change to the spec/expectations → `references/BLUEPRINT.MD`.
   - User-facing usage/setup info → `README.md`.

   All agent-facing docs (everything except the root `AGENTS.md` and `README.md`)
   belong in `references/`.

3. **Keep it consistent.** If a new instruction contradicts something already
   written here, update the old entry instead of appending a duplicate, and note
   what changed. The `.md` files must always reflect the current intended state
   of the project.

4. **Record the "why", not just the "what".** When you capture a decision, include
   the reasoning behind it so future agents follow the same logic rather than
   re-deriving (or breaking) it.

> Rule of thumb: if a future agent could get the project wrong by *not* knowing
> something the user just told you, write it down here.

## Project Overview

**Synchronized Chase** is a 100% client-side top-down AI chase game. The player is
a Tuner/Strategist: they pick Thief or Cop mode, configure steering scalars
(manually or via local WebLLM from natural language), then watch AI-driven cars
in an **infinite streaming world** (city / desert / rural biomes). Matter.js
handles rigid-body physics; Canvas 2D paints wireframe neon visuals with a
camera that follows the thief.

Run: `npm install && npm run dev`

## Conventions & Rules

- TypeScript + Vite ES modules; keep game logic in `src/` modular folders.
- Physics forces / collisions go through Matter.js (`src/physics/world.ts`).
- Behavior config ranges are always clamped to `[0, 1]` (+ `pathStyle` enum).
- Prefer seeded PRNG (`src/core/rng.ts`) for anything that must be replayable.
- Visuals: dark `#0d1117` background, grid `#1f242c`, green neon thief, pulsing
  red/blue cops (see blueprint §6).
- Physics update block target budget: **&lt; 4 ms**.
- WebLLM runs only in a Web Worker; never block the animation thread. Manual
  sliders must keep working if WebGPU/model load fails.
- Do not invent a `docs/` folder — use `references/`.

## Architecture & Decisions

<!--
Append an entry each time a design/structural decision is made. Format:

### <Area / Section name>
- **Decision:** what was chosen.
- **Why:** the reasoning / constraints behind it.
- **Date:** YYYY-MM-DD.
- **Details:** link to references/<area>.md if a deeper note exists.
-->

### Documentation layout
- **Decision:** `references/BLUEPRINT.MD` is the source of truth; `AGENTS.md` stays
  at the root as the auto-loading index; all other agent docs live in `references/`.
- **Why:** Cursor only auto-loads a root `AGENTS.md`, so it must stay put as the
  entry point, while a single `references/` folder keeps all spec/design docs
  discoverable in one place and avoids scattering knowledge.
- **Date:** 2026-07-18.
- **Details:** [references/BLUEPRINT.MD](references/BLUEPRINT.MD).

### Physics core
- **Decision:** Use **Matter.js for cars only** (drive forces, car–car capture
  collisions). **Buildings are NOT Matter bodies** — wall collision / avoidance
  use cheap grid tests (`gridCollision.ts`). Lateral grip/drift still applied
  manually per blueprint 4.2 on car bodies.
- **Why:** A city chunk is mostly BLOCK cells; registering each as a static
  Matter body created thousands of colliders and froze the browser on Start.
  Grid collision keeps the `< 4 ms` budget while Matter still handles the chase
  capture interaction.
- **Date:** 2026-07-18.

### Tooling & control model
- **Decision:** TypeScript + Vite; AI-vs-AI simulation (no keyboard driving).
- **Why:** Type safety for vector/AI math and HMR during iteration; the slider +
  WebLLM tuner fantasy matches the blueprint's strategist role better than
  direct WASD control.
- **Date:** 2026-07-18.
- **Details:** [references/ARCHITECTURE.md](references/ARCHITECTURE.md).

### WebLLM integration
- **Decision:** `@mlc-ai/web-llm` with `SmolLM2-360M-Instruct-q4f16_1-MLC` via
  `CreateWebWorkerMLCEngine`; JSON-mode parse into behavior scalars; dynamic
  import so the main game bundle stays light; graceful fallback to manual sliders.
- **Why:** Keeps model download/inference off the animation thread; WebGPU may be
  unavailable so the game must remain playable without LLM.
- **Date:** 2026-07-18.

### Map & randomization
- **Decision:** Infinite **chunked** world (`ChunkWorld`) with biomes (city roads /
  junctions / bridges, desert open terrain, rural winding tracks); difficulty as
  density presets; road spills every 20s (−50% traction); gaussian angular jitter
  scaled by `(1 - driftStability) * 0.05`. Camera follows the thief.
- **Why:** A fixed screen-sized map made cars leave the viewport and feel like
  they “vanished”; infinite streaming matches a real 2D chase world. Biomes give
  distinct navigation fantasies (roads vs open sand).
- **Date:** 2026-07-18.
- **Details:** [references/WORLD.md](references/WORLD.md).

### Chase AI feel
- **Decision:** Arcade car model — throttle + desired heading with **limited turn
  rate** (no free spin), lateral grip/drift from `driftStability`, hard grid
  wall collisions (push-out + speed kill). Cops/thief **A\*** around buildings,
  long feelers + lane-center pull to **avoid** walls before impact. Top speed
  ~58 px/s. Thief proximity glow/flee radius is **2×** cop sense. New cops
  spawn on a timer until the cap; existing cops only teleport if truly lost
  (very far) or wedged motionless for several seconds — not while cornering.
- **Why:** Earlier velocity-blend + high angularVelocity made cars spin and
  clip through the map; real chase needs walls, corners, and readable speed.
- **Date:** 2026-07-18.

### Map variety
- **Decision:** City is the only enabled biome on the setup screen
  (`ENABLED_BIOMES = ['city']`); desert/rural generators stay in code but
  buttons are disabled. City look: black roads, white curbs + dashed lane
  marks, zebra junctions, blue rivers, bridge decks, random rect buildings
  (`cityRender.ts`).
- **Why:** Previous tile paint made roads/buildings/rivers indistinguishable;
  clear asphalt language is required for a readable chase. Other biomes return later.
- **Date:** 2026-07-18.
- **Details:** [references/WORLD.md](references/WORLD.md).

## Changelog of Learnings

<!-- Short running log so the sync history is visible at a glance. -->
- 2026-07-18: Established doc convention — blueprint is source of truth, `AGENTS.md`
  is the root index, all other agent docs live in `references/`.
- 2026-07-18: Chose Matter.js as the physics core (over custom vector kinematics).
- 2026-07-18: Implemented Phases 1–6 (physics, map/A*, steering, modes/cop sync,
  WebLLM worker, seeded maps/spills/jitter). Prebuilt model id suffix is `-MLC`.
- 2026-07-18: Replaced static viewport map with infinite chunk world + camera;
  added city/desert/rural biomes; fixed cop chase/spawn and thief evasion AI;
  proximity glow circles.
- 2026-07-18: Fixed tab crash — buildings must not be Matter bodies (city has
  thousands of BLOCK cells). Matter is cars-only; grid collision for walls.
- 2026-07-18: Fixed freeze — Matter applyForce blew car positions past
  Number.MAX_SAFE_INTEGER; render `for (col; col<=max; col++)` then never
  terminated. Clamp coords; velocity-blend drive; safe tile loops.
- 2026-07-18: Arcade car rewrite — limited turn rate (no spin), slower top
  speed (~58 px/s), grid walls solid, A\* + sideways feelers around obstacles.
- 2026-07-18: Map variety (variable road width/spacing, open lots, GAP+bridges);
  proactive lane-center avoid; cop stuck/far respawn; thief proximity = 2× cop.
- 2026-07-18: City visual language (asphalt/marks/zebra/river/bridge/rect
  buildings); desert & rural disabled on setup via `ENABLED_BIOMES`.
- 2026-07-18: Junction = true H∩V only (dual-lane was false-positive zebra);
  world-aligned continuous arterials (no stub alleys); off-road speed ~32%.
- 2026-07-18: Dual-lane neighbor test still false-positive’d every cell as
  junction — junctions now use world arterial H∩V (`onCityHorizontal/Vertical`).
