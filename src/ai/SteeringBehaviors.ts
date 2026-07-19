import { Vector2 } from '../core/Vector2';
import type { BehaviorConfig, PathStyle } from '../core/types';
import { STEERING, fleeRadiusFromPanic } from '../config/GameConfig';
import type { Car } from '../entities/Car';
import type { ChunkWorld } from '../map/ChunkWorld';
import { findPath } from '../map/Pathfinding';
import { raycastGrid } from '../map/gridCollision';
import { createRng, gaussian } from '../core/rng';

interface PathCache {
  waypoints: Vector2[];
  goal: Vector2;
  age: number;
}

const pathCaches = new WeakMap<object, PathCache>();

export class SteeringBehaviors {
  seek(car: Car, target: Vector2, maxSpeed: number): Vector2 {
    const desired = target.sub(car.pos);
    if (desired.length() < 1e-4) return Vector2.zero();
    return desired.normalize().scale(maxSpeed).sub(car.vel);
  }

  flee(car: Car, threat: Vector2, maxSpeed: number): Vector2 {
    const away = car.pos.sub(threat);
    if (away.length() < 1e-4) {
      return Vector2.fromAngle(car.angle + Math.PI).scale(maxSpeed);
    }
    return away.normalize().scale(maxSpeed).sub(car.vel);
  }

  /**
   * Look-ahead feelers + side clearance. Prefer steering *around* obstacles
   * before the bumper ever touches them.
   */
  avoidObstacle(
    car: Car,
    world: ChunkWorld,
    feelerLen?: number,
  ): { steer: Vector2; blocked: boolean; imminent: boolean } {
    const length = feelerLen ?? STEERING.feelerLength;
    const origin = car.pos;
    const angles = [
      0,
      -STEERING.feelerSpread * 0.55,
      STEERING.feelerSpread * 0.55,
      -STEERING.feelerSpread,
      STEERING.feelerSpread,
      -STEERING.feelerSpread * 1.7,
      STEERING.feelerSpread * 1.7,
    ];
    let steer = Vector2.zero();
    let hits = 0;
    let forwardBlocked = false;
    let imminent = false;
    let bestClearLeft = 0;
    let bestClearRight = 0;

    for (const a of angles) {
      const dir = Vector2.fromAngle(car.angle + a);
      const tip = origin.add(dir.scale(length * (a === 0 ? 1.15 : 0.85)));
      const hit = raycastGrid(world, origin, tip, 4);
      if (!hit) {
        if (a < 0) bestClearLeft = Math.max(bestClearLeft, length);
        if (a > 0) bestClearRight = Math.max(bestClearRight, length);
        continue;
      }
      hits++;
      const dist = Math.max(4, origin.distance(hit));
      if (Math.abs(a) < 0.08) {
        forwardBlocked = true;
        if (dist < length * 0.55) imminent = true;
      }
      const strength = (1 - dist / (length * 1.15)) * (Math.abs(a) < 0.08 ? 1.8 : 1.1);
      const side = new Vector2(-dir.y, dir.x);
      // Push into the freer side when the nose is clogged
      let sideSign = Math.sign(a) || 1;
      if (Math.abs(a) < 0.08) {
        sideSign = bestClearLeft >= bestClearRight ? -1 : 1;
      }
      steer = steer
        .add(side.scale(-sideSign * strength))
        .add(origin.sub(hit).normalize().scale(strength * 0.5));
      if (a < 0) bestClearLeft = Math.max(bestClearLeft, dist);
      if (a > 0) bestClearRight = Math.max(bestClearRight, dist);
    }

    // Continuous side-wall repulsion (keeps cars centered in the lane)
    const sidePull = this.laneCenterPull(car, world);
    if (sidePull.length() > 1e-4) {
      steer = steer.add(sidePull.scale(1.4));
      hits++;
    }

    if (hits === 0) return { steer: Vector2.zero(), blocked: false, imminent: false };
    const mag = STEERING.avoidWeight * (imminent ? 1.35 : 1);
    return { steer: steer.normalize().scale(mag), blocked: forwardBlocked, imminent };
  }

  /** Nudge toward the middle of the walkable corridor under the car. */
  private laneCenterPull(car: Car, world: ChunkWorld): Vector2 {
    const origin = car.pos;
    const side = car.side;
    const probe = STEERING.sideProbeLength;
    const leftHit = raycastGrid(world, origin, origin.add(side.scale(-probe)), 3);
    const rightHit = raycastGrid(world, origin, origin.add(side.scale(probe)), 3);
    const leftClear = leftHit ? origin.distance(leftHit) : probe;
    const rightClear = rightHit ? origin.distance(rightHit) : probe;
    // If one side is much closer, push away from that wall
    const imbalance = rightClear - leftClear;
    if (Math.abs(imbalance) < 6) return Vector2.zero();
    return side.scale(Math.max(-1, Math.min(1, imbalance / probe)));
  }

  applyDrive(
    car: Car,
    aim: Vector2,
    avoid: Vector2,
    blocked: boolean,
    imminent: boolean,
    config: BehaviorConfig,
  ): void {
    let dir = aim;
    if (avoid.length() > 1e-4) {
      // Prioritize avoidance — don't aim through walls
      const avoidBias = imminent ? 2.4 : blocked ? 1.9 : 1.25;
      const aimScale = imminent ? 0.15 : blocked ? 0.3 : 0.85;
      dir = aim.normalize().scale(aimScale).add(avoid.scale(avoidBias));
    }
    if (config.pathStyle === 'Chaotic') {
      const rng = createRng(`${Math.floor(car.pos.x / 40)}|${Math.floor(car.pos.y / 40)}|chaos`);
      dir = dir.add(new Vector2(gaussian(rng), gaussian(rng)).scale(0.14));
    }

    if (dir.length() < 1e-4) {
      car.setThrottle(0.12);
      return;
    }

    const desiredHeading = dir.heading();
    const blend = imminent ? 0.7 : blocked ? 0.55 : 0.4;
    const blended = blendHeading(car.angle, desiredHeading, blend);
    car.setDesiredHeading(blended);

    const angleError = Math.abs(wrapAngle(desiredHeading - car.angle));
    let throttle = 0.35 + config.aggression * 0.4;
    if (angleError > 0.9) throttle *= 0.28;
    else if (angleError > 0.5) throttle *= 0.5;
    if (blocked) throttle *= 0.18;
    if (imminent) throttle *= 0.35;
    if (angleError > 2.2) throttle = 0.08;

    car.setThrottle(throttle);
  }

  followPath(
    car: Car,
    world: ChunkWorld,
    goal: Vector2,
    config: BehaviorConfig,
    _maxSpeed: number,
    pathStyle: PathStyle,
    dt = 1 / 60,
  ): void {
    let cache = pathCaches.get(car.body);
    const goalMoved = !cache || cache.goal.distance(goal) > 55;
    const stale = !cache || cache.age > 0.4 || cache.waypoints.length === 0;

    if (!cache || goalMoved || stale) {
      const waypoints = findPath(world, car.pos, goal);
      cache = { waypoints, goal: goal.clone(), age: 0 };
      pathCaches.set(car.body, cache);
    } else {
      cache.age += dt;
    }

    let target = goal;
    const path = cache.waypoints;
    if (path.length > 0) {
      let idx = 0;
      while (
        idx < path.length - 1 &&
        car.pos.distance(path[idx]!) < STEERING.waypointArriveRadius
      ) {
        idx++;
      }
      if (idx > 0) cache.waypoints = path.slice(idx);
      // Look ahead further when clear so we corner early around buildings
      const look = Math.min(cache.waypoints.length - 1, 2);
      target = cache.waypoints[look] ?? cache.waypoints[0] ?? goal;
      // If the look-ahead is LOS-blocked, use the nearer waypoint
      const los = raycastGrid(world, car.pos, target, 5);
      if (los && cache.waypoints[0]) {
        target = cache.waypoints[0];
      }
      if (pathStyle === 'Chaotic') {
        const rng = createRng(`wp|${idx}|${Math.floor(goal.x)}`);
        target = target.add(new Vector2((rng() - 0.5) * 6, (rng() - 0.5) * 6));
      }
    }

    let aim = target.sub(car.pos);
    if (path.length === 0) {
      const open = this.openLaneToward(car, world, goal);
      if (open) aim = open;
    }
    const { steer: avoid, blocked, imminent } = this.avoidObstacle(car, world);
    this.applyDrive(
      car,
      aim.length() > 1e-3 ? aim : Vector2.fromAngle(car.angle),
      avoid,
      blocked,
      imminent,
      config,
    );
  }

  /** Pick a free feeler direction closest to the goal bearing. */
  private openLaneToward(car: Car, world: ChunkWorld, goal: Vector2): Vector2 | null {
    const toGoal = goal.sub(car.pos);
    if (toGoal.length() < 1e-3) return null;
    const base = toGoal.heading();
    const probes = [0, 0.55, -0.55, 1.1, -1.1, Math.PI * 0.5, -Math.PI * 0.5, Math.PI];
    let best: Vector2 | null = null;
    let bestScore = -Infinity;
    for (const a of probes) {
      const dir = Vector2.fromAngle(base + a);
      const tip = car.pos.add(dir.scale(STEERING.feelerLength));
      const hit = raycastGrid(world, car.pos, tip, 4);
      const clear = hit ? car.pos.distance(hit) : STEERING.feelerLength;
      if (clear < 22) continue;
      const score = clear + Math.cos(a) * 28;
      if (score > bestScore) {
        bestScore = score;
        best = dir.scale(clear);
      }
    }
    return best;
  }

  fleeRadius(config: BehaviorConfig): number {
    return fleeRadiusFromPanic(config.proximityPanic);
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function blendHeading(from: number, to: number, t: number): number {
  const err = wrapAngle(to - from);
  return wrapAngle(from + err * Math.max(0, Math.min(1, t)));
}

export const steering = new SteeringBehaviors();
