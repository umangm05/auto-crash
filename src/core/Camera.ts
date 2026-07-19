import { Vector2 } from './Vector2';

/** Smooth camera that follows a world-space target. */
export class Camera {
  x = 0;
  y = 0;
  private readonly lerp = 0.12;

  follow(target: Vector2, viewW: number, viewH: number): void {
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
    const desiredX = target.x - viewW / 2;
    const desiredY = target.y - viewH / 2;
    this.x += (desiredX - this.x) * this.lerp;
    this.y += (desiredY - this.y) * this.lerp;
    const MAX = 500_000;
    if (!Number.isFinite(this.x) || Math.abs(this.x) > MAX) this.x = Math.max(-MAX, Math.min(MAX, desiredX || 0));
    if (!Number.isFinite(this.y) || Math.abs(this.y) > MAX) this.y = Math.max(-MAX, Math.min(MAX, desiredY || 0));
  }

  /** Snap instantly (match start). */
  snapTo(target: Vector2, viewW: number, viewH: number): void {
    this.x = target.x - viewW / 2;
    this.y = target.y - viewH / 2;
  }

  begin(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(-this.x, -this.y);
  }

  end(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  worldBounds(viewW: number, viewH: number, pad = 0): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    return {
      minX: this.x - pad,
      minY: this.y - pad,
      maxX: this.x + viewW + pad,
      maxY: this.y + viewH + pad,
    };
  }
}
