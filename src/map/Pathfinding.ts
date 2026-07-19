import { Vector2 } from '../core/Vector2';
import type { ChunkWorld } from './ChunkWorld';
import { isRoadLike } from './biomes';

interface Node {
  col: number;
  row: number;
  g: number;
  f: number;
  parent: Node | null;
}

export interface FindPathOptions {
  maxNodes?: number;
  /** When true, only ROAD / JUNCTION / BRIDGE cells are traversable. */
  roadsOnly?: boolean;
}

function key(col: number, row: number): string {
  return `${col},${row}`;
}

function cellAllowed(world: ChunkWorld, col: number, row: number, roadsOnly: boolean): boolean {
  if (!world.isWalkable(col, row)) return false;
  if (!roadsOnly) return true;
  return isRoadLike(world.getKind(col, row));
}

/** Bounded A* — routes around BLOCK cells; prefers roads (or roads-only). */
export function findPath(
  world: ChunkWorld,
  start: Vector2,
  goal: Vector2,
  maxNodesOrOpts: number | FindPathOptions = 360,
): Vector2[] {
  const opts: FindPathOptions =
    typeof maxNodesOrOpts === 'number' ? { maxNodes: maxNodesOrOpts } : maxNodesOrOpts;
  const maxNodes = opts.maxNodes ?? 360;
  const roadsOnly = opts.roadsOnly ?? false;

  const s = world.worldToCell(start.x, start.y);
  const g = world.worldToCell(goal.x, goal.y);

  const startCell = roadsOnly
    ? nearestRoad(world, s.col, s.row, 14)
    : nearestWalkable(world, s.col, s.row, 6);
  let goalCell = roadsOnly
    ? nearestRoad(world, g.col, g.row, 14)
    : nearestWalkable(world, g.col, g.row, 6);
  if (!startCell || !goalCell) return [];

  // Clamp goal to a nearby waypoint if too far (roads wind farther than crow-flies)
  const md =
    Math.abs(startCell.col - goalCell.col) + Math.abs(startCell.row - goalCell.row);
  const far = roadsOnly ? 40 : 28;
  if (md > far) {
    const hop = roadsOnly ? 22 : 18;
    const dirC = Math.sign(goalCell.col - startCell.col);
    const dirR = Math.sign(goalCell.row - startCell.row);
    goalCell =
      (roadsOnly
        ? nearestRoad(world, startCell.col + dirC * hop, startCell.row + dirR * hop, 14) ??
          roadProgressToward(world, startCell, goalCell, hop)
        : nearestWalkable(world, startCell.col + dirC * hop, startCell.row + dirR * hop, 6)) ??
      goalCell;
  }

  if (startCell.col === goalCell.col && startCell.row === goalCell.row) {
    return [world.cellCenter(goalCell.col, goalCell.row)];
  }

  const open: Node[] = [];
  const openMap = new Map<string, Node>();
  const closed = new Set<string>();

  const startNode: Node = {
    col: startCell.col,
    row: startCell.row,
    g: 0,
    f: manhattan(startCell, goalCell),
    parent: null,
  };
  open.push(startNode);
  openMap.set(key(startNode.col, startNode.row), startNode);

  let expanded = 0;
  let bestReach: Node = startNode;

  while (open.length && expanded < maxNodes) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIdx]!.f) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0]!;
    const ck = key(current.col, current.row);
    openMap.delete(ck);
    closed.add(ck);
    expanded++;

    if (manhattan(current, goalCell) < manhattan(bestReach, goalCell)) {
      bestReach = current;
    }

    if (current.col === goalCell.col && current.row === goalCell.row) {
      return reconstruct(world, current);
    }

    for (const n of world.neighbors4(current.col, current.row)) {
      if (!cellAllowed(world, n.col, n.row, roadsOnly)) continue;
      const span = roadsOnly ? 72 : 26;
      if (
        Math.abs(n.col - startCell.col) > span ||
        Math.abs(n.row - startCell.row) > span
      ) {
        continue;
      }
      const nk = key(n.col, n.row);
      if (closed.has(nk)) continue;
      const kind = world.getKind(n.col, n.row);
      const stepCost = roadsOnly ? 1 : isRoadLike(kind) ? 1 : 4.5;
      const tg = current.g + stepCost;
      const existing = openMap.get(nk);
      if (!existing || tg < existing.g) {
        const node: Node = {
          col: n.col,
          row: n.row,
          g: tg,
          f: tg + manhattan(n, goalCell),
          parent: current,
        };
        if (existing) {
          const idx = open.indexOf(existing);
          if (idx >= 0) open.splice(idx, 1);
        }
        open.push(node);
        openMap.set(nk, node);
      }
    }
  }

  return reconstruct(world, bestReach);
}

function manhattan(
  a: { col: number; row: number },
  b: { col: number; row: number },
): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function reconstruct(world: ChunkWorld, node: Node): Vector2[] {
  const path: Vector2[] = [];
  let cur: Node | null = node;
  let guard = 0;
  // Roads-only arterials can be long — truncating here dropped the start of the
  // path so cars aimed at a far waypoint through lots and stuck on curbs.
  while (cur && guard++ < 220) {
    path.push(world.cellCenter(cur.col, cur.row));
    cur = cur.parent;
  }
  path.reverse();
  return path;
}

/**
 * Greedy road walk toward a goal cell — used when crow-flies nearest-road
 * lands off the connected network (block interiors).
 */
function roadProgressToward(
  world: ChunkWorld,
  start: { col: number; row: number },
  goal: { col: number; row: number },
  maxSteps: number,
): { col: number; row: number } | null {
  let cur = { col: start.col, row: start.row };
  if (!isRoadLike(world.getKind(cur.col, cur.row))) {
    const near = nearestRoad(world, cur.col, cur.row, 14);
    if (!near) return null;
    cur = near;
  }
  for (let step = 0; step < maxSteps; step++) {
    let best: { col: number; row: number } | null = null;
    let bestMd = manhattan(cur, goal);
    for (const n of world.neighbors4(cur.col, cur.row)) {
      if (!isRoadLike(world.getKind(n.col, n.row))) continue;
      const md = manhattan(n, goal);
      if (md < bestMd) {
        bestMd = md;
        best = n;
      }
    }
    if (!best) break;
    cur = best;
    if (manhattan(cur, goal) <= 1) break;
  }
  return cur;
}

export function nearestWalkable(
  world: ChunkWorld,
  col: number,
  row: number,
  maxR = 8,
): { col: number; row: number } | null {
  if (world.isWalkable(col, row)) return { col, row };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const c = col + dx;
        const rr = row + dy;
        if (world.isWalkable(c, rr)) return { col: c, row: rr };
      }
    }
  }
  return null;
}

/** Nearest ROAD / JUNCTION / BRIDGE cell (spiral search). */
export function nearestRoad(
  world: ChunkWorld,
  col: number,
  row: number,
  maxR = 14,
): { col: number; row: number } | null {
  if (isRoadLike(world.getKind(col, row))) return { col, row };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const c = col + dx;
        const rr = row + dy;
        if (isRoadLike(world.getKind(c, rr))) return { col: c, row: rr };
      }
    }
  }
  return null;
}

/** World-space center of the nearest road cell to a point. */
export function nearestRoadPoint(world: ChunkWorld, pos: Vector2, maxR = 14): Vector2 | null {
  const cell = world.worldToCell(pos.x, pos.y);
  const road = nearestRoad(world, cell.col, cell.row, maxR);
  return road ? world.cellCenter(road.col, road.row) : null;
}

export function nearestIntersectionAhead(
  world: ChunkWorld,
  from: Vector2,
  velocity: Vector2,
  maxLookCells = 10,
): Vector2 | null {
  const dir = velocity.length() < 1e-3 ? Vector2.fromAngle(0) : velocity.normalize();
  let best: Vector2 | null = null;
  let bestScore = Infinity;
  const origin = world.worldToCell(from.x, from.y);

  for (let r = 1; r <= maxLookCells; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const c = origin.col + dx;
        const row = origin.row + dy;
        if (world.streetDegree(c, row) < 3) continue;
        const center = world.cellCenter(c, row);
        const to = center.sub(from);
        if (to.dot(dir) < 0) continue;
        const dist = to.length();
        const lateral = Math.abs(to.x * dir.y - to.y * dir.x);
        const score = dist + lateral * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = center;
        }
      }
    }
  }
  return best;
}
