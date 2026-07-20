import {
  COP_AI_BEHAVIOR,
  DEFAULT_BEHAVIOR,
  TRAFFIC_PRESETS,
} from '../config/GameConfig';
import type {
  Biome,
  MatchSettings,
  PathStyle,
  TrafficLevel,
} from '../core/types';
// import type { BehaviorConfig } from '../core/types'; // WebLLM applyConfig
import { clampBehavior } from '../core/types';
import { BIOME_LABELS, ENABLED_BIOMES } from '../map/biomes';
import type { LLMClient } from '../llm/LLMClient';

export type StartHandler = (settings: MatchSettings) => void;

const INTRO_STORAGE_KEY = 'acc-intro-seen-v1';

const LABEL =
  'display:block;font-size:11px;color:#8b949e;margin-bottom:4px;letter-spacing:0.04em;';
const INPUT =
  'width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:8px 10px;font:inherit;font-size:12px;margin-bottom:12px;';

function btnCss(active: boolean, disabled = false): string {
  if (disabled) {
    return `flex:1;padding:8px 10px;border-radius:6px;border:1px solid #21262d;background:#0d1117;color:#484f58;cursor:not-allowed;font:inherit;font-size:12px;opacity:0.55;`;
  }
  return `flex:1;padding:8px 10px;border-radius:6px;border:1px solid ${active ? '#39ff14' : '#30363d'};background:${active ? 'rgba(57,255,20,0.12)' : '#0d1117'};color:${active ? '#39ff14' : '#e6edf3'};cursor:pointer;font:inherit;font-size:12px;`;
}

/** Keyboard keycap for control illustrations. */
function keyCap(label: string, wide = false): string {
  const w = wide ? 'min-width:72px;padding:8px 12px;' : 'min-width:32px;';
  return `<span style="display:inline-flex;align-items:center;justify-content:center;${w}height:32px;padding:0 8px;border:1px solid #30363d;border-bottom-width:3px;border-radius:6px;background:#21262d;color:#e6edf3;font-size:12px;font-weight:600;letter-spacing:0.04em;box-sizing:border-box;">${label}</span>`;
}

function keyRow(keys: string[]): string {
  return `<div style="display:flex;gap:6px;justify-content:center;">${keys.map((k) => keyCap(k)).join('')}</div>`;
}

const SEED_ADJECTIVES = [
  'neon',
  'ghost',
  'chrome',
  'midnight',
  'rusty',
  'silent',
  'wild',
  'broken',
  'electric',
  'foggy',
  'hollow',
  'rapid',
  'shadow',
  'amber',
  'crimson',
];
const SEED_NOUNS = [
  'alley',
  'bridge',
  'district',
  'freeway',
  'harbor',
  'junction',
  'metro',
  'overpass',
  'plaza',
  'river',
  'skyline',
  'tunnel',
  'viaduct',
  'warehouse',
  'yard',
];

/** Fresh readable seed so each visit gets a different city layout. */
function randomMapSeed(): string {
  const a = SEED_ADJECTIVES[Math.floor(Math.random() * SEED_ADJECTIVES.length)]!;
  const n = SEED_NOUNS[Math.floor(Math.random() * SEED_NOUNS.length)]!;
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${a}-${n}-${num}`;
}

export class SetupOverlay {
  private root: HTMLDivElement;
  private manual = false;
  private traffic: TrafficLevel = 'medium';
  private biome: Biome = 'city';
  private aggression = DEFAULT_BEHAVIOR.aggression;
  private driftStability = DEFAULT_BEHAVIOR.driftStability;
  private proximityPanic = DEFAULT_BEHAVIOR.proximityPanic;
  private pathStyle: PathStyle = DEFAULT_BEHAVIOR.pathStyle;
  private seedInput!: HTMLInputElement;
  private taglineEl!: HTMLParagraphElement;
  // private statusEl!: HTMLDivElement; // used by WebLLM runLlm when re-enabled
  // WebLLM UI temporarily disabled — restore when re-enabling the prompt.
  // private styleInput!: HTMLTextAreaElement;
  // private llmProgressEl!: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly onStart: StartHandler,
    private readonly llm: LLMClient,
  ) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(13,17,23,0.92);padding:24px;overflow:auto;';
    this.root.innerHTML = this.template();
    parent.appendChild(this.root);
    this.bind();
    // this.llm.onProgress((msg) => {
    //   this.llmProgressEl.textContent = msg;
    //   this.llmProgressEl.style.color = '#8b949e';
    // });
    void this.llm; // keep ctor signature; WebLLM prompt UI is commented out
  }

  private hasSeenIntro(): boolean {
    try {
      return localStorage.getItem(INTRO_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private markIntroSeen(): void {
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      /* ignore private-mode quota */
    }
  }

  private template(): string {
    const hint = 'color:#8b949e;font-size:10px;margin:0 0 10px;line-height:1.35;';
    const col = 'display:flex;flex-direction:column;min-width:0;';
    const firstVisit = !this.hasSeenIntro();
    return `
      <div style="width:min(780px,100%);max-height:min(92vh,860px);overflow:auto;border:1px solid #30363d;border-radius:10px;background:#161b22;padding:18px 20px;box-shadow:0 0 40px rgba(57,255,20,0.08);">
        <div style="margin-bottom:12px;">
          <h1 style="font-size:18px;letter-spacing:0.08em;color:#39ff14;margin:0 0 4px;">AUTO CRASH CHASE</h1>
          <p id="tagline" style="color:#8b949e;font-size:12px;margin:0 0 8px;">Tuner / Strategist — configure the thief, watch the chase.</p>
          <p style="color:#c9d1d9;font-size:12px;margin:0;line-height:1.45;">
            A top-down AI chase: you tune a neon <span style="color:#39ff14;">thief</span> while
            pulsing <span style="color:#ff6b6b;">cops</span> hunt across a seeded city.
            Survive as long as you can — get caught and the chase ends.
          </p>
        </div>

        <div id="first-visit" style="display:${firstVisit ? 'block' : 'none'};margin-bottom:14px;padding:12px 14px;border:1px solid #30363d;border-radius:8px;background:rgba(57,255,20,0.06);">
          <div style="font-size:11px;letter-spacing:0.06em;color:#39ff14;margin-bottom:6px;">FIRST TIME HERE?</div>
          <ol style="margin:0 0 10px;padding-left:18px;color:#c9d1d9;font-size:12px;line-height:1.55;">
            <li><b style="color:#e6edf3;font-weight:600;">AI</b> — set the sliders, hit Start, and watch the thief flee for you.</li>
            <li><b style="color:#e6edf3;font-weight:600;">Manual</b> — drive yourself with WASD / arrows; Space = nitro.</li>
            <li>Pick traffic density, then Start Chase. Edge markers show off-screen cops.</li>
          </ol>
          <button type="button" id="intro-dismiss" style="${btnCss(true)}width:auto;padding:8px 14px;">GOT IT — SHOW SETUP</button>
        </div>

        <div class="setup-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px 22px;align-items:start;">
          <div style="${col}">
            <label style="${LABEL}">Play as</label>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
              <button type="button" data-mode="thief" class="mode-btn" style="${btnCss(true)}">THIEF</button>
              <button type="button" data-mode="cop" class="mode-btn" disabled style="${btnCss(false, true)}">COP (SOON)</button>
            </div>

            <div id="manual-row">
              <label style="${LABEL}">Control</label>
              <div style="display:flex;gap:8px;margin-bottom:4px;">
                <button type="button" data-manual="ai" class="manual-btn" style="${btnCss(true)}">AI</button>
                <button type="button" data-manual="manual" class="manual-btn" style="${btnCss(false)}">MANUAL</button>
              </div>
              <p id="control-hint" style="${hint}">AI: tune the thief on the right, then watch the chase.</p>
            </div>

            <label style="${LABEL}">Traffic</label>
            <div style="display:flex;gap:8px;margin-bottom:4px;">
              ${(['light', 'medium', 'heavy'] as TrafficLevel[])
                .map(
                  (t) =>
                    `<button type="button" data-traffic="${t}" class="traffic-btn" style="${btnCss(t === 'medium')}">${TRAFFIC_PRESETS[t].label}</button>`,
                )
                .join('')}
            </div>
            <p style="${hint}">Civic cars on the roads — denser traffic means more weaving for the chase.</p>

            <label style="${LABEL}">Biome / World</label>
            <div style="display:flex;gap:8px;margin-bottom:4px;">
              ${(['city', 'desert', 'rural'] as Biome[])
                .map((b) => {
                  const enabled = ENABLED_BIOMES.includes(b);
                  const label = enabled ? BIOME_LABELS[b] : `${BIOME_LABELS[b]} (soon)`;
                  return `<button type="button" data-biome="${b}" class="biome-btn" ${enabled ? '' : 'disabled'} style="${btnCss(b === 'city', !enabled)}">${label}</button>`;
                })
                .join('')}
            </div>
            <p style="${hint}">City only for now — black roads, lane marks, rivers & bridges. Desert / Rural coming later.</p>

            <label style="${LABEL}">Map seed <span style="color:#484f58;font-weight:400;letter-spacing:0;">(optional)</span></label>
            <div style="display:flex;gap:8px;margin-bottom:4px;">
              <input id="seed" value="${randomMapSeed()}" style="${INPUT}margin-bottom:0;flex:1;" />
              <button type="button" id="seed-reroll" title="New random seed" style="${btnCss(false)}flex:0 0 auto;padding:8px 12px;">↻</button>
            </div>
            <p style="${hint}margin-bottom:0;">Same text = same city layout. Leave it alone for a fresh map each time — or copy a seed to replay a chase you liked.</p>
          </div>

          <div style="${col}">
            <div id="howto-card" style="margin-bottom:12px;padding:10px 12px;border:1px solid #30363d;border-radius:8px;background:#0d1117;">
              <div style="font-size:11px;letter-spacing:0.05em;color:#8b949e;margin-bottom:6px;">HOW TO PLAY</div>
              <ul id="howto-ai" style="margin:0;padding-left:16px;color:#c9d1d9;font-size:11px;line-height:1.55;">
                <li style="margin-bottom:4px;"><b style="color:#e6edf3;font-weight:600;">Goal</b> — don't get caught. Green car = you; red/blue = cops.</li>
                <li style="margin-bottom:4px;"><b style="color:#e6edf3;font-weight:600;">AI mode</b> — tune behavior below, then spectate the chase.</li>
                <li><b style="color:#e6edf3;font-weight:600;">Traffic</b> — civilians cruise the lanes; the AI weaves around them.</li>
              </ul>
              <ul id="howto-manual" style="display:none;margin:0;padding-left:16px;color:#c9d1d9;font-size:11px;line-height:1.55;">
                <li style="margin-bottom:4px;"><b style="color:#e6edf3;font-weight:600;">Goal</b> — you drive the green thief. Escape the cops as long as you can.</li>
                <li style="margin-bottom:4px;"><b style="color:#e6edf3;font-weight:600;">Drive</b> — WASD or arrow keys (↑ ← ↓ →).</li>
                <li><b style="color:#e6edf3;font-weight:600;">Nitro</b> — hold Space for a short speed boost.</li>
              </ul>
            </div>

            <!-- WebLLM prompt temporarily disabled
            <label style="${LABEL}">Describe driving style (WebLLM)</label>
            <textarea id="style" rows="3" placeholder='e.g. "reckless ghost driver"' style="${INPUT}resize:vertical;min-height:72px;margin-bottom:8px;"></textarea>
            <div style="display:flex;gap:8px;margin:0 0 4px;">
              <button type="button" id="llm-btn" style="${btnCss(false)}">GENERATE FROM TEXT</button>
            </div>
            <div id="llm-progress" style="font-size:11px;color:#8b949e;min-height:16px;margin-bottom:10px;"></div>
            -->

            <div id="ai-panel">
              <label style="${LABEL}">Thief behavior (AI mode)</label>
              <p style="${hint}">These sliders shape how the AI thief drives.</p>
              ${this.sliderHtml('aggression', 'Aggression', this.aggression)}
              ${this.sliderHtml('driftStability', 'Drift Stability', this.driftStability)}
              ${this.sliderHtml('proximityPanic', 'Proximity Panic', this.proximityPanic)}

              <label style="${LABEL}">Path Style</label>
              <div style="display:flex;gap:8px;margin-bottom:0;">
                <button type="button" data-path="Linear" class="path-btn" style="${btnCss(true)}">Linear</button>
                <button type="button" data-path="Chaotic" class="path-btn" style="${btnCss(false)}">Chaotic</button>
              </div>
            </div>

            <div id="manual-panel" style="display:none;">
              <label style="${LABEL}">You drive</label>
              <p style="color:#c9d1d9;font-size:12px;margin:0 0 14px;line-height:1.45;">
                Use either layout — same directions. Stay on the roads and dodge traffic.
              </p>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
                <div style="padding:12px;border:1px solid #30363d;border-radius:8px;background:#0d1117;text-align:center;">
                  <div style="font-size:10px;letter-spacing:0.06em;color:#8b949e;margin-bottom:10px;">WASD</div>
                  <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
                    ${keyRow(['W'])}
                    ${keyRow(['A', 'S', 'D'])}
                  </div>
                  <p style="margin:10px 0 0;font-size:10px;color:#8b949e;line-height:1.35;">W forward · A/D turn · S brake</p>
                </div>
                <div style="padding:12px;border:1px solid #30363d;border-radius:8px;background:#0d1117;text-align:center;">
                  <div style="font-size:10px;letter-spacing:0.06em;color:#8b949e;margin-bottom:10px;">ARROWS</div>
                  <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
                    ${keyRow(['↑'])}
                    ${keyRow(['←', '↓', '→'])}
                  </div>
                  <p style="margin:10px 0 0;font-size:10px;color:#8b949e;line-height:1.35;">↑ forward · ←/→ turn · ↓ brake</p>
                </div>
              </div>
              <div style="padding:12px;border:1px solid rgba(57,255,20,0.35);border-radius:8px;background:rgba(57,255,20,0.06);text-align:center;">
                <div style="font-size:10px;letter-spacing:0.06em;color:#8b949e;margin-bottom:10px;">NITRO</div>
                ${keyCap('SPACE', true)}
                <p style="margin:10px 0 0;font-size:11px;color:#c9d1d9;line-height:1.4;">Hold for a short speed boost (refills after use).</p>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;padding-top:14px;border-top:1px solid #30363d;">
          <div id="status" style="font-size:11px;color:#f85149;min-height:16px;margin-bottom:8px;"></div>
          <button type="button" id="start" style="${btnCss(true)}width:100%;padding:12px;">START CHASE</button>
        </div>
      </div>
      <style>
        @media (max-width: 640px) {
          .setup-grid { grid-template-columns: 1fr !important; }
        }
      </style>
    `;
  }

  private sliderHtml(id: string, label: string, value: number): string {
    return `
      <label style="${LABEL}">${label} <span data-val="${id}">${value.toFixed(2)}</span></label>
      <input type="range" min="0" max="1" step="0.01" value="${value}" data-slider="${id}" style="width:100%;margin-bottom:10px;" />
    `;
  }

  private refreshGroup(selector: string, activeAttr: string, activeValue: string): void {
    this.root.querySelectorAll<HTMLButtonElement>(selector).forEach((b) => {
      if (b.disabled) return;
      const active = b.getAttribute(activeAttr) === activeValue;
      b.setAttribute('style', btnCss(active));
    });
  }

  private bind(): void {
    this.seedInput = this.root.querySelector('#seed')!;
    this.taglineEl = this.root.querySelector('#tagline')!;
    // this.statusEl = this.root.querySelector('#status')!;
    // this.styleInput = this.root.querySelector('#style')!;
    // this.llmProgressEl = this.root.querySelector('#llm-progress')!;

    this.root.querySelector('#seed-reroll')?.addEventListener('click', () => {
      this.seedInput.value = randomMapSeed();
    });

    this.root.querySelector('#intro-dismiss')?.addEventListener('click', () => {
      this.markIntroSeen();
      const panel = this.root.querySelector<HTMLElement>('#first-visit');
      if (panel) panel.style.display = 'none';
    });

    this.root.querySelectorAll<HTMLButtonElement>('.manual-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.manual = btn.dataset.manual === 'manual';
        this.refreshManualUi();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.traffic-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.traffic = btn.dataset.traffic as TrafficLevel;
        this.refreshGroup('.traffic-btn', 'data-traffic', this.traffic);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.biome-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const next = btn.dataset.biome as Biome;
        if (!ENABLED_BIOMES.includes(next)) return;
        this.biome = next;
        this.root.querySelectorAll<HTMLButtonElement>('.biome-btn').forEach((b) => {
          const id = b.dataset.biome as Biome;
          const enabled = ENABLED_BIOMES.includes(id);
          b.setAttribute('style', btnCss(id === this.biome, !enabled));
        });
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.path-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.pathStyle = btn.dataset.path as PathStyle;
        this.refreshGroup('.path-btn', 'data-path', this.pathStyle);
      });
    });

    this.root.querySelectorAll<HTMLInputElement>('[data-slider]').forEach((input) => {
      const id = input.dataset.slider!;
      const display = this.root.querySelector<HTMLSpanElement>(`[data-val="${id}"]`)!;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        if (id === 'aggression') this.aggression = v;
        if (id === 'driftStability') this.driftStability = v;
        if (id === 'proximityPanic') this.proximityPanic = v;
        display.textContent = v.toFixed(2);
      });
    });

    this.root.querySelector('#start')!.addEventListener('click', () => {
      this.markIntroSeen();
      const playerConfig = clampBehavior({
        aggression: this.aggression,
        driftStability: this.driftStability,
        proximityPanic: this.proximityPanic,
        pathStyle: this.pathStyle,
      });
      this.onStart({
        mode: 'thief',
        traffic: this.traffic,
        biome: this.biome,
        seed: this.seedInput.value.trim() || `seed-${Date.now()}`,
        playerConfig,
        opponentConfig: COP_AI_BEHAVIOR,
        manual: this.manual,
      });
    });

    // this.root.querySelector('#llm-btn')!.addEventListener('click', () => void this.runLlm());
    this.refreshManualUi();
  }

  private refreshManualUi(): void {
    this.refreshGroup('.manual-btn', 'data-manual', this.manual ? 'manual' : 'ai');
    this.taglineEl.textContent = this.manual
      ? 'Manual thief — you drive. Escape the cops.'
      : 'Tuner / Strategist — configure the thief, watch the chase.';

    const controlHint = this.root.querySelector<HTMLElement>('#control-hint');
    if (controlHint) {
      controlHint.textContent = this.manual
        ? 'You drive with WASD or the arrow keys. See controls on the right.'
        : 'AI: tune the thief on the right, then watch the chase.';
    }

    const aiPanel = this.root.querySelector<HTMLElement>('#ai-panel');
    const manualPanel = this.root.querySelector<HTMLElement>('#manual-panel');
    const howtoAi = this.root.querySelector<HTMLElement>('#howto-ai');
    const howtoManual = this.root.querySelector<HTMLElement>('#howto-manual');
    if (aiPanel) aiPanel.style.display = this.manual ? 'none' : 'block';
    if (manualPanel) manualPanel.style.display = this.manual ? 'block' : 'none';
    if (howtoAi) howtoAi.style.display = this.manual ? 'none' : 'block';
    if (howtoManual) howtoManual.style.display = this.manual ? 'block' : 'none';
  }

  /*
  private async runLlm(): Promise<void> {
    const text = this.styleInput.value.trim();
    if (!text) {
      this.statusEl.textContent = 'Enter a driving style description first.';
      return;
    }
    this.statusEl.textContent = '';
    this.llmProgressEl.textContent = 'Starting WebLLM…';
    try {
      const cfg = await this.llm.parseDrivingStyle(text);
      this.applyConfig(cfg);
      this.llmProgressEl.textContent = 'Applied LLM config to sliders.';
      this.llmProgressEl.style.color = '#39ff14';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.statusEl.textContent = msg;
      this.llmProgressEl.textContent =
        'WebLLM unavailable — use manual sliders (WebGPU required for local LLM).';
      this.llmProgressEl.style.color = '#f0883e';
    }
  }

  private applyConfig(cfg: BehaviorConfig): void {
    this.aggression = cfg.aggression;
    this.driftStability = cfg.driftStability;
    this.proximityPanic = cfg.proximityPanic;
    this.pathStyle = cfg.pathStyle;
    for (const [id, value] of Object.entries({
      aggression: cfg.aggression,
      driftStability: cfg.driftStability,
      proximityPanic: cfg.proximityPanic,
    })) {
      const input = this.root.querySelector<HTMLInputElement>(`[data-slider="${id}"]`);
      if (input) input.value = String(value);
      const display = this.root.querySelector<HTMLSpanElement>(`[data-val="${id}"]`);
      if (display) display.textContent = Number(value).toFixed(2);
    }
    this.refreshGroup('.path-btn', 'data-path', cfg.pathStyle);
  }
  */

  show(): void {
    // Fresh layout when returning to setup (e.g. after game over).
    this.seedInput.value = randomMapSeed();
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
