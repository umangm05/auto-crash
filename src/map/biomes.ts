import type { Rng } from '../core/rng';
import { createRng, randInt } from '../core/rng';

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
    ground: '#3a4048',
    road: '#0a0a0a',
    roadEdge: '#e8e8e8',
    obstacle: '#3d4a56',
    obstacleStroke: '#1a1f26',
    grid: '#1f242c',
    junction: '#0a0a0a',
    bridge: '#0a0a0a',
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
  /** Open lot / sidewalk / park (drivable but slow). */
  OPEN = 0,
  /** Formal road / street. */
  ROAD = 1,
  /** Road junction / intersection (zebra painted). */
  JUNCTION = 2,
  /** Bridge deck over a river (drives like road). */
  BRIDGE = 3,
  /** Impassable building footprint. */
  BLOCK = 4,
  /** Impassable river — only crossable via BRIDGE. */
  GAP = 5,
  /** Park greenspace (walkable/slow like OPEN, painted green). */
  PARK = 6,
  /** Roadside railing patch — impassable barrier on a short stretch. */
  RAIL = 7,
}

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
  return kind !== CellKind.BLOCK && kind !== CellKind.GAP && kind !== CellKind.RAIL;
}

export function isRoadLike(kind: CellKind): boolean {
  return kind === CellKind.ROAD || kind === CellKind.JUNCTION || kind === CellKind.BRIDGE;
}

const BUILDING_PALETTE = ['#3d4a56', '#4a5560', '#2f3a44', '#55606a', '#3a424c', '#48525c', '#2a3340'];

/** Superblock size in cells — larger = fewer roads / bigger blocks. */
const SUPER = 36;

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

export type CityStreet = {
  local: number;
  width: number;
  major: boolean;
  /** Elevated deck asphalt (BRIDGE cells) for the whole arterial. */
  bridge: boolean;
};

/**
 * Road rarity: 40% 2-lane, 20% 4-lane, 20% 1-lane, 20% bridge (2-lane deck).
 */
function rollStreetProfile(rng: Rng): { width: number; bridge: boolean } {
  const r = rng();
  if (r < 0.4) return { width: 2, bridge: false };
  if (r < 0.6) return { width: 4, bridge: false };
  if (r < 0.8) return { width: 1, bridge: false };
  return { width: 2, bridge: true };
}

function setRoad(
  cells: CellKind[],
  size: number,
  c: number,
  r: number,
  bridge = false,
): void {
  if (c < 0 || r < 0 || c >= size || r >= size) return;
  const i = idx(size, c, r);
  const cur = cells[i]!;
  if (cur === CellKind.GAP) {
    cells[i] = CellKind.BRIDGE;
    return;
  }
  if (cur === CellKind.BRIDGE || cur === CellKind.JUNCTION) return;
  if (cur === CellKind.PARK) {
    cells[i] = bridge ? CellKind.BRIDGE : CellKind.ROAD;
    return;
  }
  cells[i] = bridge ? CellKind.BRIDGE : CellKind.ROAD;
}

function paintHSpan(
  cells: CellKind[],
  size: number,
  r: number,
  width: number,
  c0: number,
  c1: number,
  bridge = false,
): void {
  for (let w = 0; w < width; w++) {
    const row = r + w;
    if (row < 0 || row >= size) continue;
    for (let c = c0; c <= c1; c++) setRoad(cells, size, c, row, bridge);
  }
}

function paintVSpan(
  cells: CellKind[],
  size: number,
  c: number,
  width: number,
  r0: number,
  r1: number,
  bridge = false,
): void {
  for (let w = 0; w < width; w++) {
    const col = c + w;
    if (col < 0 || col >= size) continue;
    for (let r = r0; r <= r1; r++) setRoad(cells, size, col, r, bridge);
  }
}

function hash2(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
}

function superId(g: number): number {
  return Math.floor(g / SUPER);
}

function superLocal(g: number): number {
  return ((g % SUPER) + SUPER) % SUPER;
}

/**
 * Sparse irregular streets — edges keep chunks connected; interiors are few.
 * Width / bridge type follows ROAD_RARITY via rollStreetProfile.
 */
function vStreetsInSuper(sx: number): CityStreet[] {
  const rng = createRng(`vstreet|v9|${sx}`);
  const out: CityStreet[] = [];
  const major = sx % 4 === 0;
  const edge = rollStreetProfile(rng);
  out.push({ local: 0, width: edge.width, major, bridge: edge.bridge });

  // 1–2 interior streets only, wide gaps between blocks
  const interior = 1 + (rng() < 0.45 ? 1 : 0);
  let cursor = 8 + randInt(rng, 0, 6);
  for (let i = 0; i < interior && cursor < SUPER - 8; i++) {
    const p = rollStreetProfile(rng);
    out.push({ local: cursor, width: p.width, major: false, bridge: p.bridge });
    cursor += 10 + randInt(rng, 0, 8) + (p.width > 2 ? 2 : 0);
  }
  const end = rollStreetProfile(rng);
  out.push({
    local: Math.max(0, SUPER - end.width),
    width: end.width,
    major: false,
    bridge: end.bridge,
  });
  return dedupeStreets(out);
}

function hStreetsInSuper(sy: number): CityStreet[] {
  const rng = createRng(`hstreet|v9|${sy}`);
  const out: CityStreet[] = [];
  const major = sy % 4 === 0;
  const edge = rollStreetProfile(rng);
  out.push({ local: 0, width: edge.width, major, bridge: edge.bridge });

  const interior = 1 + (rng() < 0.4 ? 1 : 0);
  let cursor = 8 + randInt(rng, 0, 6);
  for (let i = 0; i < interior && cursor < SUPER - 8; i++) {
    const p = rollStreetProfile(rng);
    out.push({ local: cursor, width: p.width, major: false, bridge: p.bridge });
    cursor += 10 + randInt(rng, 0, 9) + (p.width > 2 ? 2 : 0);
  }
  const end = rollStreetProfile(rng);
  out.push({
    local: Math.max(0, SUPER - end.width),
    width: end.width,
    major: false,
    bridge: end.bridge,
  });
  return dedupeStreets(out);
}

function dedupeStreets(streets: CityStreet[]): CityStreet[] {
  const map = new Map<number, CityStreet>();
  for (const s of streets) {
    const prev = map.get(s.local);
    if (!prev || s.width > prev.width || s.major) map.set(s.local, s);
  }
  return [...map.values()].sort((a, b) => a.local - b.local);
}

export function isCityVStreet(globalC: number): CityStreet | null {
  const sx = superId(globalC);
  const local = superLocal(globalC);
  for (const s of vStreetsInSuper(sx)) {
    if (local >= s.local && local < s.local + s.width) return s;
  }
  return null;
}

export function isCityHStreet(globalR: number): CityStreet | null {
  const sy = superId(globalR);
  const local = superLocal(globalR);
  for (const s of hStreetsInSuper(sy)) {
    if (local >= s.local && local < s.local + s.width) return s;
  }
  return null;
}

/** Legacy helpers used by junction marking / docs. */
export function onCityHorizontal(globalR: number): boolean {
  return isCityHStreet(globalR) !== null;
}

export function onCityVertical(globalC: number): boolean {
  return isCityVStreet(globalC) !== null;
}

/**
 * City: continuous irregular H/V arterials (never cut), parks, river+bridges.
 * No post-hoc arm carving / diagonals — those were fragmenting the road network.
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

  const gC0 = cx * size;
  const gR0 = cy * size;

  // Full-span streets — always continuous across chunk borders.
  // Skip E-W arterials that fall inside the river band (V streets cross on bridges).
  for (let r = 0; r < size; r++) {
    const hs = isCityHStreet(gR0 + r);
    if (!hs) continue;
    if (inRiverBand(gR0 + r)) continue;
    paintHSpan(cells, size, r, 1, 0, size - 1, hs.bridge);
  }
  for (let c = 0; c < size; c++) {
    const vs = isCityVStreet(gC0 + c);
    if (!vs) continue;
    paintVSpan(cells, size, c, 1, 0, size - 1, vs.bridge);
  }

  paintParks(cells, size, rng, gC0, gR0);
  paintWorldRiverAndBridges(cells, size, cx, cy);
  paintRailPatches(cells, size, rng, gC0, gR0);

  const buildings = placeBuildings(cells, size, rng, density, cx, cy);
  markArterialCrossings(cells, size, cx, cy);

  return { cells, buildings };
}

/**
 * Short roadside railing patches — OPEN cells beside a road become impassable
 * RAIL for a few cells only (barrier the car cannot cross).
 */
function paintRailPatches(
  cells: CellKind[],
  size: number,
  rng: Rng,
  gC0: number,
  gR0: number,
): void {
  const patches = 2 + (rng() < 0.5 ? 1 : 0);
  for (let p = 0; p < patches; p++) {
    const alongH = rng() < 0.5;
    const len = 3 + randInt(rng, 0, 4); // small patch
    if (alongH) {
      // Find an H street row in this chunk
      let roadR = -1;
      for (let r = 0; r < size; r++) {
        if (isCityHStreet(gR0 + r) && !inRiverBand(gR0 + r)) {
          roadR = r;
          if (rng() < 0.4) break;
        }
      }
      if (roadR < 0) continue;
      const side = rng() < 0.5 ? -1 : 1; // north or south of road
      const railR = roadR + side;
      if (railR < 0 || railR >= size) continue;
      const c0 = randInt(rng, 1, Math.max(2, size - len));
      for (let c = c0; c < c0 + len && c < size; c++) {
        const i = idx(size, c, railR);
        if (cells[i] !== CellKind.OPEN) continue;
        // Must still be beside road
        if (!isRoadLike(cells[idx(size, c, roadR)]!)) continue;
        cells[i] = CellKind.RAIL;
      }
    } else {
      let roadC = -1;
      for (let c = 0; c < size; c++) {
        if (isCityVStreet(gC0 + c)) {
          roadC = c;
          if (rng() < 0.4) break;
        }
      }
      if (roadC < 0) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const railC = roadC + side;
      if (railC < 0 || railC >= size) continue;
      const r0 = randInt(rng, 1, Math.max(2, size - len));
      for (let r = r0; r < r0 + len && r < size; r++) {
        const i = idx(size, railC, r);
        if (cells[i] !== CellKind.OPEN) continue;
        if (!isRoadLike(cells[idx(size, roadC, r)]!)) continue;
        cells[i] = CellKind.RAIL;
      }
    }
  }
}

function paintParks(
  cells: CellKind[],
  size: number,
  rng: Rng,
  gC0: number,
  gR0: number,
): void {
  const parkRng = createRng(`park|${Math.floor(gC0 / SUPER)}|${Math.floor(gR0 / SUPER)}`);
  if (parkRng() > 0.45) return;

  const pw = 3 + randInt(rng, 0, 3);
  const ph = 3 + randInt(rng, 0, 3);
  const c0 = randInt(rng, 1, Math.max(2, size - pw));
  const r0 = randInt(rng, 1, Math.max(2, size - ph));
  for (let r = r0; r < r0 + ph && r < size; r++) {
    for (let c = c0; c < c0 + pw && c < size; c++) {
      const i = idx(size, c, r);
      if (isRoadLike(cells[i]!)) continue;
      cells[i] = CellKind.PARK;
    }
  }
}

/** Mark every cell in an H∩V arterial cross as JUNCTION (for gameplay). */
function markArterialCrossings(
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
      if (isCityHStreet(gR) && isCityVStreet(gC)) {
        cells[i] = CellKind.JUNCTION;
      }
    }
  }
}

/** One intersection rect per H∩V arterial cross — used to paint a single zebra. */
export interface IntersectionRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export function collectIntersections(
  minC: number,
  maxC: number,
  minR: number,
  maxR: number,
): IntersectionRect[] {
  const out: IntersectionRect[] = [];
  const seen = new Set<string>();
  // Pad so anchors just outside view still draw if their rect overlaps
  for (let gR = minR - 2; gR <= maxR + 2; gR++) {
    for (let gC = minC - 2; gC <= maxC + 2; gC++) {
      const vs = isCityVStreet(gC);
      const hs = isCityHStreet(gR);
      if (!vs || !hs) continue;
      const aC = superId(gC) * SUPER + vs.local;
      const aR = superId(gR) * SUPER + hs.local;
      if (gC !== aC || gR !== aR) continue;
      const key = `${aC},${aR}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ col: aC, row: aR, w: vs.width, h: hs.width });
    }
  }
  return out;
}

/**
 * River band stays blue water. Bridges are SHORT spans only where a
 * vertical street crosses — never convert the whole river into a brown deck.
 */
const RIVER_PERIOD = 48;
const RIVER_WIDTH = 3;
const RIVER_START = 20;

function inRiverBand(globalR: number): boolean {
  const mod = ((globalR % RIVER_PERIOD) + RIVER_PERIOD) % RIVER_PERIOD;
  return mod >= RIVER_START && mod < RIVER_START + RIVER_WIDTH;
}

function paintWorldRiverAndBridges(
  cells: CellKind[],
  size: number,
  cx: number,
  cy: number,
): void {
  for (let r = 0; r < size; r++) {
    if (!inRiverBand(cy * size + r)) continue;
    for (let c = 0; c < size; c++) {
      cells[idx(size, c, r)] = CellKind.GAP;
    }
  }

  // Bridges: vertical streets only — short black decks over blue water
  for (let c = 0; c < size; c++) {
    const vs = isCityVStreet(cx * size + c);
    if (!vs) continue;
    // Only convert the start column of a V band (avoid double-widen)
    if (superLocal(cx * size + c) !== vs.local) continue;
    for (let w = 0; w < vs.width; w++) {
      const col = c + w;
      if (col >= size) break;
      for (let r = 0; r < size; r++) {
        if (cells[idx(size, col, r)] === CellKind.GAP) {
          cells[idx(size, col, r)] = CellKind.BRIDGE;
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
  // Sparse roads leave more lots — pack them with buildings
  const attempts = 36 + Math.floor(density * 40);

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
    [5, 4],
    [6, 3],
    [3, 6],
    [5, 5],
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

  // Fill leftover OPEN lots with smaller blocks so the city feels dense
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = idx(size, c, r);
      if (cells[i] !== CellKind.OPEN || occupied[i]) continue;
      if (rng() > 0.55 + density * 0.25) continue;
      const bw = rng() < 0.5 ? 1 : 2;
      const bh = rng() < 0.5 ? 1 : 2;
      if (c + bw > size || r + bh > size) continue;
      if (!canPlaceBuilding(cells, occupied, size, c, r, bw, bh)) continue;
      for (let rr = r; rr < r + bh; rr++) {
        for (let cc = c; cc < c + bw; cc++) {
          const j = idx(size, cc, rr);
          cells[j] = CellKind.BLOCK;
          occupied[j] = 1;
        }
      }
      buildings.push({
        col: cx * size + c,
        row: cy * size + r,
        w: bw,
        h: bh,
        color: BUILDING_PALETTE[randInt(rng, 0, BUILDING_PALETTE.length)]!,
      });
    }
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
  for (let r = r0; r < r0 + bh; r++) {
    for (let c = c0; c < c0 + bw; c++) {
      const i = idx(size, c, r);
      const kind = cells[i]!;
      if (kind !== CellKind.OPEN || occupied[i]) return false;
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

// silence unused in case tree-shaken oddly in some builds
void hash2;
