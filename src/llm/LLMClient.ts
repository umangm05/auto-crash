import type { MLCEngineInterface } from '@mlc-ai/web-llm';
import type { BehaviorConfig } from '../core/types';
import { clampBehavior } from '../core/types';

/** Prebuilt WebLLM model id (q4f16_1 quantized Instruct). */
const MODEL_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

const SYSTEM_PROMPT = `You convert free-form driving style descriptions into JSON for a car chase game.
Respond with ONLY a JSON object matching this schema:
{
  "aggression": number 0.0-1.0,
  "driftStability": number 0.0-1.0,
  "proximityPanic": number 0.0-1.0,
  "pathStyle": "Linear" or "Chaotic"
}
Rules:
- aggression: high for reckless/aggressive/fast; low for cautious.
- driftStability: high for rail-like control; low for slides/drifts.
- proximityPanic: high for early evasion / jittery threat response; low for calm.
- pathStyle: "Chaotic" for wild/unpredictable; otherwise "Linear".
No markdown, no commentary.`;

export type ProgressFn = (message: string) => void;

export class LLMClient {
  private engine: MLCEngineInterface | null = null;
  private initPromise: Promise<void> | null = null;
  private progressFn: ProgressFn | null = null;
  private unavailableReason: string | null = null;

  onProgress(fn: ProgressFn): void {
    this.progressFn = fn;
  }

  private report(msg: string): void {
    this.progressFn?.(msg);
  }

  async ensureReady(): Promise<void> {
    if (this.engine) return;
    if (this.unavailableReason) throw new Error(this.unavailableReason);
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        this.unavailableReason =
          'WebGPU is not available in this browser. Manual sliders still work.';
        throw new Error(this.unavailableReason);
      }

      try {
        this.report(`Loading ${MODEL_ID} in Web Worker…`);
        // Dynamic import keeps the main game bundle free of the WebLLM payload.
        const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
        const worker = new Worker(new URL('./llmWorker.ts', import.meta.url), {
          type: 'module',
        });
        this.engine = await CreateWebWorkerMLCEngine(worker, MODEL_ID, {
          initProgressCallback: (p) => {
            const pct = Math.round((p.progress ?? 0) * 100);
            this.report(`${p.text ?? 'Loading model…'} (${pct}%)`);
          },
        });
        this.report('WebLLM ready.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.unavailableReason = `Failed to init WebLLM: ${msg}`;
        this.engine = null;
        throw new Error(this.unavailableReason);
      }
    })();

    try {
      await this.initPromise;
    } finally {
      // allow retry if failed
      if (!this.engine) this.initPromise = null;
    }
  }

  async parseDrivingStyle(text: string): Promise<BehaviorConfig> {
    await this.ensureReady();
    if (!this.engine) throw new Error(this.unavailableReason ?? 'Engine not ready');

    this.report('Generating config…');
    const completion = await this.engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.4,
      max_tokens: 160,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    return parseBehaviorJson(raw);
  }
}

export function parseBehaviorJson(raw: string): BehaviorConfig {
  let data: Record<string, unknown>;
  try {
    // Strip accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    data = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error('LLM returned invalid JSON.');
  }

  return clampBehavior({
    aggression: Number(data.aggression),
    driftStability: Number(data.driftStability),
    proximityPanic: Number(data.proximityPanic),
    pathStyle: data.pathStyle === 'Chaotic' ? 'Chaotic' : 'Linear',
  });
}
