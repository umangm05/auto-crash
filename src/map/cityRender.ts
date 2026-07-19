import {
  CellKind,
  collectIntersections,
  isCityHStreet,
  isCityVStreet,
  isRoadLike,
  type BuildingRect,
} from './biomes';

const CELL_SIZE = 40;

/** City asphalt / marking palette — high contrast so roads read clearly. */
export const CITY_PAINT = {
  sidewalk: '#3a4048',
  asphalt: '#0a0a0a',
  mark: '#e8e8e8',
  zebra: '#f5f5f5',
  river: '#1a6fb5',
  riverDeep: '#0e4a7a',
  bridge: '#0a0a0a',
  bridgeRail: '#c4b8a8',
  park: '#2d5a3d',
  parkLight: '#3a6b4a',
  buildingStroke: '#1a1f26',
  rail: '#8a9099',
  railDark: '#5a6068',
} as const;

type KindAt = (col: number, row: number) => CellKind;

function isDrive(kind: CellKind): boolean {
  return kind === CellKind.ROAD || kind === CellKind.JUNCTION || kind === CellKind.BRIDGE;
}

/**
 * City paint: continuous black asphalt, white curbs, dashed lane split,
 * ONE zebra rectangle per arterial cross, blue river, bridges, buildings.
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

  // 2) Parks
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      if (getKind(col, row) !== CellKind.PARK) continue;
      ctx.fillStyle = (col + row) % 2 === 0 ? CITY_PAINT.park : CITY_PAINT.parkLight;
      ctx.fillRect(col * S, row * S, S, S);
    }
  }

  // 2b) Roadside railing patches (impassable)
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      if (getKind(col, row) !== CellKind.RAIL) continue;
      paintRailing(ctx, col, row, getKind, S);
    }
  }

  // 3) River
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

  // 4) Solid black asphalt
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      if (!isDrive(getKind(col, row))) continue;
      ctx.fillStyle = CITY_PAINT.asphalt;
      ctx.fillRect(col * S, row * S, S, S);
    }
  }

  // 5) Lane markings (skip junction cells — zebra owns those)
  ctx.lineCap = 'butt';
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      const kind = getKind(col, row);
      if (kind !== CellKind.ROAD && kind !== CellKind.BRIDGE) continue;
      paintLaneMarkings(ctx, col, row, getKind, S);
    }
  }

  // 6) One zebra pad per intersection (aligned to the full cross rect)
  const crosses = collectIntersections(minC, maxC, minR, maxR);
  for (const cross of crosses) {
    paintIntersectionZebra(ctx, cross.col, cross.row, cross.w, cross.h, S);
  }

  // 7) Bridge rails
  ctx.strokeStyle = CITY_PAINT.bridgeRail;
  ctx.lineWidth = 2.5;
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

  // 8) Buildings
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
    ctx.fillStyle = 'rgba(100, 180, 255, 0.12)';
    const win = Math.min(7, Math.min(w, h) * 0.18);
    for (let wy = y + 5; wy < y + h - 5; wy += win + 5) {
      for (let wx = x + 5; wx < x + w - 5; wx += win + 5) {
        ctx.fillRect(wx, wy, win, win);
      }
    }
  }
}

function isLanePaint(kind: CellKind): boolean {
  return kind === CellKind.ROAD || kind === CellKind.BRIDGE;
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

  // White curb only where road meets non-road
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

  // Dashed lane dividers — one line per shared edge so multi-lane strips
  // (2–4 lanes) get markings between every pair of lanes.
  ctx.strokeStyle = 'rgba(232,232,232,0.9)';
  ctx.lineWidth = 1.5;
  const phase = ((col + row) * 7) % 24;

  const hStreet = isCityHStreet(row);
  const vStreet = isCityVStreet(col);
  const onH = hStreet !== null;
  const onV = vStreet !== null;

  if (onH && !onV) {
    // Pure E-W strip: divider on south edge when the cell below is the next lane
    if (
      hStreet!.width > 1 &&
      isLanePaint(getKind(col, row + 1)) &&
      isCityHStreet(row + 1)
    ) {
      dashLinePhased(ctx, x, y + S, x + S, y + S, phase);
    } else if (hStreet!.width === 1) {
      dashLinePhased(ctx, x, y + S / 2, x + S, y + S / 2, phase);
    }
  } else if (onV && !onH) {
    // Pure N-S strip: divider on east edge when the cell to the right is the next lane
    if (
      vStreet!.width > 1 &&
      isLanePaint(getKind(col + 1, row)) &&
      isCityVStreet(col + 1)
    ) {
      dashLinePhased(ctx, x + S, y, x + S, y + S, phase);
    } else if (vStreet!.width === 1) {
      dashLinePhased(ctx, x + S / 2, y, x + S / 2, y + S, phase);
    }
  }
  // Junction cells / H∩V overlaps: zebra owns the paint — no lane dashes
}

function dashLinePhased(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  phase: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return;
  const ux = dx / len;
  const uy = dy / len;
  const dash = 14;
  const gap = 10;
  const period = dash + gap;
  let t = -((phase % period) + period) % period;
  ctx.beginPath();
  while (t < len) {
    const a = Math.max(0, t);
    const b = Math.min(len, t + dash);
    if (b > a) {
      ctx.moveTo(x0 + ux * a, y0 + uy * a);
      ctx.lineTo(x0 + ux * b, y0 + uy * b);
    }
    t += period;
  }
  ctx.stroke();
}

function paintRailing(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  getKind: KindAt,
  S: number,
): void {
  const x = col * S;
  const y = row * S;
  // Sidewalk under, metal rail on the road-facing edge
  ctx.fillStyle = CITY_PAINT.sidewalk;
  ctx.fillRect(x, y, S, S);

  const roadR = isRoadLike(getKind(col + 1, row));
  const roadL = isRoadLike(getKind(col - 1, row));
  const roadD = isRoadLike(getKind(col, row + 1));
  const roadU = isRoadLike(getKind(col, row - 1));

  ctx.strokeStyle = CITY_PAINT.rail;
  ctx.fillStyle = CITY_PAINT.railDark;
  ctx.lineWidth = 3;

  if (roadR || roadL) {
    // Vertical railing along N-S road
    const rx = roadR ? x + S - 5 : x + 2;
    ctx.beginPath();
    ctx.moveTo(rx, y + 2);
    ctx.lineTo(rx, y + S - 2);
    ctx.stroke();
    for (let py = y + 6; py < y + S - 4; py += 10) {
      ctx.fillRect(rx - 2, py, 5, 4);
    }
  } else if (roadU || roadD) {
    const ry = roadD ? y + S - 5 : y + 2;
    ctx.beginPath();
    ctx.moveTo(x + 2, ry);
    ctx.lineTo(x + S - 2, ry);
    ctx.stroke();
    for (let px = x + 6; px < x + S - 4; px += 10) {
      ctx.fillRect(px, ry - 2, 4, 5);
    }
  } else {
    // Fallback bar
    ctx.fillRect(x + 4, y + S / 2 - 2, S - 8, 4);
  }
}

/** Single aligned zebra covering the whole H∩V cross rectangle. */
function paintIntersectionZebra(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  wCells: number,
  hCells: number,
  S: number,
): void {
  const x = col * S;
  const y = row * S;
  const w = wCells * S;
  const h = hCells * S;

  // Vertical bars across the intersection (classic crosswalk look)
  ctx.fillStyle = CITY_PAINT.zebra;
  const bar = 5;
  const gap = 5;
  const inset = 3;
  for (let px = inset; px < w - inset; px += bar + gap) {
    ctx.fillRect(x + px, y + inset, bar, h - inset * 2);
  }
}
