import type { Rng } from '../core/rng';
import { randInt } from '../core/rng';

export type Biome = 'city' | 'desert' | 'rural';

export const BIOME_LABELS: Record<Biome, string> = {
  city: 'City',
  desert: 'Desert',
  rural: 'Rural',
};

/** Biomes available on the setup screen right now. Others stay implemented. */
export const ENABLED_BIOMES: Biome[] = ['city'];

export const BIOME_COLORS: Record<
  Biome,
  {
    ground: string;
    road: string;
    roadEdge: string;
    obstacle: string;
    obstacleStroke: string;
    grid: string;
    junction: string;
    bridge: string;
    gap: string;
  }
> = {
  city: {
    ground: '#2c3138',
    road: '#0c0c0c',
    roadEdge: '#f0f0f0',
    obstacle: '#3a4550',
    obstacleStroke: '#1a1f26',
    grid: '#1f242c',
    junction: '#0c0c0c',
    bridge: '#6b6358',
    gap: '#1a6fb5',
  },
  desert: {
    ground: '#2a2118',
    road: '#3a2f22',
    roadEdge: '#5a4a35',
    obstacle: '#6b5340',
    obstacleStroke: '#8a6d4f',
    grid: '#3a3025',
    junction: '#3a2f22',
    bridge: '#4a3a28',
    gap: '#1a2830',
  },
  rural: {
    ground: '#121a12',
    road: '#2a2418',
    roadEdge: '#4a3f2a',
    obstacle: '#1e2e1a',
    obstacleStroke: '#3a5a32',
    grid: '#1a2418',
    junction: '#322c1e',
    bridge: '#3a3220',
    gap: '#0e1a22',
  },
};

/** Cell kinds used by chunk generation / rendering. */
export enum CellKind {
  /** Open lot / sidewalk (city) or open field. */
  OPEN = 0,
  /** Formal road / street. */
  ROAD = 1,
  /** Road junction / intersection (zebra painted). */
  JUNCTION = 2,
  /** Bridge over a river. */
  BRIDGE = 3,
  /** Impassable obstacle (building footprint cells). */
  BLOCK = 4,
  /** Impassable river — only crossable via BRIDGE. */
  GAP = 5,
}

/** Axis-aligned building footprint in global cell coords. */
export interface BuildingRect {
  col: number;
  row: number;
  w: number;
  h: number;
  color: string;
}

export interface ChunkGenResult {
  cells: CellKind[];
  buildings: BuildingRect[];
}

export function isWalkableKind(kind: CellKind): boolean {
  return kind !== CellKind.BLOCK && kind !== CellKind.GAP;
}

export function isRoadLike(kind: CellKind): boolean {
  return kind === CellKind.ROAD || kind === CellKind.JUNCTION || kind === CellKind.BRIDGE;
}

const BUILDING_PALETTE = ['#3d4a56', '#4a5560', '#2f3a44', '#55606a', '#3a424c', '#48525c'];

/**
 * Generate one chunk. Global cell = chunk * size + local.
 */
export function generateChunkCells(
  biome: Biome,
  chunkCol: number,
  chunkRow: number,
  size: number,
  rng: Rng,
  density: number,
): ChunkGenResult {
  const cells = new Array<CellKind>(size * size);
  if (biome === 'city') return genCity(cells, size, rng, density, chunkCol, chunkRow);
  if (biome === 'desert') {
    genDesert(cells, size, rng, density);
    return { cells, buildings: [] };
  }
  genRural(cells, size, rng, density, chunkCol, chunkRow);
  return { cells, buildings: [] };
}

function idx(size: number, c: number, r: number): number {
  return r * size + c;
}

/** Paint road without inventing junctions (junctions are a final H∩V pass). */
function setRoad(cells: CellKind[], size: number, c: number, r: number): void {
  if (c < 0 || r < 0 || c >= size || r >= size) return;
  const i = idx(size, c, r);
  const cur = cells[i]!;
  if (cur === CellKind.GAP) {
    cells[i] = CellKind.BRIDGE;
    return;
  }
  if (cur === CellKind.BRIDGE || cur === CellKind.JUNCTION) return;
  cells[i] = CellKind.ROAD;
}

function paintHRoad(cells: CellKind[], size: number, r: number, width: number): void {
  for (let w = 0; w < width; w++) {
    const row = r + w;
    if (row < 0 || row >= size) continue;
    for (let c = 0; c < size; c++) setRoad(cells, size, c, row);
  }
}

function paintVRoad(cells: CellKind[], size: number, c: number, width: number): void {
  for (let w = 0; w < width; w++) {
    const col = c + w;
    if (col < 0 || col >= size) continue;
    for (let r = 0; r < size; r++) setRoad(cells, size, col, r);
  }
}

/** World arterial periods — shared so junctions = H∩V in world space. */
export const CITY_GRID = {
  H_PERIOD: 8,
  V_PERIOD: 8,
  H_WIDTH: 2,
  V_WIDTH: 2,
  H2_PERIOD: 20,
  V2_PERIOD: 20,
  H2_OFFSET: 5,
  V2_OFFSET: 9,
} as const;

export function onCityHorizontal(globalR: number): boolean {
  const { H_PERIOD, H_WIDTH, H2_PERIOD, H2_OFFSET } = CITY_GRID;
  const mod = ((globalR % H_PERIOD) + H_PERIOD) % H_PERIOD;
  const mod2 = ((globalR % H2_PERIOD) + H2_PERIOD) % H2_PERIOD;
  return mod < H_WIDTH || mod2 === H2_OFFSET;
}

export function onCityVertical(globalC: number): boolean {
  const { V_PERIOD, V_WIDTH, V2_PERIOD, V2_OFFSET } = CITY_GRID;
  const mod = ((globalC % V_PERIOD) + V_PERIOD) % V_PERIOD;
  const mod2 = ((globalC % V2_PERIOD) + V2_PERIOD) % V2_PERIOD;
  return mod < V_WIDTH || mod2 === V2_OFFSET;
}

/**
 * Junctions ONLY where a horizontal arterial crosses a vertical one.
 * Neighbor-counting is wrong for dual-lane roads (parallel lane looks like a cross).
 */
function markWorldJunctions(
  cells: CellKind[],
  size: number,
  cx: number,
  cy: number,
): void {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = idx(size, col, row);
      if (cells[i] !== CellKind.ROAD) continue;
      const gC = cx * size + col;
      const gR = cy * size + row;
      if (onCityHorizontal(gR) && onCityVertical(gC)) {
        cells[i] = CellKind.JUNCTION;
      }
    }
  }
}

/**
 * City: world-aligned continuous arterials (no dead ends), rivers + bridges,
 * random rectangular buildings. Junctions = world H∩V only.
 */
function genCity(
  cells: CellKind[],
  size: number,
  rng: Rng,
  density: number,
  cx: number,
  cy: number,
): ChunkGenResult {
  cells.fill(CellKind.OPEN);

  for (let r = 0; r < size; r++) {
    if (onCityHorizontal(cy * size + r)) paintHRoad(cells, size, r, 1);
  }
  for (let c = 0; c < size; c++) {
    if (onCityVertical(cx * size + c)) paintVRoad(cells, size, c, 1);
  }

  paintWorldRiverAndBridges(cells, size, cx, cy);

  const buildings = placeBuildings(cells, size, rng, density, cx, cy);
  markWorldJunctions(cells, size, cx, cy);

  return { cells, buildings };
}

/** Horizontal river every ~40 world cells; vertical roads become bridges. */
function paintWorldRiverAndBridges(
  cells: CellKind[],
  size: number,
  _cx: number,
  cy: number,
): void {
  const RIVER_PERIOD = 40;
  const RIVER_WIDTH = 3;
  const RIVER_START = 16; // band within period

  // Snapshot which cells were road before carving the river
  const wasRoad = new Uint8Array(size * size);
  for (let i = 0; i < cells.length; i++) {
    if (isRoadLike(cells[i]!)) wasRoad[i] = 1;
  }

  for (let r = 0; r < size; r++) {
    const globalR = cy * size + r;
    const mod = ((globalR % RIVER_PERIOD) + RIVER_PERIOD) % RIVER_PERIOD;
    if (mod < RIVER_START || mod >= RIVER_START + RIVER_WIDTH) continue;
    for (let c = 0; c < size; c++) {
      cells[idx(size, c, r)] = CellKind.GAP;
    }
  }

  // Bridges: where a vertical road crossed the river, restore a deck
  for (let c = 0; c < size; c++) {
    let hadRoadInCol = false;
    for (let r = 0; r < size; r++) {
      if (wasRoad[idx(size, c, r)]) {
        hadRoadInCol = true;
        break;
      }
    }
    if (!hadRoadInCol) continue;
    for (let r = 0; r < size; r++) {
      if (cells[idx(size, c, r)] === CellKind.GAP && wasRoad[idx(size, c, r)]) {
        cells[idx(size, c, r)] = CellKind.BRIDGE;
      }
    }
    // Widen bridge by 1 cell when the neighboring column also had a road
    if (c + 1 < size) {
      let adj = false;
      for (let r = 0; r < size; r++) {
        if (wasRoad[idx(size, c + 1, r)]) {
          adj = true;
          break;
        }
      }
      if (adj) {
        for (let r = 0; r < size; r++) {
          if (cells[idx(size, c + 1, r)] === CellKind.GAP) {
            cells[idx(size, c + 1, r)] = CellKind.BRIDGE;
          }
        }
      }
    }
  }
}

function placeBuildings(
  cells: CellKind[],
  size: number,
  rng: Rng,
  density: number,
  cx: number,
  cy: number,
): BuildingRect[] {
  const buildings: BuildingRect[] = [];
  const occupied = new Uint8Array(size * size);
  const attempts = 14 + Math.floor(density * 20);

  const sizes: Array<[number, number]> = [
    [2, 2],
    [2, 3],
    [3, 2],
    [3, 3],
    [2, 4],
    [4, 2],
    [3, 4],
    [4, 3],
    [4, 4],
    [5, 3],
    [3, 5],
  ];

  for (let n = 0; n < attempts; n++) {
    const [bw, bh] = sizes[randInt(rng, 0, sizes.length)]!;
    const c0 = randInt(rng, 0, size - bw + 1);
    const r0 = randInt(rng, 0, size - bh + 1);
    if (!canPlaceBuilding(cells, occupied, size, c0, r0, bw, bh)) continue;

    for (let r = r0; r < r0 + bh; r++) {
      for (let c = c0; c < c0 + bw; c++) {
        const i = idx(size, c, r);
        cells[i] = CellKind.BLOCK;
        occupied[i] = 1;
      }
    }
    buildings.push({
      col: cx * size + c0,
      row: cy * size + r0,
      w: bw,
      h: bh,
      color: BUILDING_PALETTE[randInt(rng, 0, BUILDING_PALETTE.length)]!,
    });
  }
  return buildings;
}

function canPlaceBuilding(
  cells: CellKind[],
  occupied: Uint8Array,
  size: number,
  c0: number,
  r0: number,
  bw: number,
  bh: number,
): boolean {
  // Footprint must be open lots only — may sit flush against the curb
  for (let r = r0; r < r0 + bh; r++) {
    for (let c = c0; c < c0 + bw; c++) {
      const i = idx(size, c, r);
      if (cells[i] !== CellKind.OPEN || occupied[i]) return false;
    }
  }
  return true;
}

function genDesert(cells: CellKind[], size: number, rng: Rng, density: number): void {
  cells.fill(CellKind.OPEN);
  const rockChance = 0.035 + density * 0.07;
  for (let i = 0; i < cells.length; i++) {
    if (rng() < rockChance) cells[i] = CellKind.BLOCK;
  }
  for (let k = 0; k < 2; k++) {
    const r = randInt(rng, 0, size);
    for (let c = 0; c < size; c++) cells[idx(size, c, r)] = CellKind.OPEN;
    const c = randInt(rng, 0, size);
    for (let row = 0; row < size; row++) cells[idx(size, c, row)] = CellKind.OPEN;
  }
}

function genRural(
  cells: CellKind[],
  size: number,
  rng: Rng,
  density: number,
  cx: number,
  cy: number,
): void {
  cells.fill(CellKind.OPEN);
  const entrySide = Math.abs(cx + cy) % 4;
  let c = entrySide === 0 ? 0 : entrySide === 1 ? size - 1 : randInt(rng, 2, size - 2);
  let r = entrySide === 2 ? 0 : entrySide === 3 ? size - 1 : randInt(rng, 2, size - 2);
  const roadWidth = rng() < 0.55 ? 1 : 2;
  const steps = size * (2 + Math.floor(rng() * 3));
  for (let s = 0; s < steps; s++) {
    for (let w = 0; w < roadWidth; w++) {
      const rr = Math.min(size - 1, r + w);
      cells[idx(size, c, rr)] = CellKind.ROAD;
    }
    const dir = rng();
    if (dir < 0.35) c = Math.min(size - 1, c + 1);
    else if (dir < 0.55) c = Math.max(0, c - 1);
    else if (dir < 0.78) r = Math.min(size - 1, r + 1);
    else r = Math.max(0, r - 1);
  }
  const obstacleChance = 0.03 + density * 0.06;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === CellKind.OPEN && rng() < obstacleChance) cells[i] = CellKind.BLOCK;
  }
}
