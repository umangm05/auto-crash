export class HUD {
  private root: HTMLDivElement;
  private timerEl: HTMLDivElement;
  private infoEl: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:absolute;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;pointer-events:none;font-size:13px;';
    this.timerEl = document.createElement('div');
    this.timerEl.style.cssText =
      'background:rgba(13,17,23,0.75);border:1px solid #30363d;padding:8px 12px;border-radius:6px;color:#39ff14;';
    this.infoEl = document.createElement('div');
    this.infoEl.style.cssText =
      'background:rgba(13,17,23,0.75);border:1px solid #30363d;padding:8px 12px;border-radius:6px;color:#e6edf3;';
    this.root.append(this.timerEl, this.infoEl);
    parent.appendChild(this.root);
    this.set(0, 1, 1);
  }

  set(
    survivalSec: number,
    cops: number,
    speedMult: number,
    nitroFill = 1,
    nitroActive = false,
    manual = false,
  ): void {
    this.timerEl.textContent = `SURVIVAL ${formatTime(survivalSec)}`;
    const nitroLabel = nitroActive
      ? 'NITRO'
      : nitroFill >= 1
        ? 'NITRO READY'
        : `NITRO ${Math.round(nitroFill * 100)}%`;
    const controls = manual ? '  ·  WASD / ARROWS  ·  SPACE NITRO' : '';
    this.infoEl.textContent = `COPS ${cops}  ·  SPEED ×${speedMult.toFixed(2)}  ·  ${nitroLabel}${controls}`;
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  destroy(): void {
    this.root.remove();
  }
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
