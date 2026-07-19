import { Vector2 } from '../core/Vector2';
import type { BehaviorConfig, PathStyle } from '../core/types';
import { STEERING, fleeRadiusFromPanic } from '../config/GameConfig';
import type { Car } from '../entities/Car';
import type { ChunkWorld } from '../map/ChunkWorld';
import { isRoadLike } from '../map/biomes';
import { findPath, nearestRoadPoint } from '../map/Pathfinding';
import { raycastGrid } from '../map/gridCollision';
import { createRng, gaussian } from '../core/rng';

interface PathCache {
  waypoints: Vector2[];
  goal: Vector2;
  age: number;
  roadsOnly: boolean;
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
    roadsOnly = false,
  ): { steer: Vector2; blocked: boolean; imminent: boolean } {
    const length = feelerLen ?? STEERING.feelerLength;
    const origin = car.pos;
    const rayOpts = { roadsOnly };
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
      const hit = raycastGrid(world, origin, tip, 4, rayOpts);
      if (!hit) {
        if (a < 0) bestClearLeft = Math.max(bestClearLeft, length);
        if (a > 0) bestClearRight = Math.max(bestClearRight, length);
        continue;
      }
      hits++;
      const dist = Math.max(4, origin.distance(hit));
      if (Math.abs(a) < 0.08) {
        forwardBlocked = true;
        // Only "imminent" when the bumper is about to kiss a wall
        if (dist < Math.min(30, length * 0.28)) imminent = true;
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
    const sidePull = this.laneCenterPull(car, world, roadsOnly);
    if (sidePull.length() > 1e-4) {
      steer = steer.add(sidePull.scale(1.4));
      hits++;
    }

    if (hits === 0) return { steer: Vector2.zero(), blocked: false, imminent: false };
    const mag = STEERING.avoidWeight * (imminent ? 1.35 : 1);
    return { steer: steer.normalize().scale(mag), blocked: forwardBlocked, imminent };
  }

  /** Nudge toward the middle of the walkable corridor under the car. */
  private laneCenterPull(car: Car, world: ChunkWorld, roadsOnly = false): Vector2 {
    const origin = car.pos;
    const side = car.side;
    const probe = STEERING.sideProbeLength;
    const rayOpts = { roadsOnly };
    const leftHit = raycastGrid(world, origin, origin.add(side.scale(-probe)), 3, rayOpts);
    const rightHit = raycastGrid(world, origin, origin.add(side.scale(probe)), 3, rayOpts);
    const leftClear = leftHit ? origin.distance(leftHit) : probe;
    const rightClear = rightHit ? origin.distance(rightHit) : probe;
    // If one side is much closer, push away from that wall
    const imbalance = rightClear - leftClear;
    if (Math.abs(imbalance) < 6) return Vector2.zero();
    return side.scale(Math.max(-1, Math.min(1, imbalance / probe)));
  }

  /**
   * When lots are walls, feelers ignore them (to avoid curb-braking) — so we
   * separately pull the nose toward the asphalt midline before scraping.
   */
  keepCenteredOnRoad(car: Car, world: ChunkWorld): void {
    const side = car.side;
    const probe = STEERING.sideProbeLength;
    const origin = car.pos;
    const leftHit = raycastGrid(
      world,
      origin,
      origin.add(side.scale(-probe)),
      3,
      { roadsOnly: true },
    );
    const rightHit = raycastGrid(
      world,
      origin,
      origin.add(side.scale(probe)),
      3,
      { roadsOnly: true },
    );
    const leftClear = leftHit ? origin.distance(leftHit) : probe;
    const rightClear = rightHit ? origin.distance(rightHit) : probe;
    const imbalance = rightClear - leftClear;
    const minClear = Math.min(leftClear, rightClear);
    const nearCurb = minClear < 20;
    if (!nearCurb && Math.abs(imbalance) < 10) return;

    const pull = Math.max(-1, Math.min(1, imbalance / probe));
    const strength = nearCurb ? 0.65 : 0.3;
    const desired = car.heading.add(side.scale(pull * strength));
    if (desired.length() < 1e-4) return;
    car.setDesiredHeading(
      blendHeading(car.angle, desired.heading(), nearCurb ? 0.6 : 0.35),
    );
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
    const speed = car.vel.length();

    // Emergency brake only — about to slam a wall. Never brake for turns/corners.
    if (imminent && speed > 10) {
      car.setBrake(0.95);
      return;
    }

    let throttle = 0.35 + config.aggression * 0.4;
    if (angleError > 0.9) throttle *= 0.28;
    else if (angleError > 0.5) throttle *= 0.5;
    if (blocked) throttle *= 0.18;
    if (imminent) throttle *= 0.35;
    if (angleError > 2.2) throttle = 0.08;

    car.setThrottle(throttle);
  }

  /**
   * Hard brake when this car is closing fast on another body dead ahead.
   * Returns true if brake was applied (caller should skip further drive tweaks).
   */
  emergencyBrakeForCars(
    car: Car,
    others: ReadonlyArray<{ pos: Vector2 }>,
  ): boolean {
    const speed = car.vel.length();
    if (speed < 12) return false;
    const heading = car.heading;
    const stopDist = 28 + speed * 0.45;

    for (const other of others) {
      const to = other.pos.sub(car.pos);
      const dist = to.length();
      if (dist < 1e-3 || dist > stopDist) continue;
      const along = to.normalize().dot(heading);
      if (along < 0.65) continue; // not in front
      car.setBrake(0.95);
      return true;
    }
    return false;
  }

  /** Drop cached A* so the next followPath recomputes toward a new radio fix. */
  invalidatePath(car: Car): void {
    pathCaches.delete(car.body);
  }

  /** Next A* waypoint (road path), if any — for heading commits that stay on asphalt. */
  nextWaypoint(car: Car): Vector2 | null {
    const cache = pathCaches.get(car.body);
    if (!cache || cache.waypoints.length === 0) return null;
    return cache.waypoints[0] ?? null;
  }

  followPath(
    car: Car,
    world: ChunkWorld,
    goal: Vector2,
    config: BehaviorConfig,
    _maxSpeed: number,
    pathStyle: PathStyle,
    dt = 1 / 60,
    opts?: { roadsOnly?: boolean },
  ): void {
    const roadsOnly = opts?.roadsOnly ?? false;
    let cache = pathCaches.get(car.body);
    const modeChanged = !!cache && cache.roadsOnly !== roadsOnly;
    const goalMoved = !cache || cache.goal.distance(goal) > 28;
    const stale = !cache || cache.age > 0.4 || cache.waypoints.length === 0;

    if (!cache || goalMoved || stale || modeChanged) {
      // Roads-only needs a wider search — arterials wind farther than lot cuts
      const waypoints = findPath(world, car.pos, goal, {
        roadsOnly,
        maxNodes: roadsOnly ? 1400 : 360,
      });
      cache = { waypoints, goal: goal.clone(), age: 0, roadsOnly };
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
      const los = raycastGrid(world, car.pos, target, 5, { roadsOnly });
      if (los && cache.waypoints[0]) {
        target = cache.waypoints[0];
      }
      if (pathStyle === 'Chaotic' && !roadsOnly) {
        const rng = createRng(`wp|${idx}|${Math.floor(goal.x)}`);
        target = target.add(new Vector2((rng() - 0.5) * 6, (rng() - 0.5) * 6));
      }
    }

    let aim = target.sub(car.pos);
    if (roadsOnly) {
      // Never fall back to open-lane probes through lots — stick to asphalt
      const cell = world.worldToCell(car.pos.x, car.pos.y);
      const onRoad = isRoadLike(world.getKind(cell.col, cell.row));
      if (!onRoad) {
        const road = nearestRoadPoint(world, car.pos, 16);
        if (road) aim = road.sub(car.pos);
      } else if (path.length === 0) {
        // Crow-flies roadGoal often crosses lots → curb pin. Pick a clear road axis.
        const open = this.openRoadToward(car, world, goal);
        if (open) aim = open;
        else {
          const roadGoal = nearestRoadPoint(world, goal, 14) ?? goal;
          aim = roadGoal.sub(car.pos);
        }
      }
    } else if (path.length === 0) {
      const open = this.openLaneToward(car, world, goal);
      if (open) aim = open;
    }
    // Feelers only see real solids (buildings/rails). Lots are blocked by
    // physics when roadsOnly — treating them as feeler walls made cops
    // constantly "imminent" on the curb and refuse to chase.
    const { steer: avoid, blocked, imminent } = this.avoidObstacle(
      car,
      world,
      undefined,
      false,
    );
    this.applyDrive(
      car,
      aim.length() > 1e-3 ? aim : Vector2.fromAngle(car.angle),
      avoid,
      blocked,
      imminent,
      config,
    );
    // Feelers skip lots; without this, cars drift into the curb and scrape.
    if (roadsOnly) this.keepCenteredOnRoad(car, world);
  }

  /** Pick a free feeler direction closest to the goal bearing. */
  private openLaneToward(car: Car, world: ChunkWorld, goal: Vector2): Vector2 | null {
    return this.probeOpenToward(car, world, goal, false);
  }

  /** Same as openLaneToward but lots count as walls (roads-only chase). */
  private openRoadToward(car: Car, world: ChunkWorld, goal: Vector2): Vector2 | null {
    return this.probeOpenToward(car, world, goal, true);
  }

  private probeOpenToward(
    car: Car,
    world: ChunkWorld,
    goal: Vector2,
    roadsOnly: boolean,
  ): Vector2 | null {
    const toGoal = goal.sub(car.pos);
    if (toGoal.length() < 1e-3) return null;
    const base = toGoal.heading();
    const probes = [
      0,
      0.55,
      -0.55,
      1.1,
      -1.1,
      Math.PI * 0.5,
      -Math.PI * 0.5,
      Math.PI,
    ];
    let best: Vector2 | null = null;
    let bestScore = -Infinity;
    const rayOpts = { roadsOnly };
    for (const a of probes) {
      const dir = Vector2.fromAngle(base + a);
      const tip = car.pos.add(dir.scale(STEERING.feelerLength));
      const hit = raycastGrid(world, car.pos, tip, 4, rayOpts);
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
