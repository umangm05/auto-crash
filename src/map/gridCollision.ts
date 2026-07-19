import Matter from 'matter-js';
import { Vector2 } from '../core/Vector2';
import type { ChunkWorld } from './ChunkWorld';
import type { Car } from '../entities/Car';

/**
 * Solid wall response: push out of BLOCK cells, kill into-wall speed,
 * scrape along walls. Runs a few iterations so cars can't tunnel.
 */
export function resolveCarAgainstGrid(car: Car, world: ChunkWorld): void {
  for (let iter = 0; iter < 3; iter++) {
    const hit = resolveOnce(car, world);
    if (!hit) break;
  }

  // If still inside a block (tunnel), snap to nearest walkable center
  const cell = world.worldToCell(car.pos.x, car.pos.y);
  if (!world.isWalkable(cell.col, cell.row)) {
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const c = cell.col + dx;
          const row = cell.row + dy;
          if (!world.isWalkable(c, row)) continue;
          const p = world.cellCenter(c, row);
          Matter.Body.setPosition(car.body, { x: p.x, y: p.y });
          Matter.Body.setVelocity(car.body, { x: 0, y: 0 });
          return;
        }
      }
    }
  }
}

function resolveOnce(car: Car, world: ChunkWorld): boolean {
  const pos = car.pos;
  const cell = world.worldToCell(pos.x, pos.y);
  const radius = Math.max(car.body.circleRadius ?? 0, 11);
  let hit = false;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = cell.col + dx;
      const r = cell.row + dy;
      if (world.isWalkable(c, r)) continue;

      const cx = c * world.cellSize + world.cellSize / 2;
      const cy = r * world.cellSize + world.cellSize / 2;
      const half = world.cellSize / 2 - 0.5;

      const closestX = Math.max(cx - half, Math.min(pos.x, cx + half));
      const closestY = Math.max(cy - half, Math.min(pos.y, cy + half));
      let ox = pos.x - closestX;
      let oy = pos.y - closestY;
      let distSq = ox * ox + oy * oy;

      if (distSq >= radius * radius) continue;
      hit = true;

      let nx: number;
      let ny: number;
      if (distSq < 1e-8) {
        const toLeft = pos.x - (cx - half);
        const toRight = cx + half - pos.x;
        const toTop = pos.y - (cy - half);
        const toBottom = cy + half - pos.y;
        const m = Math.min(toLeft, toRight, toTop, toBottom);
        if (m === toLeft) {
          nx = -1;
          ny = 0;
        } else if (m === toRight) {
          nx = 1;
          ny = 0;
        } else if (m === toTop) {
          nx = 0;
          ny = -1;
        } else {
          nx = 0;
          ny = 1;
        }
        Matter.Body.setPosition(car.body, {
          x: pos.x + nx * (radius + 0.5),
          y: pos.y + ny * (radius + 0.5),
        });
      } else {
        const dist = Math.sqrt(distSq);
        nx = ox / dist;
        ny = oy / dist;
        const push = radius - dist + 0.5;
        Matter.Body.setPosition(car.body, {
          x: pos.x + nx * push,
          y: pos.y + ny * push,
        });
      }

      car.onHitWall(new Vector2(nx!, ny!), 1);
      // refresh pos for next neighbor in this iteration
      pos.x = car.body.position.x;
      pos.y = car.body.position.y;
    }
  }
  return hit;
}

/** Sample along a ray; return first BLOCK hit point, or null. */
export function raycastGrid(
  world: ChunkWorld,
  from: Vector2,
  to: Vector2,
  step = 6,
): Vector2 | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;
  const steps = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const cell = world.worldToCell(x, y);
    if (!world.isWalkable(cell.col, cell.row)) {
      return new Vector2(x, y);
    }
  }
  return null;
}
