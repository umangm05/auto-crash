# SYSTEM DESIGN BLUEPRINT: SYNCHRONIZED CHASE (TOP-DOWN WEB AI Chase Game)

## 1. PROJECT METADATA & CONTEXT
*   **Target Engine:** HTML5 Canvas API (Vanilla TypeScript/JavaScript).
*   **Physics Core:** Matter.js (2D rigid body physics engine) OR custom 2D Vector Kinematics framework.
*   **Primary AI Strategy Core:** Craig Reynolds Steering Behaviors (Seek, Flee, Obstacle Avoidance).
*   **Secondary AI Pre-Processor:** WebLLM (`@mlc-ai/web-llm`) running client-side via WebGPU.
*   **Target Framerate:** 60 Frames Per Second (FPS) locked using `requestAnimationFrame`.
*   **Deployment Architecture:** 100% Client-Side Static Web Page. Zero backend dependencies or server computation overhead.

---

## 2. EXECUTIVE CORE SUMMARY
"Synchronized Chase" is a minimal, high-intensity strategy game that turns the user's web browser into a top-down tactical viewport. The player acts not as the driver, but as the **Tuner/Strategist**. 

Before a match begins, players describe their tactical approach using natural language (e.g., *"I want a fast, high-drift getaway style that aggressively skims past walls and baits chasers into narrow gaps"*). A local WebLLM translates this semantic input into deterministic numerical constants. The game loop then feeds these values into a real-time vector steering engine that controls the user's car.

The game features two distinct modes (Thief and Cop) combined with dynamic runtime environment generation, creating an infinite matrix of unique structural situations.

---

## 3. COMPREHENSIVE ARCHITECTURAL STACK & RATIONALE

```
+---------------------------------------------------------------------------------------+
|                              USER INTERFACE & LAYOUT LAYER                            |
|             (HTML5 DOM Controls / WebLLM Strategy Prompt Input Panel)                 |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                      WEBLLM AGENT PRE-PROCESSOR (Web Worker)                          |
|   Parses semantic user configurations into pure behavioral tuning configurations       |
+---------------------------------------------------------------------------------------+
                                           |
                                           v [JSON Configuration Token]
+---------------------------------------------------------------------------------------+
|                              SIMULATION CORE ENGINE                                   |
|                                                                                       |
|   +----------------------------+             +------------------------------------+   |
|   |    PROCEDURAL MAP SEEDER   |             |   REYNOLDS STEERING BEHAVIORS      |   |
|   |  Generates random building |             | Computes real-time acceleration    |   |
|   |  matrices via noise maps   |             | vectors based on agent states.      |   |
|   +----------------------------+             +------------------------------------+   |
|                  |                                             |                      |
|                  v                                             v                      |
|   +-------------------------------------------------------------------------------+   |
|   |                            MATTER.JS 2D PHYSICS LAYER                         |   |
|   |        Applies lateral drift forces, velocity boundaries, and checks          |   |
|   |        bounding box collisions across entities at 60Hz intervals.             |   |
|   +-------------------------------------------------------------------------------+   |
|                                          |                                            |
|                                          v                                            |
|   +-------------------------------------------------------------------------------+   |
|   |                          HTML5 CANVAS RENDERING CORE                          |   |
|   |         Paints viewport vector elements, paths, and trails every frame.       |   |
|   +-------------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------------+
```

### 3.1 Rationale for Key Selections
*   **HTML5 Canvas Over PixiJS/Three.js:** The game relies entirely on minimalist vector shapes (lines, dots, triangles, grids). The native Canvas 2D context handles these operations with virtually zero memory overhead, maximizing rendering speed across weak laptop and mobile GPUs.
*   **Steering Behaviors over Neural Networks for Physics:** Real-time Deep Reinforcement Learning models cannot comfortably tick at $16.6\text{ ms}$ scales directly inside single-threaded browser UI tabs alongside drawing cycles. Craig Reynolds' formulas translate complex behaviors into pure vector algebra (addition, subtraction, normalization), achieving identical visual results with absolute execution efficiency.
*   **WebLLM in a Web Worker:** Loading a compressed language model (e.g., `SmolLM2-360M-Instruct`) into WebGPU local memory gives the game advanced parsing logic without relying on subscription keys or cloud endpoints. Keeping this inside a Web Worker ensures that loading, compiling, and text generation cycles do not stutter the render pipeline.

---

## 4. DEEP CORE MECHANICS & MATHEMATICAL MODELING

### 4.1 The Behavioral Configuration Vector
WebLLM converts user text strings into a configuration block structured within these exact ranges:
*   `aggression` (0.0 to 1.0): Scales base force values. High variables minimize stopping distance margins near walls.
*   `driftStability` (0.0 to 1.0): Directly manipulates the lateral friction coefficient ($W_f$). Low properties yield heavy power slides; high variables create strict rail-like navigation tracking.
*   `proximityPanic` (0.0 to 1.0): Multiplies the linear radius boundary of threat scanning vectors. High properties trigger evasion maneuvers from afar.
*   `pathStyle` (`"Linear"` or `"Chaotic"`): Decides whether the vector core projects paths along optimal grid midpoints or introduces persistent localized noise variations.

### 4.2 Kinematics & Drift Model
Vehicles are handled as rigid rectangular footprints governed by localized forces:
$$ ec{V}_{forward} = \hat{U}_{heading} \cdot ( ec{V} \cdot \hat{U}_{heading})$$
$$ ec{V}_{lateral} = \hat{U}_{side} \cdot ( ec{V} \cdot \hat{U}_{side})$$

The physics engine applies a corrective lateral grip force every frame based on the `driftStability` coefficient:
$$ ec{F}_{grip} = - ec{V}_{lateral} \cdot m \cdot (W_f \cdot 	ext{driftStability})$$

Where $m$ is vehicle mass, and $W_f$ represents baseline tire traction variables.

### 4.3 Cop Coordination Network (Swarm Synchronization)
Cops communicate their operational matrices automatically across standard interval sweeps:
1.  **Lead Tracker (Cop 0):** Direct pursuit vector focusing precisely on the Thief's current spatial coordinates $(X_t, Y_t)$.
2.  **Flank Tracker (Cop 1):** Targets an intercept coordinate projected ahead of the target: $ ec{P}_{intercept} =  ec{P}_t + ( ec{V}_t \cdot \Delta t)$.
3.  **Ambush Tracker (Cop 2):** Scans the map matrix layout to identify the closest corridor intersection ahead of the Thief's current velocity trajectory and heads there directly to block egress.

---

## 5. NON-STATIC RUNTIME VARIATION (ANTI-PREDICTABILITY)

To ensure that each match generates unique outcomes rather than running predictable, repetitive paths, the system implements three specific randomizing matrices:

*   **Cellular Automata Map Partitioning:** Using a string seed input (e.g., user timestamp or custom word), the map engine slices the viewport space using randomized recursive binary subdivision. This approach dynamically establishes walls, open plazas, and tight corridors at startup, avoiding any hardcoded layouts.
*   **Persistent Micro-Gaussian Steering Jitter:** The system continuously injects a minor random noise variable into the `angularVelocity` equation every tick:
    $$\Delta 	heta_{error} = 	ext{GaussianRandom}() \cdot (1.0 - 	ext{driftStability}) \cdot 0.05$$
    This causes vehicles to naturally bob, slip slightly during extreme high-speed cornering, or fish-tail out of deep slides organically.
*   **Dynamic Surface Friction Pockets:** The environment generator seeds invisible or subtly tinted "Surface Hazards" (oil slicks, road debris) along random layout coordinates. When a car crosses these zones, its traction coefficients temporarily split, changing the immediate validity of the AI's projected trajectory.

---

## 6. SYSTEM EXPECTATIONS & QUALITY PARMETERS

*   **Visual Philosophy:** High-contrast wireframe retro-futurism. Dark backgrounds (e.g., `#0d1117`) broken by fine grid matrices (`#1f242c`). The Thief vehicle is drawn as a glowing green neon delta triangle, and Cops are displayed in alternating pulsing red and blue line profiles.
*   **Performance Metrics:** Script components must execute within a strict budget of $<4\text{ ms}$ per physics update block to preserve maximum allocation room for the main browser draw calls.
*   **Scaling Difficulty Curve:** The 30-second ticking clock triggers clear upgrades. In addition to adding new chasers, the baseline tracking speeds of the cop swarms increase by a compounding 5% per cycle, defining a clear mechanical endgame framework.