import { COLORS } from '../config/GameConfig';
import type { Camera } from '../core/Camera';
import type { Cop } from '../entities/Cop';

const EDGE_PAD = 22;
const MARKER_R = 9;

/**
 * Screen-edge dots for cops outside the viewport so the thief can see
 * which direction pressure is coming from.
 */
export function renderOffscreenCopMarkers(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewW: number,
  viewH: number,
  cops: readonly Cop[],
  timeSec: number,
): void {
  const cx = viewW * 0.5;
  const cy = viewH * 0.5;
  const pulse = 0.55 + 0.45 * Math.sin(timeSec * 6);

  for (const cop of cops) {
    if (!cop.offScreen) continue;
    const sx = cop.car.pos.x - camera.x;
    const sy = cop.car.pos.y - camera.y;

    // Already inside the padded screen — skip (offScreen flag can lag a frame)
    if (
      sx >= EDGE_PAD &&
      sx <= viewW - EDGE_PAD &&
      sy >= EDGE_PAD &&
      sy <= viewH - EDGE_PAD
    ) {
      continue;
    }

    const edge = projectToEdge(cx, cy, sx, sy, viewW, viewH, EDGE_PAD);
    if (!edge) continue;

    const blink = (cop.index & 1) === 0;
    const color = blink
      ? `rgba(255, 59, 59, ${0.55 + 0.45 * pulse})`
      : `rgba(59, 130, 255, ${0.55 + 0.45 * pulse})`;

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(edge.x, edge.y, MARKER_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Small inward tick so direction reads clearly
    const ang = Math.atan2(sy - cy, sx - cx);
    ctx.beginPath();
    ctx.moveTo(edge.x, edge.y);
    ctx.lineTo(
      edge.x - Math.cos(ang) * (MARKER_R + 5),
      edge.y - Math.sin(ang) * (MARKER_R + 5),
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/** Ray from screen center through (sx,sy) clamped to the padded rectangle. */
function projectToEdge(
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  viewW: number,
  viewH: number,
  pad: number,
): { x: number; y: number } | null {
  let dx = sx - cx;
  let dy = sy - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return { x: cx, y: pad };
  }

  const minX = pad;
  const maxX = viewW - pad;
  const minY = pad;
  const maxY = viewH - pad;

  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (maxX - cx) / dx);
  else if (dx < -1e-6) t = Math.min(t, (minX - cx) / dx);
  if (dy > 1e-6) t = Math.min(t, (maxY - cy) / dy);
  else if (dy < -1e-6) t = Math.min(t, (minY - cy) / dy);

  if (!Number.isFinite(t) || t <= 0) return null;

  return {
    x: Math.max(minX, Math.min(maxX, cx + dx * t)),
    y: Math.max(minY, Math.min(maxY, cy + dy * t)),
  };
}
