import Matter from 'matter-js';
import { Vector2 } from '../core/Vector2';
import type { Rng } from '../core/rng';
import type { BehaviorConfig, CopRole } from '../core/types';
import { GAMEPLAY } from '../config/GameConfig';
import { Cop } from '../entities/Cop';
import type { ChunkWorld } from '../map/ChunkWorld';
import { addBody, type PhysicsWorld } from '../physics/world';

const ROLES: CopRole[] = ['lead', 'flank', 'ambush'];

export class CopManager {
  readonly cops: Cop[] = [];
  private spawnTimer = 0;
  private cycles = 0;
  private speedMultiplier = 1;
  private readonly config: BehaviorConfig;
  private readonly rng: Rng;
  /** Per-cop stuck timers (same index as cops[]). */
  private stuckSec: number[] = [];
  /** Last positions for stuck displacement checks. */
  private lastPos: Vector2[] = [];

  constructor(config: BehaviorConfig, rng: Rng) {
    this.config = config;
    this.rng = rng;
  }

  /** Spawn the initial lead cop near the thief (just off camera). */
  spawnInitial(physics: PhysicsWorld, world: ChunkWorld, near: Vector2): void {
    this.spawnAround(physics, world, near);
  }

  update(dt: number, physics: PhysicsWorld, world: ChunkWorld, near: Vector2): void {
    // Only recover cops that are truly lost / wedged — never mid-chase
    this.recoverLostCops(world, near, dt);

    this.spawnTimer += dt;
    if (this.spawnTimer < GAMEPLAY.copSpawnIntervalSec) return;
    this.spawnTimer = 0;

    if (this.cops.length >= GAMEPLAY.maxCops) {
      // At cap: just pressure via speed — do not teleport an active chaser
      this.bumpSpeed();
      return;
    }
    this.spawnAround(physics, world, near);
    this.bumpSpeed();
  }

  private bumpSpeed(): void {
    this.cycles += 1;
    this.speedMultiplier = Math.min(
      GAMEPLAY.maxCopSpeedMult,
      this.speedMultiplier * (1 + GAMEPLAY.copSpeedGrowthPerCycle),
    );
    for (const cop of this.cops) {
      cop.car.speedMultiplier = this.speedMultiplier;
    }
  }

  /**
   * Teleport only if:
   * - way off the chase (far beyond camera), or
   * - physically wedged (almost no speed AND almost no movement for several seconds).
   * Slow cornering while chasing must NOT trigger this.
   */
  private recoverLostCops(world: ChunkWorld, near: Vector2, dt: number): void {
    for (let i = 0; i < this.cops.length; i++) {
      const cop = this.cops[i]!;
      const pos = cop.car.pos;
      const dist = pos.distance(near);
      const speed = cop.car.vel.length();

      const prev = this.lastPos[i] ?? pos;
      const moved = pos.distance(prev);
      this.lastPos[i] = pos.clone();

      const nearlyStill =
        speed < GAMEPLAY.copStuckSpeed && moved < GAMEPLAY.copStuckMovePx * dt * 4;
      if (nearlyStill) {
        this.stuckSec[i] = (this.stuckSec[i] ?? 0) + dt;
      } else {
        this.stuckSec[i] = 0;
      }

      const tooFar = dist > GAMEPLAY.copRespawnDistance;
      const wedged = (this.stuckSec[i] ?? 0) >= GAMEPLAY.copStuckTimeSec;
      if (!tooFar && !wedged) continue;

      this.teleportCop(cop, world, near);
      this.stuckSec[i] = 0;
      this.lastPos[i] = cop.car.pos.clone();
    }
  }

  private teleportCop(cop: Cop, world: ChunkWorld, near: Vector2): void {
    const angle = this.rng() * Math.PI * 2;
    const dist = GAMEPLAY.copSpawnDistance * (0.85 + this.rng() * 0.3);
    const raw = new Vector2(
      near.x + Math.cos(angle) * dist,
      near.y + Math.sin(angle) * dist,
    );
    const spawn = world.findSpawnNear(raw.x, raw.y, 14);
    Matter.Body.setPosition(cop.car.body, { x: spawn.x, y: spawn.y });
    Matter.Body.setVelocity(cop.car.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(cop.car.body, 0);
    cop.car.faceToward(near);
  }

  private spawnAround(physics: PhysicsWorld, world: ChunkWorld, near: Vector2): void {
    const angle = this.rng() * Math.PI * 2;
    const dist = GAMEPLAY.copSpawnDistance * (0.85 + this.rng() * 0.3);
    const raw = new Vector2(
      near.x + Math.cos(angle) * dist,
      near.y + Math.sin(angle) * dist,
    );
    const spawn = world.findSpawnNear(raw.x, raw.y, 14);
    const index = this.cops.length;
    const role = ROLES[index % ROLES.length]!;
    const cop = new Cop(
      spawn.x,
      spawn.y,
      this.config,
      this.rng,
      index,
      role,
      this.speedMultiplier,
    );
    cop.car.faceToward(near);
    addBody(physics.world, cop.car.body);
    this.cops.push(cop);
    this.stuckSec.push(0);
    this.lastPos.push(cop.car.pos.clone());
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  getCycles(): number {
    return this.cycles;
  }
}
