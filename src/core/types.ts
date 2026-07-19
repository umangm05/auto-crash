export type Difficulty = 'easy' | 'medium' | 'hard';
export type PlayMode = 'thief' | 'cop';
export type PathStyle = 'Linear' | 'Chaotic';
export type CopRole = 'lead' | 'flank' | 'ambush';
export type Biome = 'city' | 'desert' | 'rural';

export interface BehaviorConfig {
  aggression: number;
  driftStability: number;
  proximityPanic: number;
  pathStyle: PathStyle;
}

export interface MatchSettings {
  mode: PlayMode;
  difficulty: Difficulty;
  biome: Biome;
  seed: string;
  playerConfig: BehaviorConfig;
  opponentConfig: BehaviorConfig;
  /**
   * Player drives the thief with WASD / arrows.
   * Only valid when `mode === 'thief'`; ignored for Cop mode.
   */
  manual: boolean;
}

export const DEFAULT_BEHAVIOR: BehaviorConfig = {
  aggression: 0.55,
  driftStability: 0.65,
  proximityPanic: 0.5,
  pathStyle: 'Linear',
};

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function clampBehavior(cfg: Partial<BehaviorConfig>): BehaviorConfig {
  const pathStyle = cfg.pathStyle === 'Chaotic' ? 'Chaotic' : 'Linear';
  return {
    aggression: clamp01(cfg.aggression ?? DEFAULT_BEHAVIOR.aggression),
    driftStability: clamp01(cfg.driftStability ?? DEFAULT_BEHAVIOR.driftStability),
    proximityPanic: clamp01(cfg.proximityPanic ?? DEFAULT_BEHAVIOR.proximityPanic),
    pathStyle,
  };
}
