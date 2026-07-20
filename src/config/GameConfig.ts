import type { BehaviorConfig, Difficulty } from '../core/types';
import { DEFAULT_BEHAVIOR } from '../core/types';

export const COLORS = {
  background: '#0d1117',
  grid: '#1f242c',
  building: '#161b22',
  buildingStroke: '#30363d',
  street: '#0d1117',
  thief: '#39ff14',
  thiefGlow: 'rgba(57, 255, 20, 0.45)',
  copRed: '#ff3b3b',
  copBlue: '#3b82ff',
  spill: 'rgba(255, 200, 40, 0.35)',
  spillStroke: 'rgba(255, 180, 0, 0.7)',
  text: '#e6edf3',
  accent: '#58a6ff',
} as const;

/** Arcade car feel — readable chase (~1.5 cells/sec at 40px cells). */
export const CAR = {
  width: 22,
  height: 12,
  /** px/sec at full throttle, aggression 0.5, speedMult 1 */
  maxSpeed: 5,
  /** rad/sec turn at low speed; falls off as speed rises */
  maxTurnRate: 4,
  /** How quickly velocity aligns to heading (higher = snappier, less drift) */
  baseGrip: 0.5,
  /** Extra slip on spills / low driftStability */
  spillGripScale: 0.45,
  accel: 30,
  brake: 70,
  coastDrag: 0.45,
  massApprox: 1,
  /** Max-speed scale when driving on sidewalk / open lot (not road/bridge). */
  offRoadSpeedScale: 0.32,
  /** Extra drag while off-road so cars don't skim lots at full cruise. */
  offRoadDrag: 1.8,
} as const;

export const STEERING = {
  seekWeight: 1.0,
  fleeWeight: 1.15,
  avoidWeight: 4.0,
  feelerLength: 96,
  feelerSpread: 0.65,
  sideProbeLength: 48,
  waypointArriveRadius: 18,
  interceptLookahead: 0.85,
} as const;

export const GAMEPLAY = {
  copSpawnIntervalSec: 10,
  /** Periodic intel ping — refreshes radio even without a visual */
  radioIntelIntervalSec: 2,
  spillIntervalSec: 20,
  /** Spill ellipse radius in world cells (was ~0.7). */
  spillRadiusCells: 2.4,
  copSpeedGrowthPerCycle: 0.03,
  /** Hard cap so late-game cops don't become rockets */
  maxCopSpeedMult: 1.35,
  /** Thief top-speed multiplier vs a baseline cop (speedMult 1) */
  thiefSpeedMult: 1.1,
  /** Nitro: active duration, refill after boost ends, speed while boosting */
  nitroDurationSec: 1,
  nitroCooldownSec: 5,
  /** Multiplier on thief top speed while nitro burns (must be >1). */
  nitroSpeedMult: 1.2,
  /** Extra accel while nitro is burning (base accel is too weak to hit 1.5× in 1s). */
  nitroAccelScale: 2.4,
  /** Cop proximity glow / sense baseline */
  baseCopSenseRadius: 200,
  /** Thief proximity is always 1.5x cop baseline */
  baseFleeRadius: 300,
  maxCops: 10,
  /** Preferred spawn distance on a ring around the thief — beyond a typical viewport edge */
  copSpawnDistance: 1000,
  /** Never place a cop closer than this (avoids instant catch after road snap) */
  copSpawnMinDistance: 800,
  /**
   * When true, sense-gated off-road is allowed (cops cut lots only with thief
   * in sense; thief stays on road only while cops are in sense).
   * When false, thief and cops are always roads-only — no lot driving.
   */
  allowOffRoad: false,
  /**
   * Off-screen catch-up multiplier — only while the cop is on asphalt.
   * Off-screen cops also use roads-only A* (no lot cutting).
   */
  offScreenSpeedMult: 2.75,
  /** Must stay nearly motionless this long before counting as wedged. */
  copStuckSpeed: 2.5,
  /** Faster unwedge — curb pins used to sit for 8s doing nothing useful. */
  copStuckTimeSec: 3.5,
  /** Also require almost no position change while "stuck". */
  copStuckMovePx: 18,
  catchRadius: 20,
  /**
   * AI thief must change route at least this often (seconds of nearly-straight
   * driving). Stops monotonous single-axis chases.
   */
  thiefMaxStraightSec: 10,
} as const;

export const DIFFICULTY_PRESETS: Record<
  Difficulty,
  { density: number; streetWidth: number; opponent: BehaviorConfig; label: string }
> = {
  easy: {
    density: 0.28,
    streetWidth: 3,
    label: 'Open Grid',
    opponent: {
      aggression: 0.4,
      driftStability: 0.75,
      proximityPanic: 0.35,
      pathStyle: 'Linear',
    },
  },
  medium: {
    density: 0.45,
    streetWidth: 2,
    label: 'Alleyway Maze',
    opponent: {
      aggression: 0.55,
      driftStability: 0.55,
      proximityPanic: 0.55,
      pathStyle: 'Linear',
    },
  },
  hard: {
    density: 0.62,
    streetWidth: 2,
    label: 'Dense Obstacles',
    opponent: {
      aggression: 0.75,
      driftStability: 0.35,
      proximityPanic: 0.7,
      pathStyle: 'Chaotic',
    },
  },
};

export function topSpeed(aggression: number, speedMult = 1): number {
  // Cop escalation is capped at assignment time; thief nitro may exceed that.
  return CAR.maxSpeed * speedMult * (0.65 + aggression * 0.4);
}

export function fleeRadiusFromPanic(proximityPanic: number): number {
  // Keep thief sense ≈ 2× cop sense; panic widens slightly around that floor
  return GAMEPLAY.baseFleeRadius * (0.85 + proximityPanic * 0.3);
}

export function copSenseRadius(proximityPanic: number): number {
  return GAMEPLAY.baseCopSenseRadius * (0.85 + proximityPanic * 0.3);
}

export { DEFAULT_BEHAVIOR };
