# Auto Crash Chase (auto-crash)

Top-down chase game. You configure the **Thief** (AI or Manual), pick traffic density, then survive as cops close in through civic traffic on the roads.

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

1. **Play as Thief** (Cop mode is coming soon).
2. Pick **AI** or **Manual** control. Manual: **WASD** / **arrows** to drive, **Space** for nitro.
3. Pick **Traffic**: Light / Moderate / Heavy — civic cars on the roads (0.8× chase speed, simple driving).
4. Pick **biome**: City (roads/junctions). Desert / Rural coming later.
5. Optionally set a **map seed** (same seed → same chunk layout).
6. Tune Aggression, Drift Stability, Proximity Panic, Path Style — or click **Generate from text** (requires WebGPU; large first-time model download).
7. **Start Chase**. Camera follows the thief. Cops and traffic share the asphalt; chase units brake/steer around civics. Off-screen cops appear as pulsing red/blue dots on the screen edge.

Manual sliders always work if WebLLM / WebGPU is unavailable.
