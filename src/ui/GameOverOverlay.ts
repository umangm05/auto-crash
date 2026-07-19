import { formatTime } from './HUD';

export class GameOverOverlay {
  private root: HTMLDivElement;

  constructor(parent: HTMLElement, onRestart: () => void) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(13,17,23,0.85);';
    this.root.innerHTML = `
      <div style="border:1px solid #f85149;border-radius:10px;background:#161b22;padding:24px 28px;text-align:center;min-width:280px;">
        <div style="color:#f85149;letter-spacing:0.12em;font-size:18px;margin-bottom:8px;">GAME OVER</div>
        <div id="go-metrics" style="color:#e6edf3;font-size:13px;margin-bottom:16px;"></div>
        <button id="restart" type="button" style="width:100%;padding:10px;border-radius:6px;border:1px solid #39ff14;background:rgba(57,255,20,0.12);color:#39ff14;font:inherit;cursor:pointer;">RESTART</button>
      </div>
    `;
    parent.appendChild(this.root);
    this.root.querySelector('#restart')!.addEventListener('click', onRestart);
  }

  show(survivalSec: number, cops: number, cycles: number): void {
    const metrics = this.root.querySelector('#go-metrics')!;
    metrics.innerHTML = `
      Survival time: <strong style="color:#39ff14">${formatTime(survivalSec)}</strong><br/>
      Cops spawned: ${cops}<br/>
      Escalation cycles: ${cycles}
    `;
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
