import { Vector2 } from '../core/Vector2';
import { createRng, randInt } from '../core/rng';
import { COLORS, GAMEPLAY } from '../config/GameConfig';
import { isRoadLike } from './biomes';
import type { ChunkWorld } from './ChunkWorld';

export interface Spill {
  center: Vector2;
  radius: number;
}

/**
 * Dynamic Road Spill events: every 20s mark a random walkable cell near the
 * focus that cuts local tire traction by 50%.
 */
export class RoadSpillManager {
  private spills: Spill[] = [];
  private timer = 0;
  private readonly rngSeed: string;

  constructor(seed: string) {
    this.rngSeed = seed;
  }

  update(dt: number, world: ChunkWorld, focus: Vector2, elapsed: number): void {
    this.timer += dt;
    if (this.timer < GAMEPLAY.spillIntervalSec) return;
    this.timer = 0;
    this.spawnSpill(world, focus, elapsed);
  }

  private spawnSpill(world: ChunkWorld, focus: Vector2, elapsed: number): void {
    const rng = createRng(`${this.rngSeed}|spill|${Math.floor(elapsed)}`);
    const origin = world.worldToCell(focus.x, focus.y);
    const roadCandidates: Array<{ col: number; row: number }> = [];
    const anyCandidates: Array<{ col: number; row: number }> = [];
    for (let r = -10; r <= 10; r++) {
      for (let c = -10; c <= 10; c++) {
        const col = origin.col + c;
        const row = origin.row + r;
        if (!world.isWalkable(col, row)) continue;
        anyCandidates.push({ col, row });
        if (isRoadLike(world.getKind(col, row))) roadCandidates.push({ col, row });
      }
    }
    const pool = roadCandidates.length ? roadCandidates : anyCandidates;
    if (!pool.length) return;
    const pick = pool[randInt(rng, 0, pool.length)]!;
    if (this.spills.length >= 4) this.spills.shift();
    this.spills.push({
      center: world.cellCenter(pick.col, pick.row),
      radius: world.cellSize * GAMEPLAY.spillRadiusCells,
    });
  }

  tractionAt(pos: Vector2): number {
    for (const s of this.spills) {
      if (pos.distance(s.center) <= s.radius) return 0.5;
    }
    return 1;
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const s of this.spills) {
      ctx.save();
      ctx.fillStyle = COLORS.spill;
      ctx.strokeStyle = COLORS.spillStroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s.center.x, s.center.y, s.radius, s.radius * 0.55, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,80,0.85)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPILL', s.center.x, s.center.y + 3);
      ctx.restore();
    }
  }

  clear(): void {
    this.spills = [];
    this.timer = 0;
  }
}
