import { Vector2 } from '../core/Vector2';
import type { Rng } from '../core/rng';
import type { TrafficLevel } from '../core/types';
import { GAMEPLAY, TRAFFIC_PRESETS } from '../config/GameConfig';
import { TrafficCar } from '../entities/TrafficCar';
import type { ChunkWorld } from '../map/ChunkWorld';
import {
  lanePoseForDir,
  resolveLane,
  snapToLane,
} from '../map/trafficLanes';
import {
  addBody,
  removeBody,
  type PhysicsWorld,
} from '../physics/world';

/**
 * Maintains civic traffic on correct H/V lanes around the chase.
 */
export class TrafficManager {
  readonly cars: TrafficCar[] = [];
  private nextIndex = 0;
  private readonly targetCount: number;
  private readonly radius: number;

  constructor(
    level: TrafficLevel,
    private readonly rng: Rng,
  ) {
    const preset = TRAFFIC_PRESETS[level];
    this.targetCount = preset.count;
    this.radius = preset.radius;
  }

  spawnInitial(physics: PhysicsWorld, world: ChunkWorld, near: Vector2): void {
    for (let i = 0; i < this.targetCount; i++) {
      this.spawnOne(physics, world, near, 0.25 + this.rng() * 0.9);
    }
  }

  update(
    dt: number,
    physics: PhysicsWorld,
    world: ChunkWorld,
    focus: Vector2,
  ): void {
    const maxDist = this.radius * 1.35;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i]!;
      if (car.car.pos.distance(focus) > maxDist) {
        removeBody(physics.world, car.car.body);
        this.cars.splice(i, 1);
      }
    }

    let guard = 0;
    while (this.cars.length < this.targetCount && guard++ < 12) {
      this.spawnOne(physics, world, focus, 0.35 + this.rng() * 0.85);
    }

    for (const car of this.cars) {
      world.prefetchAround(car.car.pos.x, car.car.pos.y, 1);
      car.car.surfaceSpeedScale = 1;
      car.update(dt, world, this.cars);
    }
  }

  private spawnOne(
    physics: PhysicsWorld,
    world: ChunkWorld,
    near: Vector2,
    distScale: number,
  ): void {
    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const dist = this.radius * distScale * (0.85 + attempt * 0.04);
      const raw = new Vector2(
        near.x + Math.cos(angle) * dist,
        near.y + Math.sin(angle) * dist,
      );
      const spawn = world.findSpawnNear(raw.x, raw.y, 14);
      if (!this.isSpawnClear(spawn)) continue;

      // Pick a legal lane at spawn (random among the two halves via dir)
      const prefer =
        this.rng() < 0.5 ? new Vector2(1, 0) : new Vector2(0, 1);
      let lane = resolveLane(world, spawn.x, spawn.y, prefer);
      if (!lane) continue;

      // Randomly flip to the opposite legal direction on that axis
      if (this.rng() < 0.5) {
        const opposite = lane.dir.scale(-1);
        lane = lanePoseForDir(world, spawn.x, spawn.y, opposite) ?? lane;
      }

      const placed = snapToLane(spawn, lane, 1);
      if (!this.isSpawnClear(placed)) continue;

      const unit = new TrafficCar(
        placed.x,
        placed.y,
        lane.dir,
        this.nextIndex++,
      );
      unit.car.faceToward(placed.add(lane.dir.scale(40)));
      addBody(physics.world, unit.car.body);
      this.cars.push(unit);
      return;
    }
  }

  private isSpawnClear(pos: Vector2): boolean {
    const min = GAMEPLAY.trafficSpawnSpacing;
    for (const c of this.cars) {
      if (c.car.pos.distance(pos) < min) return false;
    }
    return true;
  }

  clear(physics: PhysicsWorld | null): void {
    if (physics) {
      for (const c of this.cars) removeBody(physics.world, c.car.body);
    }
    this.cars.length = 0;
  }
}
