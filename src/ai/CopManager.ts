import { Vector2 } from '../core/Vector2';
import type { Rng } from '../core/rng';
import type { BehaviorConfig, CopRole } from '../core/types';
import { GAMEPLAY, copSenseRadius } from '../config/GameConfig';
import { Cop } from '../entities/Cop';
import type { Thief } from '../entities/Thief';
import type { ChunkWorld } from '../map/ChunkWorld';
import { nearestRoadPoint } from '../map/Pathfinding';
import { addBody, type PhysicsWorld } from '../physics/world';
import { CopRadio } from './CopRadio';
import { steering } from './SteeringBehaviors';

const ROLES: CopRole[] = ['lead', 'flank', 'ambush'];

export interface ViewRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class CopManager {
  readonly cops: Cop[] = [];
  readonly radio = new CopRadio();
  private spawnTimer = 0;
  private intelTimer = 0;
  private cycles = 0;
  private speedMultiplier = 1;
  private readonly config: BehaviorConfig;
  private readonly rng: Rng;
  private stuckSec: number[] = [];
  private lastPos: Vector2[] = [];

  constructor(config: BehaviorConfig, rng: Rng) {
    this.config = config;
    this.rng = rng;
  }

  /** Spawn the initial lead cop; seed radio with a dispatch ping on the thief. */
  spawnInitial(physics: PhysicsWorld, world: ChunkWorld, near: Vector2): void {
    this.radio.dispatch(near);
    this.intelTimer = 0;
    this.spawnAround(physics, world, near);
  }

  /**
   * Age the radio, accept visual broadcasts, and every
   * `radioIntelIntervalSec` push a guaranteed intel refresh.
   */
  updateRadio(dt: number, world: ChunkWorld, thief: Thief): void {
    this.radio.tick(dt);

    let spotted = false;
    for (const cop of this.cops) {
      cop.car.proximityRadius = copSenseRadius(cop.car.config.proximityPanic);
      cop.hasVisual = cop.canSee(world, thief.car.pos);
      if (cop.hasVisual) spotted = true;
    }

    if (spotted) {
      this.radio.report(thief.car.pos, thief.car.vel);
    }

    this.intelTimer += dt;
    if (this.intelTimer >= GAMEPLAY.radioIntelIntervalSec) {
      this.intelTimer = 0;
      this.radio.report(thief.car.pos, thief.car.vel);
    }
  }

  update(
    dt: number,
    physics: PhysicsWorld,
    world: ChunkWorld,
    near: Vector2,
    view: ViewRect,
  ): void {
    this.applyOffScreenSpeeds(view, world);
    this.unwedgeCops(dt, world);

    this.spawnTimer += dt;
    if (this.spawnTimer < GAMEPLAY.copSpawnIntervalSec) return;
    this.spawnTimer = 0;

    if (this.cops.length >= GAMEPLAY.maxCops) {
      this.bumpSpeed();
      return;
    }
    this.spawnAround(physics, world, near);
    this.bumpSpeed();
  }

  /**
   * Mark viewport membership; 2× catch-up only while off-screen AND on asphalt
   * so the boost cannot power cops through building lots.
   */
  private applyOffScreenSpeeds(view: ViewRect, world: ChunkWorld): void {
    for (const cop of this.cops) {
      const p = cop.car.pos;
      const onScreen =
        p.x >= view.minX &&
        p.x <= view.maxX &&
        p.y >= view.minY &&
        p.y <= view.maxY;
      cop.offScreen = !onScreen;
      cop.refreshOnRoad(world);
      this.applyCopSpeed(cop);
    }
  }

  private applyCopSpeed(cop: Cop): void {
    const boost =
      cop.offScreen && cop.onRoad ? GAMEPLAY.offScreenSpeedMult : 1;
    cop.car.speedMultiplier = this.speedMultiplier * boost;
  }

  private bumpSpeed(): void {
    this.cycles += 1;
    this.speedMultiplier = Math.min(
      GAMEPLAY.maxCopSpeedMult,
      this.speedMultiplier * (1 + GAMEPLAY.copSpeedGrowthPerCycle),
    );
    for (const cop of this.cops) {
      this.applyCopSpeed(cop);
    }
  }

  /**
   * If wedged on a curb, drop the stale path and face along asphalt toward
   * the radio (never crow-flies through a lot — that re-pins them).
   */
  private unwedgeCops(dt: number, world: ChunkWorld): void {
    const anchor = this.radio.hasContact ? this.radio.pos : null;

    for (let i = 0; i < this.cops.length; i++) {
      const cop = this.cops[i]!;
      const pos = cop.car.pos;
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

      if ((this.stuckSec[i] ?? 0) < GAMEPLAY.copStuckTimeSec) continue;

      const wp = steering.nextWaypoint(cop.car);
      steering.invalidatePath(cop.car);
      const roadAnchor = anchor
        ? (nearestRoadPoint(world, anchor, 24) ?? anchor)
        : null;
      let face = wp;
      if (!face && roadAnchor) {
        const toward = roadAnchor.sub(pos);
        if (toward.length() > 4) {
          face =
            nearestRoadPoint(
              world,
              pos.add(toward.normalize().scale(80)),
              12,
            ) ?? roadAnchor;
        }
      }
      if (!face) {
        face = nearestRoadPoint(world, pos.add(cop.car.heading.scale(60)), 8);
      }
      if (face) cop.car.faceToward(face);
      this.stuckSec[i] = 0;
    }
  }

  /** Random angle around the thief, outside the camera band, with min-distance guard. */
  private spawnAround(physics: PhysicsWorld, world: ChunkWorld, near: Vector2): void {
    const spawn = this.pickRingSpawn(world, near);
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
    const face = this.radio.hasContact ? this.radio.pos : near;
    cop.car.faceToward(face);
    // Fresh units start off-screen on asphalt → 2× until they enter the view
    cop.offScreen = true;
    cop.refreshOnRoad(world);
    this.applyCopSpeed(cop);
    addBody(physics.world, cop.car.body);
    this.cops.push(cop);
    this.stuckSec.push(0);
    this.lastPos.push(cop.car.pos.clone());
  }

  private pickRingSpawn(world: ChunkWorld, near: Vector2): Vector2 {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const dist =
        GAMEPLAY.copSpawnDistance *
        (0.9 + this.rng() * 0.25) *
        (1 + attempt * 0.08);
      const raw = new Vector2(
        near.x + Math.cos(angle) * dist,
        near.y + Math.sin(angle) * dist,
      );
      const spawn = world.findSpawnNear(raw.x, raw.y, 12);
      if (spawn.distance(near) >= GAMEPLAY.copSpawnMinDistance) return spawn;
    }
    const angle = this.rng() * Math.PI * 2;
    const fallback = new Vector2(
      near.x + Math.cos(angle) * GAMEPLAY.copSpawnDistance * 1.4,
      near.y + Math.sin(angle) * GAMEPLAY.copSpawnDistance * 1.4,
    );
    return world.findSpawnNear(fallback.x, fallback.y, 16);
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  getCycles(): number {
    return this.cycles;
  }

  /** True if any cop has a clear visual this frame. */
  hasVisualContact(): boolean {
    return this.cops.some((c) => c.hasVisual);
  }
}
