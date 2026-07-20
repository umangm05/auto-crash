import Matter from 'matter-js';
import { Vector2 } from '../core/Vector2';
import { createRng, type Rng } from '../core/rng';
import { GAMEPLAY } from '../config/GameConfig';
import type { ChunkWorld } from '../map/ChunkWorld';
import { CellKind, isRoadLike } from '../map/biomes';
import { raycastGrid } from '../map/gridCollision';
import { nearestRoadPoint } from '../map/Pathfinding';
import {
  junctionOptions,
  lanePoseForDir,
  resolveLane,
  snapToLane,
  type LanePose,
} from '../map/trafficLanes';
import { Car, type HandlingFeel } from './Car';

const TRAFFIC_BEHAVIOR = {
  aggression: 0.45,
  driftStability: 1,
  proximityPanic: 0.3,
  pathStyle: 'Linear' as const,
};

/**
 * Civic traffic — follows road axis + two-way lanes.
 * H road: left/west lane ↔ right/east lane. V road: up/north ↔ down/south.
 */
export class TrafficCar {
  readonly car: Car;
  private cruiseDir = new Vector2(1, 0);
  private lane: LanePose | null = null;
  /** One turn decision for the whole junction patch. */
  private junctionCommitted = false;
  private stuckSec = 0;
  private readonly feelRng: Rng;

  constructor(x: number, y: number, dir: Vector2, index: number) {
    this.feelRng = createRng(`traffic-feel|${index}`);
    const handling: HandlingFeel = {
      turnRate: 2.4,
      grip: 1.5,
      accel: 0.85 + this.feelRng() * 0.15,
      topSpeed: 0.95 + this.feelRng() * 0.1,
      brake: 1.1,
      bodyScale: 0.88 + this.feelRng() * 0.24,
      lengthBias: 0.85 + this.feelRng() * 0.3,
      sirenPhase: this.feelRng() * Math.PI * 2,
    };

    this.cruiseDir = dir.clone();
    this.car = new Car({
      x,
      y,
      angle: this.cruiseDir.heading(),
      label: 'traffic',
      style: 'traffic',
      config: TRAFFIC_BEHAVIOR,
      rng: this.feelRng,
      speedMultiplier: GAMEPLAY.trafficSpeedMult,
      handling,
    });
    Matter.Body.setAngle(this.car.body, this.cruiseDir.heading());
  }

  get cruiseHeading(): Vector2 {
    return this.cruiseDir;
  }

  update(dt: number, world: ChunkWorld, pack: readonly TrafficCar[]): void {
    this.ensureOnRoad(world);
    this.syncLane(world);

    const onJunction = this.isJunctionCell(world);
    if (onJunction) {
      if (!this.junctionCommitted) {
        this.pickJunctionTurn(world);
        this.junctionCommitted = true;
      }
    } else {
      this.junctionCommitted = false;
      // Mid-block: stay on this lane's direction only (no random U-turns)
      if (this.lane) {
        this.cruiseDir = this.lane.dir.clone();
      }
    }

    const gap = this.gapToLeader(pack);
    let throttle = 0.9;
    if (gap < GAMEPLAY.trafficFollowStop) throttle = -0.95;
    else if (gap < GAMEPLAY.trafficFollowSlow) throttle = 0.1;
    else if (gap < GAMEPLAY.trafficFollowComfort) throttle = 0.4;

    if (this.clearAhead(world, this.cruiseDir) < 18) {
      throttle = Math.min(throttle, 0.05);
    }

    this.applyLanePose(world);
    this.car.setDesiredHeading(this.cruiseDir.heading());
    this.car.setThrottle(throttle);
    this.car.integrateControls(dt);
    this.applyLanePose(world);

    this.softSeparate(pack);
    this.tickStuck(dt, world, throttle);
  }

  /** Bind cruiseDir + lateral position to the legal lane under the car. */
  private syncLane(world: ChunkWorld): void {
    const pose = resolveLane(
      world,
      this.car.pos.x,
      this.car.pos.y,
      this.cruiseDir,
    );
    if (!pose) return;

    // Mid-block: lane forces direction. At junction keep chosen exit until we leave.
    if (!this.junctionCommitted) {
      this.cruiseDir = pose.dir.clone();
      this.lane = pose;
    } else {
      // Still update lane geometry for the chosen dir
      const exit = lanePoseForDir(
        world,
        this.car.pos.x,
        this.car.pos.y,
        this.cruiseDir,
      );
      this.lane = exit ?? pose;
      this.cruiseDir = (exit ?? pose).dir.clone();
    }
  }

  private applyLanePose(world: ChunkWorld): void {
    if (!this.lane) return;
    const snapped = snapToLane(this.car.pos, this.lane, 0.55);
    // Keep on road after snap
    const cell = world.worldToCell(snapped.x, snapped.y);
    if (isRoadLike(world.getKind(cell.col, cell.row))) {
      Matter.Body.setPosition(this.car.body, { x: snapped.x, y: snapped.y });
    }
    Matter.Body.setAngle(this.car.body, this.cruiseDir.heading());
    Matter.Body.setAngularVelocity(this.car.body, 0);
    const spd = this.car.vel.length();
    if (spd > 0.5) {
      Matter.Body.setVelocity(this.car.body, {
        x: this.cruiseDir.x * spd,
        y: this.cruiseDir.y * spd,
      });
    }
  }

  private isJunctionCell(world: ChunkWorld): boolean {
    const cell = world.worldToCell(this.car.pos.x, this.car.pos.y);
    return world.getKind(cell.col, cell.row) === CellKind.JUNCTION;
  }

  private ensureOnRoad(world: ChunkWorld): void {
    const cell = world.worldToCell(this.car.pos.x, this.car.pos.y);
    if (isRoadLike(world.getKind(cell.col, cell.row))) return;

    const road = nearestRoadPoint(world, this.car.pos, 14);
    if (!road) return;
    Matter.Body.setPosition(this.car.body, { x: road.x, y: road.y });
    Matter.Body.setVelocity(this.car.body, { x: 0, y: 0 });
    this.junctionCommitted = false;
    const pose = resolveLane(world, road.x, road.y, this.cruiseDir);
    if (pose) {
      this.lane = pose;
      this.cruiseDir = pose.dir.clone();
      const snapped = snapToLane(road, pose, 1);
      Matter.Body.setPosition(this.car.body, { x: snapped.x, y: snapped.y });
    }
  }

  private tickStuck(dt: number, world: ChunkWorld, throttle: number): void {
    const speed = this.car.vel.length();
    const trying = throttle > 0.2;
    const noseBlocked = this.clearAhead(world, this.cruiseDir) < 22;
    if (trying && (speed < 3 || noseBlocked)) this.stuckSec += dt;
    else this.stuckSec = Math.max(0, this.stuckSec - dt * 2);

    if (this.stuckSec < 0.7) return;
    this.unstick(world);
    this.stuckSec = 0;
  }

  private unstick(world: ChunkWorld): void {
    const road = nearestRoadPoint(world, this.car.pos, 16);
    if (road) {
      Matter.Body.setPosition(this.car.body, { x: road.x, y: road.y });
    }
    Matter.Body.setVelocity(this.car.body, { x: 0, y: 0 });
    this.junctionCommitted = false;
    const pose = resolveLane(
      world,
      this.car.pos.x,
      this.car.pos.y,
      this.cruiseDir,
    );
    if (pose) {
      this.lane = pose;
      this.cruiseDir = pose.dir.clone();
      const snapped = snapToLane(this.car.pos, pose, 1);
      Matter.Body.setPosition(this.car.body, { x: snapped.x, y: snapped.y });
    }
  }

  /**
   * At junction: continue straight or turn onto the other axis.
   * Turn dirs map to the correct destination lane half automatically.
   */
  private pickJunctionTurn(world: ChunkWorld): void {
    if (!this.lane) {
      this.syncLane(world);
    }
    const from = this.lane;
    if (!from) return;

    const options: Array<{ dir: Vector2; weight: number }> = [];
    for (const dir of junctionOptions(from)) {
      const clear = this.clearAhead(world, dir);
      if (clear < 40) continue;
      // Prefer continuing on the same axis
      const sameAxis =
        (from.axis === 'h' && dir.x !== 0) || (from.axis === 'v' && dir.y !== 0);
      options.push({ dir, weight: sameAxis ? 2.4 : 0.55 });
    }

    if (options.length === 0) return;

    let total = 0;
    for (const o of options) total += o.weight;
    let pick = this.feelRng() * total;
    let chosen = options[0]!.dir;
    for (const o of options) {
      pick -= o.weight;
      if (pick <= 0) {
        chosen = o.dir;
        break;
      }
    }

    const exit = lanePoseForDir(
      world,
      this.car.pos.x,
      this.car.pos.y,
      chosen,
    );
    if (exit) {
      this.lane = exit;
      this.cruiseDir = exit.dir.clone();
    } else {
      this.cruiseDir = chosen.clone();
    }
  }

  private gapToLeader(pack: readonly TrafficCar[]): number {
    let best = Infinity;
    const followR = GAMEPLAY.trafficFollowComfort;
    for (const other of pack) {
      if (other === this) continue;
      // Only follow same lane direction
      if (other.cruiseDir.dot(this.cruiseDir) < 0.9) continue;
      const to = other.car.pos.sub(this.car.pos);
      const along = to.dot(this.cruiseDir);
      if (along < 6 || along > followR) continue;
      const lateral = Math.abs(to.x * this.cruiseDir.y - to.y * this.cruiseDir.x);
      if (lateral > 18) continue;
      if (along < best) best = along;
    }
    return best;
  }

  private softSeparate(pack: readonly TrafficCar[]): void {
    const minDist = GAMEPLAY.trafficMinSpacing;
    for (const other of pack) {
      if (other === this) continue;
      // Only separate within the same lane stream
      if (other.cruiseDir.dot(this.cruiseDir) < 0.9) continue;
      const to = this.car.pos.sub(other.car.pos);
      const dist = to.length();
      if (dist >= minDist || dist < 1e-4) continue;

      const n = to.normalize();
      const push = (minDist - dist) * 0.45;
      Matter.Body.setPosition(this.car.body, {
        x: this.car.pos.x + n.x * push,
        y: this.car.pos.y + n.y * push,
      });
      const behind = to.normalize().dot(this.cruiseDir) < -0.3;
      if (behind) {
        const spd = this.car.vel.length();
        Matter.Body.setVelocity(this.car.body, {
          x: this.cruiseDir.x * Math.min(spd, 4),
          y: this.cruiseDir.y * Math.min(spd, 4),
        });
      }
    }
  }

  private clearAhead(world: ChunkWorld, dir: Vector2): number {
    const tip = this.car.pos.add(dir.scale(96));
    const hit = raycastGrid(world, this.car.pos, tip, 4, { roadsOnly: true });
    return hit ? this.car.pos.distance(hit) : 96;
  }

  render(ctx: CanvasRenderingContext2D, _t: number): void {
    this.car.render(ctx, 0);
  }
}
