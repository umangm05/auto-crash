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

**Auto Crash Chase** is a 100% client-side top-down chase game. The player
configures the Thief (AI or Manual with WASD / arrows), picks traffic density,
and survives as cops close in through civic traffic. Cop playable mode is
coming soon. Infinite streaming world (city / desert / rural biomes). Matter.js
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
- **Decision:** TypeScript + Vite; Thief-only playable mode (Cop = coming soon).
  Optional **Manual** thief drive (WASD / arrows, Space = nitro). Setup
  **Traffic** (Light/Moderate/Heavy) replaces old building-density Difficulty.
- **Why:** Roads-only chase made “open/dense buildings” meaningless; traffic is
  the readable difficulty axis. Cop mode deferred until that fantasy is ready.
- **Date:** 2026-07-20 (traffic + rename; manual 2026-07-19).
- **Details:** [references/ARCHITECTURE.md](references/ARCHITECTURE.md).

### Civic traffic
- **Decision:** Two-way lanes via `trafficLanes.ts`. Horizontal roads: north
  half → left/west, south half → right/east. Vertical: west half → up/north,
  east half → down/south. Cars stay on their lane centerline; mid-block only
  that direction. Junctions: one turn roll onto a legal exit lane. Follow/brake
  within the same lane stream; curb recover snaps back onto a lane.
- **Why:** Free cardinal picks ignored road orientation and looked random;
  opposing traffic needs separated halves so streams don’t head-on in one groove.
- **Date:** 2026-07-20.

### WebLLM integration
- **Decision:** `@mlc-ai/web-llm` with `SmolLM2-360M-Instruct-q4f16_1-MLC` via
  `CreateWebWorkerMLCEngine`; JSON-mode parse into behavior scalars; dynamic
  import so the main game bundle stays light; graceful fallback to manual sliders.
  **UI prompt is temporarily commented out** in `SetupOverlay` (sliders only);
  wire + `runLlm` kept as comments for easy restore.
- **Why:** Keeps model download/inference off the animation thread; WebGPU may be
  unavailable so the game must remain playable without LLM. Prompt hidden for
  now so first-time setup stays focused on match options + how-to-play.
- **Date:** 2026-07-18 (UI paused 2026-07-20).

### Setup onboarding
- **Decision:** Setup modal always shows a one-line pitch + permanent **How to
  play** card. First visit also shows a dismissible intro (`localStorage`
  `acc-intro-seen-v1`); starting a match marks it seen.
- **Why:** New players otherwise land on tuners with no frame for what the game
  is or whether to pick AI vs Manual.
- **Date:** 2026-07-20.

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

### Cop roads-only chase
- **Decision:** With `allowOffRoad: false`, cops path on asphalt only. Heading
  commits use the next A* waypoint — never crow-flies radio through lots.
  Chase uses the live thief position, aggressive throttle, and chunk prefetch
  under each cop. Off-screen units get edge-of-screen markers. Each cop rolls
  a seeded `HandlingFeel` (turn/grip/accel/speed/brake + silhouette/siren).
- **Why:** Direct snaps at the thief pointed into curbs/buildings and left cops
  wedged; slow corner throttle + missing chunks made packs never close. Edge
  markers give the thief directional awareness without omniscient minimap clutter.
  Handling noise stops the pack looking/driving like one cloned vehicle.
- **Date:** 2026-07-19.

### Chase AI feel
- **Decision:** Arcade car model — throttle + desired heading with **limited turn
  rate** (no free spin), lateral grip/drift from `driftStability`, hard grid
  wall collisions (push-out + speed kill). Cops/thief **A\*** around buildings,
  long feelers + lane-center pull to **avoid** walls before impact. Top speed
  ~58 px/s. Throttle ∈ [-1, 1]: negative = brake (scrubs forward speed, no
  reverse). Brakes are **emergency-only** — about-to-hit wall, or closing
  hard on another car ahead (thief↔cop / cop↔cop). Not used for ordinary
  corners. Thief baseline top speed is **1.1×** a base cop
  (`GAMEPLAY.thiefSpeedMult`); cops still escalate via spawn cycles. Thief
  **nitro**: AI pops a **1s** boost at **1.5×** thief speed when cops are in
  the flee band, then **5s** refill. Engagement applies a forward kick +
  `nitroAccelScale` and full throttle (emergency car-brake is skipped while
  boosting so the speedup is visible). Thief proximity glow/flee radius is
  **2×** cop sense. AI thief must change route at least every
  `thiefMaxStraightSec` (10s) of near-straight driving — forced side cut so
  single-axis cruises don’t make the chase monotonous (Manual ignores this).
  New cops spawn on a timer until the cap. Cops **stay on roads** (roads-only
  A* + near-zero lot speed) unless the thief is inside their sense radius,
  then they may cut off-road. Off-screen catch-up is still 2× only on asphalt
  (no teleport). Wedged cops only face the radio fix.
- **Why:** Earlier velocity-blend + high angularVelocity made cars spin and
  clip through the map; real chase needs walls, corners, and readable speed.
- **Date:** 2026-07-18 (route-variety cap 2026-07-19).

### Cop radio net
- **Decision:** Cops do not omnisciently track the live thief. Match start seeds
  a dispatch ping; thereafter any cop with sense-radius + clear grid LOS
  broadcasts pos/vel on `CopRadio` (`revision` bumps on meaningful moves).
  Every cop reads the shared radio; on each revision they invalidate A* and
  hard-lock toward `radio.pos` (U-turn if the fix is behind them). Periodic
  intel (`radioIntelIntervalSec`) also refreshes the contact. Soft flank /
  ambush offsets only apply while the contact is stale.
- **Why:** Blueprint §4.3; a visual must make the whole pack turn onto the
  fix instead of continuing a stale forward path.
- **Date:** 2026-07-18.
- **Details:** [references/ARCHITECTURE.md](references/ARCHITECTURE.md).

### Road discipline (cops vs thief)
- **Decision:** Master switch `GAMEPLAY.allowOffRoad`. When **false**, thief
  and cops are always roads-only. When **true**, sense-gated rules apply:
  cops may leave asphalt only with the thief in *their* sense; thief must
  stay on road while any cop is in *thief* sense. Roads-only pathing never
  falls back to lot shortcuts. Off-screen cop catch-up still uses
  `offScreenSpeedMult` (2×) only on asphalt; no teleport.
- **Why:** Under pressure both sides stay on the street grid; the global flag
  lets you lock the chase to asphalt entirely when lot cuts feel broken.
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
- 2026-07-18: Brown band was over-painted `BRIDGE` (whole river). Bridges are
  short V-street spans; city layout is irregular superblock streets + diagonal.
- 2026-07-18: Zebra only on true 4-way / T (arm-count, dual-lane skipped).
  T-junctions from world-space arterial arm breaks (~38% of crosses).
- 2026-07-18: Reverted arm-cutting / diagonal (they shredded roads). Continuous
  arterials again; one zebra rect per H∩V cross via `collectIntersections`.
- 2026-07-18: Fewer roads (SUPER 36), denser buildings, sparse RAIL barriers;
  thief force-turns when straight too long. Cops spawn randomly on a ring
  (ahead-of-heading spawn reverted).
- 2026-07-18: Cop radio — visual LOS broadcasts last-known thief pos/vel to
  all units (`src/ai/CopRadio.ts`); pack no longer omniscient. Auto intel
  refresh every 40s (`radioIntelIntervalSec`).
- 2026-07-18: Thief speed set to 1.1× baseline cop (`thiefSpeedMult`).
- 2026-07-18: Thief nitro — 1s at 1.5× speed, 5s refill; AI fires under threat.
- 2026-07-18: Car braking — full `setBrake` / negative throttle; emergency-only
  (imminent wall or car-ahead), not for ordinary turns.
- 2026-07-18: Radio revision retarget — cops U-turn onto new fixes; off-screen
  cops get 2× speed instead of teleport respawn.
- 2026-07-18: Off-screen cops roads-only chase — A* rejects lots, recover to
  asphalt first, 2× only on road, ban off-road crawl.
- 2026-07-18: Cops always roads-only unless thief is in their sense radius.
- 2026-07-18: Thief frontal evade — when a cop is ahead, cut sideways/reverse
  (no brake+nitro into the threat).
- 2026-07-18: Nitro actually accelerates — kick + accelScale + full throttle;
  skip emergency brake while boosting.
- 2026-07-18: Thief roads-only while any cop is in their sense radius
  (opposite of cop off-road rule).
- 2026-07-18: `GAMEPLAY.allowOffRoad` master switch (default false = always
  asphalt); roads-only pathing no longer shortcuts through lots.
- 2026-07-18: Fixed off-road ban — Car no longer floors surface at 0.15;
  roads-only treats lots as walls (no teleport respawn loop). Larger spills
  (`spillRadiusCells` ~2.4).
- 2026-07-19: Multi-lane markings — dashed dividers between every lane on
  2–3 wide arterials (majors are 3 lanes); city chunk seed bumped to v8.
- 2026-07-19: Fixed cops not chasing on-screen — roads-only feelers treated
  lots as walls and curb-braked forever; feelers are buildings-only again,
  wider A*, radio snap restored.
- 2026-07-19: Thief flee rewrite — road-axis escapes (no curb dive), turn
  away from danger before nitro, sense-radius threats always commit evade.
- 2026-07-19: Thief curb scrapes — feelers ignore lots (so cops don't
  curb-brake), so thief had no lane-center pull vs asphalt walls; hard
  evade snaps also aimed into the roadside. Added `keepCenteredOnRoad`,
  blended evade turns, and escape scoring that prefers strip midline.
- 2026-07-19: Manual thief control — setup AI/Manual toggle (Thief only);
  WASD / arrows via `KeyboardInput`; Space fires nitro (same cooldown);
  skips flee AI + auto-nitro.
- 2026-07-19: Cops stuck on curbs — `snapTowardRadio` aimed crow-flies at the
  thief through lots, overriding A* road paths. Roads-only cops now snap to
  the next waypoint; A* reconstruct/search widened; empty-path uses road-axis
  probes; faster asphalt unwedge.
- 2026-07-19: Aggressive cop chase — path to live thief, chase throttle,
  prefetch chunks under off-screen cops, higher off-screen speed. Screen-edge
  pulsing markers (`OffscreenMarkers.ts`) show off-screen cop directions.
- 2026-07-19: Thief AI max straight `thiefMaxStraightSec` (10s) — forced
  side-route change so single-axis cruises don't make the chase monotonous.
- 2026-07-19: Nitro was `0.8×` (slower) + evade brakes fought the boost —
  restored `1.5×` + full throttle while burning. HUD `COP ×` is pack
  escalation (+3%/spawn), not world speed. Axis timer only resets on E-W↔N-S
  flip + hard perpendicular goal. Road rarity 40/20/20/20
  (2-lane / 4-lane / 1-lane / bridge); city seed v9.
- 2026-07-19: Per-cop `HandlingFeel` noise (turn rate, grip, accel, top speed,
  brake, body scale / length, siren phase) via `randomHandling` — pack no
  longer drives/looks identical.
- 2026-07-20: Renamed to **Auto Crash Chase**; Cop mode Coming soon; Difficulty
  → Traffic (Light/Moderate/Heavy) with civic `TrafficCar`s (0.8× speed,
  junction-only turns, follow/brake so civics don’t crash each other).
- 2026-07-20: Civic traffic lane rules — H roads: north half west / south half
  east; V roads: west half north / east half south (`trafficLanes.ts`). Cars
  snap to lane centers; mid-block axis-locked; junctions exit onto matching half.
- 2026-07-20: WebLLM style prompt commented out in setup UI; added first-visit
  intro + always-visible How to play card so newcomers understand the chase.
- 2026-07-20: Manual control hides AI sliders/path style and shows WASD + arrow
  keycap illustrations (Space = nitro) in the setup right column.
- 2026-07-20: Map seed defaults to a random adjective-noun-number each visit /
  setup show; optional field with hint + reroll button (same seed = same city).
- 2026-07-20: README rewritten for players (features, controls, screenshots under
  `references/screenshots/`); WebLLM UI noted as temporarily hidden.
