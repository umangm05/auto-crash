import { Vector2 } from '../core/Vector2';
import { createRng } from '../core/rng';
import type { Difficulty } from '../core/types';
import { DIFFICULTY_PRESETS } from '../config/GameConfig';
import {
  BIOME_COLORS,
  CellKind,
  generateChunkCells,
  isWalkableKind,
  type Biome,
  type BuildingRect,
} from './biomes';
import { renderCityViewport } from './cityRender';

export const CHUNK_SIZE = 16;
export const CELL_SIZE = 40;

interface Chunk {
  col: number;
  row: number;
  cells: CellKind[];
  buildings: BuildingRect[];
}

/**
 * Infinite streaming world — cell data only.
 * Buildings are NOT Matter bodies (that froze the tab). Collision uses grid tests.
 */
export class ChunkWorld {
  readonly cellSize = CELL_SIZE;
  readonly biome: Biome;
  private readonly seed: string;
  private readonly density: number;
  private readonly chunks = new Map<string, Chunk>();

  constructor(seed: string, biome: Biome, difficulty: Difficulty) {
    this.seed = seed;
    this.biome = biome;
    this.density = DIFFICULTY_PRESETS[difficulty].density;
  }

  private key(cc: number, cr: number): string {
    return `${cc},${cr}`;
  }

  worldToCell(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor(x / this.cellSize),
      row: Math.floor(y / this.cellSize),
    };
  }

  cellCenter(col: number, row: number): Vector2 {
    return new Vector2(
      col * this.cellSize + this.cellSize / 2,
      row * this.cellSize + this.cellSize / 2,
    );
  }

  private chunkCoord(cell: number): { chunk: number; local: number } {
    const chunk = Math.floor(cell / CHUNK_SIZE);
    const local = ((cell % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return { chunk, local };
  }

  private ensureChunkData(cc: number, cr: number): Chunk {
    const k = this.key(cc, cr);
    let chunk = this.chunks.get(k);
    if (chunk) return chunk;

    // Bump version when city layout rules change so old seeds regenerate cleanly
    const rng = createRng(`${this.seed}|${this.biome}|v8|${cc}|${cr}`);
    const gen = generateChunkCells(
      this.biome,
      cc,
      cr,
      CHUNK_SIZE,
      rng,
      this.density,
    );
    chunk = { col: cc, row: cr, cells: gen.cells, buildings: gen.buildings };
    this.chunks.set(k, chunk);
    return chunk;
  }

  /** Prefetch chunk cell data around a world position (no physics). */
  updateAround(worldX: number, worldY: number, radius = 2): void {
    const cell = this.worldToCell(worldX, worldY);
    const cc0 = this.chunkCoord(cell.col).chunk;
    const cr0 = this.chunkCoord(cell.row).chunk;

    const keep = new Set<string>();
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const k = this.key(cc0 + dc, cr0 + dr);
        keep.add(k);
        this.ensureChunkData(cc0 + dc, cr0 + dr);
      }
    }

    if (this.chunks.size > keep.size + 24) {
      for (const k of this.chunks.keys()) {
        if (keep.has(k)) continue;
        this.chunks.delete(k);
        if (this.chunks.size <= keep.size + 24) break;
      }
    }
  }

  /**
   * Ensure chunks exist around a point without culling others.
   * Used for off-screen cops so A* still sees the road network.
   */
  prefetchAround(worldX: number, worldY: number, radius = 1): void {
    const cell = this.worldToCell(worldX, worldY);
    const cc0 = this.chunkCoord(cell.col).chunk;
    const cr0 = this.chunkCoord(cell.row).chunk;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        this.ensureChunkData(cc0 + dc, cr0 + dr);
      }
    }
  }

  getKind(col: number, row: number): CellKind {
    const cx = this.chunkCoord(col);
    const cy = this.chunkCoord(row);
    const chunk = this.ensureChunkData(cx.chunk, cy.chunk);
    return chunk.cells[cy.local * CHUNK_SIZE + cx.local]!;
  }

  isWalkable(col: number, row: number): boolean {
    return isWalkableKind(this.getKind(col, row));
  }

  neighbors4(col: number, row: number): Array<{ col: number; row: number }> {
    return [
      { col: col + 1, row },
      { col: col - 1, row },
      { col, row: row + 1 },
      { col, row: row - 1 },
    ];
  }

  streetDegree(col: number, row: number): number {
    if (!this.isWalkable(col, row)) return 0;
    let n = 0;
    for (const nb of this.neighbors4(col, row)) {
      if (this.isWalkable(nb.col, nb.row)) n++;
    }
    return n;
  }

  findSpawnNear(x: number, y: number, maxR = 12): Vector2 {
    const origin = this.worldToCell(x, y);
    this.updateAround(x, y, 1);
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r && r > 0) continue;
          const c = origin.col + dx;
          const row = origin.row + dy;
          const kind = this.getKind(c, row);
          // Prefer actual roads for city spawns
          if (kind === CellKind.ROAD || kind === CellKind.JUNCTION || kind === CellKind.BRIDGE) {
            return this.cellCenter(c, row);
          }
        }
      }
    }
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r && r > 0) continue;
          const c = origin.col + dx;
          const row = origin.row + dy;
          if (this.isWalkable(c, row)) return this.cellCenter(c, row);
        }
      }
    }
    return this.cellCenter(origin.col, origin.row);
  }

  cellInDirection(from: Vector2, dir: Vector2, distanceCells: number): Vector2 {
    const n = dir.length() < 1e-4 ? new Vector2(1, 0) : dir.normalize();
    const start = this.worldToCell(from.x, from.y);
    const tx = start.col + Math.round(n.x * distanceCells);
    const ty = start.row + Math.round(n.y * distanceCells);
    for (let r = 0; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const c = tx + dx;
          const row = ty + dy;
          if (this.isWalkable(c, row)) return this.cellCenter(c, row);
        }
      }
    }
    return this.cellCenter(tx, ty);
  }

  private buildingsInView(
    minC: number,
    maxC: number,
    minR: number,
    maxR: number,
  ): BuildingRect[] {
    const c0 = this.chunkCoord(minC).chunk;
    const c1 = this.chunkCoord(maxC).chunk;
    const r0 = this.chunkCoord(minR).chunk;
    const r1 = this.chunkCoord(maxR).chunk;
    const out: BuildingRect[] = [];
    for (let cr = r0; cr <= r1; cr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const chunk = this.ensureChunkData(cc, cr);
        for (const b of chunk.buildings) out.push(b);
      }
    }
    return out;
  }

  render(
    ctx: CanvasRenderingContext2D,
    view: { minX: number; minY: number; maxX: number; maxY: number },
  ): void {
    const colors = BIOME_COLORS[this.biome];
    if (
      !Number.isFinite(view.minX) ||
      !Number.isFinite(view.maxX) ||
      !Number.isFinite(view.minY) ||
      !Number.isFinite(view.maxY)
    ) {
      return;
    }

    const SAFE = Number.MAX_SAFE_INTEGER - 10_000;
    const clampSafe = (n: number) => Math.max(-SAFE, Math.min(SAFE, Math.trunc(n)));

    let minC = clampSafe(Math.floor(view.minX / this.cellSize) - 1);
    let maxC = clampSafe(Math.ceil(view.maxX / this.cellSize) + 1);
    let minR = clampSafe(Math.floor(view.minY / this.cellSize) - 1);
    let maxR = clampSafe(Math.ceil(view.maxY / this.cellSize) + 1);

    const MAX_SPAN = 64;
    if (!Number.isFinite(minC) || !Number.isFinite(maxC) || maxC < minC) return;
    if (!Number.isFinite(minR) || !Number.isFinite(maxR) || maxR < minR) return;
    if (maxC - minC > MAX_SPAN) {
      const mid = Math.floor((minC + maxC) / 2);
      minC = mid - (MAX_SPAN >> 1);
      maxC = minC + MAX_SPAN;
    }
    if (maxR - minR > MAX_SPAN) {
      const mid = Math.floor((minR + maxR) / 2);
      minR = mid - (MAX_SPAN >> 1);
      maxR = minR + MAX_SPAN;
    }

    const c0 = this.chunkCoord(minC).chunk;
    const c1 = this.chunkCoord(maxC).chunk;
    const r0 = this.chunkCoord(minR).chunk;
    const r1 = this.chunkCoord(maxR).chunk;
    for (let cr = r0; cr <= r1; cr++) {
      for (let cc = c0; cc <= c1; cc++) {
        this.ensureChunkData(cc, cr);
      }
    }

    if (this.biome === 'city') {
      const buildings = this.buildingsInView(minC, maxC, minR, maxR);
      renderCityViewport(
        ctx,
        view,
        minC,
        maxC,
        minR,
        maxR,
        (col, row) => this.getKind(col, row),
        buildings,
      );
      return;
    }

    // Legacy desert / rural paint (kept for later re-enable)
    ctx.fillStyle = colors.ground;
    ctx.fillRect(
      view.minX,
      view.minY,
      Math.min(view.maxX - view.minX, this.cellSize * MAX_SPAN),
      Math.min(view.maxY - view.minY, this.cellSize * MAX_SPAN),
    );

    ctx.fillStyle = colors.gap;
    for (let row = minR; row <= maxR; row++) {
      for (let col = minC; col <= maxC; col++) {
        if (this.getKind(col, row) !== CellKind.GAP) continue;
        ctx.fillRect(col * this.cellSize, row * this.cellSize, this.cellSize, this.cellSize);
      }
    }

    ctx.fillStyle = colors.obstacle;
    for (let row = minR; row <= maxR; row++) {
      for (let col = minC; col <= maxC; col++) {
        if (this.getKind(col, row) !== CellKind.BLOCK) continue;
        ctx.fillRect(
          col * this.cellSize + 1,
          row * this.cellSize + 1,
          this.cellSize - 2,
          this.cellSize - 2,
        );
      }
    }

    for (let row = minR; row <= maxR; row++) {
      for (let col = minC; col <= maxC; col++) {
        const kind = this.getKind(col, row);
        if (kind !== CellKind.ROAD && kind !== CellKind.JUNCTION && kind !== CellKind.BRIDGE) {
          continue;
        }
        if (kind === CellKind.BRIDGE) ctx.fillStyle = colors.bridge;
        else if (kind === CellKind.JUNCTION) ctx.fillStyle = colors.junction;
        else ctx.fillStyle = colors.road;
        ctx.fillRect(col * this.cellSize, row * this.cellSize, this.cellSize, this.cellSize);
      }
    }
  }

  clear(): void {
    this.chunks.clear();
  }
}
