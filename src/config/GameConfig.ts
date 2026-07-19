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
  maxSpeed: 58,
  /** rad/sec turn at low speed; falls off as speed rises */
  maxTurnRate: 2.4,
  /** How quickly velocity aligns to heading (higher = snappier, less drift) */
  baseGrip: 0.5,
  /** Extra slip on spills / low driftStability */
  spillGripScale: 0.45,
  accel: 42,
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
  spillIntervalSec: 20,
  copSpeedGrowthPerCycle: 0.03,
  /** Hard cap so late-game cops don't become rockets */
  maxCopSpeedMult: 1.35,
  /** Cop proximity glow / sense baseline */
  baseCopSenseRadius: 140,
  /** Thief proximity is always 2× cop baseline */
  baseFleeRadius: 280,
  maxCops: 8,
  copSpawnDistance: 420,
  /**
   * Only teleport a cop that has completely left the chase (far off-camera).
   * Do NOT use this for normal cornering / slow turns.
   */
  copRespawnDistance: 1400,
  /** Must stay nearly motionless this long before counting as wedged. */
  copStuckSpeed: 2.5,
  copStuckTimeSec: 8,
  /** Also require almost no position change while "stuck". */
  copStuckMovePx: 18,
  catchRadius: 20,
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
  return CAR.maxSpeed * Math.min(GAMEPLAY.maxCopSpeedMult, speedMult) * (0.65 + aggression * 0.4);
}

export function fleeRadiusFromPanic(proximityPanic: number): number {
  // Keep thief sense ≈ 2× cop sense; panic widens slightly around that floor
  return GAMEPLAY.baseFleeRadius * (0.85 + proximityPanic * 0.3);
}

export function copSenseRadius(proximityPanic: number): number {
  return GAMEPLAY.baseCopSenseRadius * (0.85 + proximityPanic * 0.3);
}

export { DEFAULT_BEHAVIOR };
