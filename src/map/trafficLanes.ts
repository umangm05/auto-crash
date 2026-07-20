import { Vector2 } from '../core/Vector2';
import type { ChunkWorld } from './ChunkWorld';
import {
  isCityHStreet,
  isCityVStreet,
  isRoadLike,
  type CityStreet,
} from './biomes';

const SUPER = 36;

export type RoadAxis = 'h' | 'v';

/**
 * Two-way lane rules:
 * - Horizontal road: north half → left (west), south half → right (east)
 * - Vertical road: west half → up (north), east half → down (south)
 */
export interface LanePose {
  axis: RoadAxis;
  /** Exact cruise cardinal. */
  dir: Vector2;
  /** World-space center of this lane (x for V roads, y for H roads). */
  laneCoord: number;
  street: CityStreet;
  /** Global start cell of the street band. */
  streetStart: number;
}

function superId(g: number): number {
  return Math.floor(g / SUPER);
}

/** Lane center along the cross-axis for a street band + which half. */
function laneCenter(
  streetStart: number,
  width: number,
  leftHalf: boolean,
  cellSize: number,
): number {
  if (width <= 1) {
    const mid = streetStart * cellSize + cellSize * 0.5;
    return leftHalf ? mid - cellSize * 0.22 : mid + cellSize * 0.22;
  }
  const half = Math.floor(width / 2);
  const a = leftHalf ? streetStart : streetStart + half;
  const b = leftHalf ? streetStart + half : streetStart + width;
  const midCell = (a + b - 1) * 0.5;
  return midCell * cellSize + cellSize * 0.5;
}

function hStreetStart(globalRow: number, street: CityStreet): number {
  return superId(globalRow) * SUPER + street.local;
}

function vStreetStart(globalCol: number, street: CityStreet): number {
  return superId(globalCol) * SUPER + street.local;
}

/** Which half of the band is this cell/subcell on? */
function onLeftHalf(
  streetStart: number,
  width: number,
  cellIndex: number,
  crossPos: number,
  cellSize: number,
): boolean {
  if (width <= 1) {
    const mid = streetStart * cellSize + cellSize * 0.5;
    return crossPos < mid;
  }
  const half = Math.floor(width / 2);
  return cellIndex < streetStart + half;
}

/**
 * Resolve the legal lane at a world position.
 * Prefer pure H or V; at junctions use current heading to pick axis.
 */
export function resolveLane(
  world: ChunkWorld,
  x: number,
  y: number,
  preferDir?: Vector2,
): LanePose | null {
  const cell = world.worldToCell(x, y);
  if (!isRoadLike(world.getKind(cell.col, cell.row))) return null;

  const h = isCityHStreet(cell.row);
  const v = isCityVStreet(cell.col);
  const S = world.cellSize;

  if (h && !v) return poseFromH(h, cell.row, y, S);
  if (v && !h) return poseFromV(v, cell.col, x, S);

  if (h && v) {
    // Junction — keep current axis if possible
    if (preferDir) {
      if (Math.abs(preferDir.x) > Math.abs(preferDir.y)) {
        return poseFromH(h, cell.row, y, S);
      }
      return poseFromV(v, cell.col, x, S);
    }
    return poseFromH(h, cell.row, y, S);
  }

  // Bridge / road without arterial tag — infer from neighbors
  return inferFromNeighbors(world, cell.col, cell.row, x, y, preferDir);
}

function poseFromH(
  street: CityStreet,
  globalRow: number,
  y: number,
  cellSize: number,
): LanePose {
  const start = hStreetStart(globalRow, street);
  const left = onLeftHalf(start, street.width, globalRow, y, cellSize);
  return {
    axis: 'h',
    dir: left ? new Vector2(-1, 0) : new Vector2(1, 0),
    laneCoord: laneCenter(start, street.width, left, cellSize),
    street,
    streetStart: start,
  };
}

function poseFromV(
  street: CityStreet,
  globalCol: number,
  x: number,
  cellSize: number,
): LanePose {
  const start = vStreetStart(globalCol, street);
  const left = onLeftHalf(start, street.width, globalCol, x, cellSize);
  return {
    axis: 'v',
    dir: left ? new Vector2(0, -1) : new Vector2(0, 1),
    laneCoord: laneCenter(start, street.width, left, cellSize),
    street,
    streetStart: start,
  };
}

function inferFromNeighbors(
  world: ChunkWorld,
  col: number,
  row: number,
  x: number,
  y: number,
  preferDir?: Vector2,
): LanePose | null {
  const S = world.cellSize;
  const hRoad =
    isRoadLike(world.getKind(col - 1, row)) ||
    isRoadLike(world.getKind(col + 1, row));
  const vRoad =
    isRoadLike(world.getKind(col, row - 1)) ||
    isRoadLike(world.getKind(col, row + 1));

  if (hRoad && !vRoad) {
    const left = (y % S) < S * 0.5;
    return {
      axis: 'h',
      dir: left ? new Vector2(-1, 0) : new Vector2(1, 0),
      laneCoord: row * S + (left ? S * 0.28 : S * 0.72),
      street: { local: 0, width: 1, major: false, bridge: false },
      streetStart: row,
    };
  }
  if (vRoad && !hRoad) {
    const left = (x % S) < S * 0.5;
    return {
      axis: 'v',
      dir: left ? new Vector2(0, -1) : new Vector2(0, 1),
      laneCoord: col * S + (left ? S * 0.28 : S * 0.72),
      street: { local: 0, width: 1, major: false, bridge: false },
      streetStart: col,
    };
  }

  if (preferDir && Math.abs(preferDir.x) >= Math.abs(preferDir.y)) {
    const left = preferDir.x < 0;
    return {
      axis: 'h',
      dir: left ? new Vector2(-1, 0) : new Vector2(1, 0),
      laneCoord: row * S + (left ? S * 0.28 : S * 0.72),
      street: { local: 0, width: 1, major: false, bridge: false },
      streetStart: row,
    };
  }
  const up = !preferDir || preferDir.y < 0;
  return {
    axis: 'v',
    dir: up ? new Vector2(0, -1) : new Vector2(0, 1),
    laneCoord: col * S + (up ? S * 0.28 : S * 0.72),
    street: { local: 0, width: 1, major: false, bridge: false },
    streetStart: col,
  };
}

/** Legal turn targets at a junction from the current lane direction. */
export function junctionOptions(from: LanePose): Vector2[] {
  // Continue + left + right relative to travel (axis swap)
  const f = from.dir;
  const left = new Vector2(-f.y, f.x);
  const right = new Vector2(f.y, -f.x);
  return [f, left, right];
}

/**
 * After choosing a cardinal exit dir at a junction, build the matching lane pose
 * (dir forces which half of the destination road).
 */
export function lanePoseForDir(
  world: ChunkWorld,
  x: number,
  y: number,
  dir: Vector2,
): LanePose | null {
  const cell = world.worldToCell(x, y);
  const S = world.cellSize;
  const d = dir.x !== 0 ? new Vector2(Math.sign(dir.x), 0) : new Vector2(0, Math.sign(dir.y));

  if (d.x !== 0) {
    // Horizontal travel — need an H street at this row (or nearby)
    let street = isCityHStreet(cell.row);
    let row = cell.row;
    if (!street) {
      for (const dr of [0, -1, 1, -2, 2]) {
        street = isCityHStreet(cell.row + dr);
        if (street) {
          row = cell.row + dr;
          break;
        }
      }
    }
    if (!street) return null;
    const start = hStreetStart(row, street);
    const left = d.x < 0; // left/west uses north half
    return {
      axis: 'h',
      dir: d,
      laneCoord: laneCenter(start, street.width, left, S),
      street,
      streetStart: start,
    };
  }

  let street = isCityVStreet(cell.col);
  let col = cell.col;
  if (!street) {
    for (const dc of [0, -1, 1, -2, 2]) {
      street = isCityVStreet(cell.col + dc);
      if (street) {
        col = cell.col + dc;
        break;
      }
    }
  }
  if (!street) return null;
  const start = vStreetStart(col, street);
  const left = d.y < 0; // up uses west half
  return {
    axis: 'v',
    dir: d,
    laneCoord: laneCenter(start, street.width, left, S),
    street,
    streetStart: start,
  };
}

/** Soft-correct world position onto the lane centerline. */
export function snapToLane(
  pos: Vector2,
  lane: LanePose,
  strength = 1,
): Vector2 {
  if (lane.axis === 'h') {
    const y = pos.y + (lane.laneCoord - pos.y) * strength;
    return new Vector2(pos.x, y);
  }
  const x = pos.x + (lane.laneCoord - pos.x) * strength;
  return new Vector2(x, pos.y);
}
