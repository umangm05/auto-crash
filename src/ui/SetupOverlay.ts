import { DEFAULT_BEHAVIOR, DIFFICULTY_PRESETS } from '../config/GameConfig';
import type {
  BehaviorConfig,
  Biome,
  Difficulty,
  MatchSettings,
  PathStyle,
  PlayMode,
} from '../core/types';
import { clampBehavior } from '../core/types';
import { BIOME_LABELS, ENABLED_BIOMES } from '../map/biomes';
import type { LLMClient } from '../llm/LLMClient';

export type StartHandler = (settings: MatchSettings) => void;

const LABEL =
  'display:block;font-size:11px;color:#8b949e;margin-bottom:6px;letter-spacing:0.04em;';
const INPUT =
  'width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:8px 10px;font:inherit;font-size:12px;margin-bottom:12px;';

function btnCss(active: boolean, disabled = false): string {
  if (disabled) {
    return `flex:1;padding:8px 10px;border-radius:6px;border:1px solid #21262d;background:#0d1117;color:#484f58;cursor:not-allowed;font:inherit;font-size:12px;opacity:0.55;`;
  }
  return `flex:1;padding:8px 10px;border-radius:6px;border:1px solid ${active ? '#39ff14' : '#30363d'};background:${active ? 'rgba(57,255,20,0.12)' : '#0d1117'};color:${active ? '#39ff14' : '#e6edf3'};cursor:pointer;font:inherit;font-size:12px;`;
}

export class SetupOverlay {
  private root: HTMLDivElement;
  private mode: PlayMode = 'thief';
  private difficulty: Difficulty = 'medium';
  private biome: Biome = 'city';
  private aggression = DEFAULT_BEHAVIOR.aggression;
  private driftStability = DEFAULT_BEHAVIOR.driftStability;
  private proximityPanic = DEFAULT_BEHAVIOR.proximityPanic;
  private pathStyle: PathStyle = DEFAULT_BEHAVIOR.pathStyle;
  private seedInput!: HTMLInputElement;
  private styleInput!: HTMLTextAreaElement;
  private statusEl!: HTMLDivElement;
  private llmProgressEl!: HTMLDivElement;

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
    this.llm.onProgress((msg) => {
      this.llmProgressEl.textContent = msg;
      this.llmProgressEl.style.color = '#8b949e';
    });
  }

  private template(): string {
    return `
      <div style="width:min(520px,100%);border:1px solid #30363d;border-radius:10px;background:#161b22;padding:22px;box-shadow:0 0 40px rgba(57,255,20,0.08);">
        <h1 style="font-size:20px;letter-spacing:0.08em;color:#39ff14;margin-bottom:4px;">SYNCHRONIZED CHASE</h1>
        <p style="color:#8b949e;font-size:12px;margin-bottom:18px;">Tuner / Strategist mode — AI drives both sides.</p>

        <label style="${LABEL}">Play as</label>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <button type="button" data-mode="thief" class="mode-btn" style="${btnCss(true)}">THIEF</button>
          <button type="button" data-mode="cop" class="mode-btn" style="${btnCss(false)}">COP</button>
        </div>

        <label style="${LABEL}">Difficulty</label>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          ${(['easy', 'medium', 'hard'] as Difficulty[])
            .map(
              (d) =>
                `<button type="button" data-diff="${d}" class="diff-btn" style="${btnCss(d === 'medium')}">${DIFFICULTY_PRESETS[d].label}</button>`,
            )
            .join('')}
        </div>

        <label style="${LABEL}">Biome / World</label>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          ${(['city', 'desert', 'rural'] as Biome[])
            .map((b) => {
              const enabled = ENABLED_BIOMES.includes(b);
              const label = enabled ? BIOME_LABELS[b] : `${BIOME_LABELS[b]} (soon)`;
              return `<button type="button" data-biome="${b}" class="biome-btn" ${enabled ? '' : 'disabled'} style="${btnCss(b === 'city', !enabled)}">${label}</button>`;
            })
            .join('')}
        </div>
        <p style="color:#8b949e;font-size:10px;margin:-8px 0 14px;">City only for now — black roads, lane marks, rivers & bridges. Desert / Rural coming later.</p>

        <label style="${LABEL}">Map seed</label>
        <input id="seed" value="neon-city" style="${INPUT}" />

        <label style="${LABEL}">Describe driving style (WebLLM)</label>
        <textarea id="style" rows="3" placeholder='e.g. "reckless ghost driver"' style="${INPUT}resize:vertical;"></textarea>
        <div style="display:flex;gap:8px;margin:8px 0 6px;">
          <button type="button" id="llm-btn" style="${btnCss(false)}">GENERATE FROM TEXT</button>
        </div>
        <div id="llm-progress" style="font-size:11px;color:#8b949e;min-height:16px;margin-bottom:8px;"></div>

        ${this.sliderHtml('aggression', 'Aggression', this.aggression)}
        ${this.sliderHtml('driftStability', 'Drift Stability', this.driftStability)}
        ${this.sliderHtml('proximityPanic', 'Proximity Panic', this.proximityPanic)}

        <label style="${LABEL}">Path Style</label>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button type="button" data-path="Linear" class="path-btn" style="${btnCss(true)}">Linear</button>
          <button type="button" data-path="Chaotic" class="path-btn" style="${btnCss(false)}">Chaotic</button>
        </div>

        <div id="status" style="font-size:11px;color:#f85149;min-height:16px;margin-bottom:10px;"></div>
        <button type="button" id="start" style="${btnCss(true)}width:100%;padding:12px;">START CHASE</button>
      </div>
    `;
  }

  private sliderHtml(id: string, label: string, value: number): string {
    return `
      <label style="${LABEL}">${label} <span data-val="${id}">${value.toFixed(2)}</span></label>
      <input type="range" min="0" max="1" step="0.01" value="${value}" data-slider="${id}" style="width:100%;margin-bottom:12px;" />
    `;
  }

  private refreshGroup(selector: string, activeAttr: string, activeValue: string): void {
    this.root.querySelectorAll<HTMLButtonElement>(selector).forEach((b) => {
      const active = b.getAttribute(activeAttr) === activeValue;
      b.setAttribute('style', btnCss(active));
    });
  }

  private bind(): void {
    this.seedInput = this.root.querySelector('#seed')!;
    this.styleInput = this.root.querySelector('#style')!;
    this.statusEl = this.root.querySelector('#status')!;
    this.llmProgressEl = this.root.querySelector('#llm-progress')!;

    this.root.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode as PlayMode;
        this.refreshGroup('.mode-btn', 'data-mode', this.mode);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.difficulty = btn.dataset.diff as Difficulty;
        this.refreshGroup('.diff-btn', 'data-diff', this.difficulty);
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
      const playerConfig = clampBehavior({
        aggression: this.aggression,
        driftStability: this.driftStability,
        proximityPanic: this.proximityPanic,
        pathStyle: this.pathStyle,
      });
      this.onStart({
        mode: this.mode,
        difficulty: this.difficulty,
        biome: this.biome,
        seed: this.seedInput.value.trim() || `seed-${Date.now()}`,
        playerConfig,
        opponentConfig: DIFFICULTY_PRESETS[this.difficulty].opponent,
      });
    });

    this.root.querySelector('#llm-btn')!.addEventListener('click', () => void this.runLlm());
  }

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

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
