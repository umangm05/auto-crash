import { CellKind, isRoadLike, type BuildingRect } from './biomes';

const CELL_SIZE = 40;

/** City asphalt / marking palette — high contrast so roads read clearly. */
export const CITY_PAINT = {
  sidewalk: '#3a4048',
  asphalt: '#0a0a0a',
  mark: '#e8e8e8',
  zebra: '#f5f5f5',
  river: '#1a6fb5',
  riverDeep: '#0e4a7a',
  bridge: '#6b6358',
  bridgeRail: '#9a9080',
  buildingStroke: '#1a1f26',
} as const;

type KindAt = (col: number, row: number) => CellKind;

function isDrive(kind: CellKind): boolean {
  return kind === CellKind.ROAD || kind === CellKind.JUNCTION || kind === CellKind.BRIDGE;
}

function dashLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dash = 12,
  gap = 10,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return;
  const ux = dx / len;
  const uy = dy / len;
  let t = 0;
  ctx.beginPath();
  while (t < len) {
    const a = t;
    const b = Math.min(len, t + dash);
    ctx.moveTo(x0 + ux * a, y0 + uy * a);
    ctx.lineTo(x0 + ux * b, y0 + uy * b);
    t += dash + gap;
  }
  ctx.stroke();
}

/**
 * City paint: black asphalt, white curbs, dashed lane split,
 * zebra ONLY on true junctions, blue river, bridges, rect buildings.
 */
export function renderCityViewport(
  ctx: CanvasRenderingContext2D,
  view: { minX: number; minY: number; maxX: number; maxY: number },
  minC: number,
  maxC: number,
  minR: number,
  maxR: number,
  getKind: KindAt,
  buildings: BuildingRect[],
): void {
  const S = CELL_SIZE;

  // 1) Sidewalk / lots
  ctx.fillStyle = CITY_PAINT.sidewalk;
  ctx.fillRect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);

  // 2) River
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      if (getKind(col, row) !== CellKind.GAP) continue;
      const x = col * S;
      const y = row * S;
      const grad = ctx.createLinearGradient(x, y, x, y + S);
      grad.addColorStop(0, CITY_PAINT.river);
      grad.addColorStop(0.5, CITY_PAINT.riverDeep);
      grad.addColorStop(1, CITY_PAINT.river);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, S, S);
    }
  }

  // 3) Solid black asphalt (roads + junctions + bridges)
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      const kind = getKind(col, row);
      if (!isDrive(kind)) continue;
      ctx.fillStyle = kind === CellKind.BRIDGE ? CITY_PAINT.bridge : CITY_PAINT.asphalt;
      ctx.fillRect(col * S, row * S, S, S);
    }
  }

  // 4) Lane markings on ROAD / BRIDGE only — never zebra here
  ctx.lineCap = 'butt';
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      const kind = getKind(col, row);
      if (kind !== CellKind.ROAD && kind !== CellKind.BRIDGE) continue;
      paintLaneMarkings(ctx, col, row, getKind, S);
    }
  }

  // 5) Compact zebra pads only on JUNCTION cells
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      if (getKind(col, row) !== CellKind.JUNCTION) continue;
      paintZebraPad(ctx, col, row, getKind, S);
    }
  }

  // 6) Bridge rails
  ctx.strokeStyle = CITY_PAINT.bridgeRail;
  ctx.lineWidth = 2;
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      if (getKind(col, row) !== CellKind.BRIDGE) continue;
      const x = col * S;
      const y = row * S;
      ctx.beginPath();
      if (getKind(col, row - 1) === CellKind.GAP) {
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x + S, y + 3);
      }
      if (getKind(col, row + 1) === CellKind.GAP) {
        ctx.moveTo(x, y + S - 3);
        ctx.lineTo(x + S, y + S - 3);
      }
      if (getKind(col - 1, row) === CellKind.GAP) {
        ctx.moveTo(x + 3, y);
        ctx.lineTo(x + 3, y + S);
      }
      if (getKind(col + 1, row) === CellKind.GAP) {
        ctx.moveTo(x + S - 3, y);
        ctx.lineTo(x + S - 3, y + S);
      }
      ctx.stroke();
    }
  }

  // 7) Buildings
  for (const b of buildings) {
    const x = b.col * S + 2;
    const y = b.row * S + 2;
    const w = b.w * S - 4;
    const h = b.h * S - 4;
    if (x + w < view.minX || y + h < view.minY || x > view.maxX || y > view.maxY) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = CITY_PAINT.buildingStroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = 'rgba(100, 180, 255, 0.15)';
    const win = Math.min(7, Math.min(w, h) * 0.18);
    for (let wy = y + 5; wy < y + h - 5; wy += win + 5) {
      for (let wx = x + 5; wx < x + w - 5; wx += win + 5) {
        ctx.fillRect(wx, wy, win, win);
      }
    }
  }
}

function paintLaneMarkings(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  getKind: KindAt,
  S: number,
): void {
  const x = col * S;
  const y = row * S;
  const L = isRoadLike(getKind(col - 1, row));
  const R = isRoadLike(getKind(col + 1, row));
  const U = isRoadLike(getKind(col, row - 1));
  const D = isRoadLike(getKind(col, row + 1));

  // White curb ONLY on edges that meet sidewalk / building / river (not other road)
  ctx.strokeStyle = CITY_PAINT.mark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (!U) {
    ctx.moveTo(x, y + 1.5);
    ctx.lineTo(x + S, y + 1.5);
  }
  if (!D) {
    ctx.moveTo(x, y + S - 1.5);
    ctx.lineTo(x + S, y + S - 1.5);
  }
  if (!L) {
    ctx.moveTo(x + 1.5, y);
    ctx.lineTo(x + 1.5, y + S);
  }
  if (!R) {
    ctx.moveTo(x + S - 1.5, y);
    ctx.lineTo(x + S - 1.5, y + S);
  }
  ctx.stroke();

  // Dashed lane split — one line, sparse dashes (not a zebra fill)
  ctx.strokeStyle = 'rgba(232,232,232,0.85)';
  ctx.lineWidth = 1.5;

  // Dual-lane E-W: dashed on the shared edge of the top cell only
  if (U === false && D === true && (L || R)) {
    dashLine(ctx, x + 4, y + S, x + S - 4, y + S, 14, 12);
    return;
  }
  // Dual-lane N-S: dashed on shared edge of left cell only
  if (L === false && R === true && (U || D)) {
    dashLine(ctx, x + S, y + 4, x + S, y + S - 4, 14, 12);
    return;
  }
  // Single-lane E-W
  if ((L || R) && !U && !D) {
    dashLine(ctx, x + 4, y + S / 2, x + S - 4, y + S / 2, 14, 12);
    return;
  }
  // Single-lane N-S
  if ((U || D) && !L && !R) {
    dashLine(ctx, x + S / 2, y + 4, x + S / 2, y + S - 4, 14, 12);
  }
}

/**
 * Small crosswalk pad in the intersection — not a full-tile stripe wallpaper.
 */
function paintZebraPad(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  getKind: KindAt,
  S: number,
): void {
  const x = col * S;
  const y = row * S;

  // Keep black asphalt under a small inset zebra
  const L = getKind(col - 1, row) === CellKind.ROAD || getKind(col - 1, row) === CellKind.BRIDGE;
  const R = getKind(col + 1, row) === CellKind.ROAD || getKind(col + 1, row) === CellKind.BRIDGE;
  const U = getKind(col, row - 1) === CellKind.ROAD || getKind(col, row - 1) === CellKind.BRIDGE;
  const D = getKind(col, row + 1) === CellKind.ROAD || getKind(col, row + 1) === CellKind.BRIDGE;

  ctx.fillStyle = CITY_PAINT.zebra;
  const stripe = 3;
  const gap = 3;

  // Paint short crosswalk bands only on sides that face an incoming road (not another junction lane)
  if (U) {
    for (let i = 8; i < S - 8; i += stripe + gap) {
      ctx.fillRect(x + i, y + 4, stripe, 8);
    }
  }
  if (D) {
    for (let i = 8; i < S - 8; i += stripe + gap) {
      ctx.fillRect(x + i, y + S - 12, stripe, 8);
    }
  }
  if (L) {
    for (let i = 8; i < S - 8; i += stripe + gap) {
      ctx.fillRect(x + 4, y + i, 8, stripe);
    }
  }
  if (R) {
    for (let i = 8; i < S - 8; i += stripe + gap) {
      ctx.fillRect(x + S - 12, y + i, 8, stripe);
    }
  }
}
