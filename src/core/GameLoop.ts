const FIXED_DT_MS = 1000 / 60;
const MAX_ACCUMULATOR_MS = FIXED_DT_MS * 5;

export type UpdateFn = (dtSeconds: number) => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;

  constructor(
    private readonly onUpdate: UpdateFn,
    private readonly onRender: RenderFn,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    let frame = now - this.lastTime;
    this.lastTime = now;
    if (frame > MAX_ACCUMULATOR_MS) frame = MAX_ACCUMULATOR_MS;
    this.accumulator += frame;

    // At most one catch-up step — never spiral if a frame was expensive.
    let steps = 0;
    while (this.accumulator >= FIXED_DT_MS && steps < 2) {
      this.onUpdate(FIXED_DT_MS / 1000);
      this.accumulator -= FIXED_DT_MS;
      steps++;
      if (!this.running) return;
    }
    // Drop leftover time instead of catching up forever
    if (this.accumulator >= FIXED_DT_MS) this.accumulator = 0;

    if (!this.running) return;
    const alpha = this.accumulator / FIXED_DT_MS;
    this.onRender(alpha);
    this.rafId = requestAnimationFrame(this.tick);
  };
}

export const FIXED_TIMESTEP_SECONDS = FIXED_DT_MS / 1000;
