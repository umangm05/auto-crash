import { Vector2 } from '../core/Vector2';
import type { Rng } from '../core/rng';
import type { BehaviorConfig } from '../core/types';
import { topSpeed } from '../config/GameConfig';
import { steering } from '../ai/SteeringBehaviors';
import type { ChunkWorld } from '../map/ChunkWorld';
import { Car } from './Car';
import type { Cop } from './Cop';

export class Thief {
  readonly car: Car;
  private escapeTarget: Vector2 | null = null;
  private replanTimer = 0;

  constructor(x: number, y: number, config: BehaviorConfig, rng: Rng) {
    this.car = new Car({
      x,
      y,
      label: 'thief',
      style: 'thief',
      config,
      rng,
    });
  }

  update(dt: number, world: ChunkWorld, cops: Cop[], rng: Rng): void {
    const config = this.car.config;
    const maxSpeed = topSpeed(config.aggression, 1.05);
    // Thief proximity glow / flee scan is 2× the cop sense baseline
    const fleeR = steering.fleeRadius(config);
    this.car.proximityRadius = fleeR;

    let danger = Vector2.zero();
    let nearestDist = Infinity;
    let threats = 0;
    let aheadThreat = 0;
    let behindThreat = 0;
    const heading = this.car.heading;

    for (const cop of cops) {
      const toCop = cop.car.pos.sub(this.car.pos);
      const d = toCop.length();
      if (d < nearestDist) nearestDist = d;
      if (d > fleeR * 1.6) continue;
      threats++;
      const weight = 1 / Math.max(40, d);
      danger = danger.add(toCop.normalize().scale(weight));
      const along = toCop.normalize().dot(heading);
      if (along > 0.2) aheadThreat += weight;
      else if (along < -0.2) behindThreat += weight;
    }

    this.replanTimer -= dt;
    const needReplan =
      this.replanTimer <= 0 ||
      !this.escapeTarget ||
      this.car.pos.distance(this.escapeTarget) < 30 ||
      (threats > 0 && nearestDist < fleeR * 0.5);

    if (needReplan) {
      this.escapeTarget = this.pickEscape(world, danger, aheadThreat, behindThreat, threats, rng);
      this.replanTimer = threats > 0 ? 0.7 + rng() * 0.5 : 1.6 + rng() * 1.2;
    }

    const goal = this.escapeTarget ?? this.car.pos.add(heading.scale(100));
    steering.followPath(
      this.car,
      world,
      goal,
      config,
      threats > 0 ? maxSpeed : maxSpeed * 0.85,
      config.pathStyle,
      dt,
    );

    this.car.integrateControls(dt);
  }

  private pickEscape(
    world: ChunkWorld,
    danger: Vector2,
    ahead: number,
    behind: number,
    threats: number,
    rng: Rng,
  ): Vector2 {
    let dir: Vector2;
    if (threats > 0 && danger.length() > 1e-4) {
      dir = danger.normalize().scale(-1);
      if (ahead > 0 && behind > 0) {
        const side = new Vector2(-dir.y, dir.x).scale(rng() > 0.5 ? 1 : -1);
        dir = dir.add(side).normalize();
      }
    } else {
      dir = Vector2.fromAngle(rng() * Math.PI * 2);
    }
    // Stay on walkable network — cellInDirection snaps to streets/open
    return world.cellInDirection(this.car.pos, dir, 6 + Math.floor(rng() * 6));
  }

  render(ctx: CanvasRenderingContext2D, t: number): void {
    this.car.renderProximityGlow(ctx);
    this.car.render(ctx, t);
  }
}
