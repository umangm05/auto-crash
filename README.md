# Synchronized Chase (auto-crash)

Top-down chase game. You act as the **Tuner / Strategist**: pick a side (Thief or Cop), tune steering parameters (or describe a driving style in natural language via local WebLLM), then watch the chase unfold — or enable **Manual** (Thief only) and drive with WASD / arrow keys.

## Spec

Authoritative design: [`references/BLUEPRINT.MD`](references/BLUEPRINT.MD)  
World / biomes: [`references/WORLD.md`](references/WORLD.md)  
Agent index / conventions: [`AGENTS.md`](AGENTS.md)

## Stack

- TypeScript + Vite
- HTML5 Canvas rendering (camera follows the thief)
- Matter.js physics
- Craig Reynolds steering behaviors + A\* pathfinding
- Chunked infinite world (city / desert / rural)
- `@mlc-ai/web-llm` (Web Worker, WebGPU) for text → behavior config

## Run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production build to dist/
npm run preview  # serve the production build
```

## Controls (setup overlay)

1. Choose **Thief** or **Cop** mode (your sliders tune that side; the other uses difficulty presets).
2. In **Thief** mode, pick **AI** or **Manual** control. Manual drives the thief with **WASD** or **arrow keys** (cops stay AI). Cop mode has no manual drive.
3. Pick difficulty: Open Grid / Alleyway Maze / Dense Obstacles (density + AI presets).
4. Pick **biome**: City (roads/junctions), Desert (open, no roads), Rural (winding tracks).
5. Optionally set a **map seed** (same seed → same chunk layout).
6. Tune Aggression, Drift Stability, Proximity Panic, Path Style — or click **Generate from text** (requires WebGPU; large first-time model download). Sliders still affect top speed / grip in Manual.
7. **Start Chase**. Camera follows the thief. Cops spawn near the action; road spills cut local traction. Soft glow circles show proximity radii.

Manual sliders always work if WebLLM / WebGPU is unavailable.
