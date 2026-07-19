import Matter from 'matter-js';
import { Vector2 } from '../core/Vector2';
import type { Car } from '../entities/Car';
import { isRoadLike } from './biomes';
import type { ChunkWorld } from './ChunkWorld';
import { nearestRoadPoint } from './Pathfinding';

/** Walkable, and if roadsOnly then must be asphalt. */
export function isTraversable(
  world: ChunkWorld,
  col: number,
  row: number,
  roadsOnly = false,
): boolean {
  if (!world.isWalkable(col, row)) return false;
  if (roadsOnly && !isRoadLike(world.getKind(col, row))) return false;
  return true;
}

/**
 * Solid wall response. When `roadsOnly`, OPEN/PARK lots act as walls so cars
 * scrape along the curb instead of entering and getting teleported.
 */
export function resolveCarAgainstGrid(
  car: Car,
  world: ChunkWorld,
  opts?: { roadsOnly?: boolean },
): void {
  const roadsOnly = opts?.roadsOnly ?? false;
  for (let iter = 0; iter < 3; iter++) {
    const hit = resolveOnce(car, world, roadsOnly);
    if (!hit) break;
  }

  // Deeply stuck in a solid / lot — nudge to nearest valid cell (no full respawn loop)
  const cell = world.worldToCell(car.pos.x, car.pos.y);
  if (!isTraversable(world, cell.col, cell.row, roadsOnly)) {
    softRecover(car, world, roadsOnly);
  }
}

/**
 * Gentle curb recovery if somehow inside a lot. Pulls toward asphalt without
 * zeroing speed / teleporting to a distant road center (that caused the loop).
 */
function softRecover(car: Car, world: ChunkWorld, roadsOnly: boolean): void {
  const target = roadsOnly
    ? nearestRoadPoint(world, car.pos, 10)
    : (() => {
        const cell = world.worldToCell(car.pos.x, car.pos.y);
        for (let r = 1; r <= 4; r++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const c = cell.col + dx;
              const row = cell.row + dy;
              if (world.isWalkable(c, row)) return world.cellCenter(c, row);
            }
          }
        }
        return null;
      })();
  if (!target) return;

  const pos = car.pos;
  const to = target.sub(pos);
  const dist = to.length();
  if (dist < 1e-3) return;

  // Step at most ~1/3 of a cell per recovery — keeps motion continuous
  const step = Math.min(dist, world.cellSize * 0.35);
  const n = to.normalize();
  Matter.Body.setPosition(car.body, {
    x: pos.x + n.x * step,
    y: pos.y + n.y * step,
  });

  // Kill only the velocity component pointing deeper into the lot
  const vx = car.body.velocity.x;
  const vy = car.body.velocity.y;
  const intoLot = -(vx * n.x + vy * n.y);
  if (intoLot > 0) {
    Matter.Body.setVelocity(car.body, {
      x: vx + n.x * intoLot,
      y: vy + n.y * intoLot,
    });
  }
}

function resolveOnce(car: Car, world: ChunkWorld, roadsOnly: boolean): boolean {
  const pos = car.pos;
  const cell = world.worldToCell(pos.x, pos.y);
  const radius = Math.max(car.body.circleRadius ?? 0, 11);
  let hit = false;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = cell.col + dx;
      const r = cell.row + dy;
      if (isTraversable(world, c, r, roadsOnly)) continue;

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
      pos.x = car.body.position.x;
      pos.y = car.body.position.y;
    }
  }
  return hit;
}

/** Sample along a ray; return first solid hit (BLOCK, or lot when roadsOnly). */
export function raycastGrid(
  world: ChunkWorld,
  from: Vector2,
  to: Vector2,
  step = 6,
  opts?: { roadsOnly?: boolean },
): Vector2 | null {
  const roadsOnly = opts?.roadsOnly ?? false;
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
    if (!isTraversable(world, cell.col, cell.row, roadsOnly)) {
      return new Vector2(x, y);
    }
  }
  return null;
}
