import { Vector2 } from '../core/Vector2';
import type { Rng } from '../core/rng';
import type { BehaviorConfig, CopRole } from '../core/types';
import { GAMEPLAY, STEERING, copSenseRadius, topSpeed } from '../config/GameConfig';
import { steering } from '../ai/SteeringBehaviors';
import type { ChunkWorld } from '../map/ChunkWorld';
import { nearestIntersectionAhead } from '../map/Pathfinding';
import { Car } from './Car';
import type { Thief } from './Thief';

export class Cop {
  readonly car: Car;
  readonly role: CopRole;
  readonly index: number;

  constructor(
    x: number,
    y: number,
    config: BehaviorConfig,
    rng: Rng,
    index: number,
    role: CopRole,
    speedMultiplier = 1,
  ) {
    this.index = index;
    this.role = role;
    this.car = new Car({
      x,
      y,
      label: 'cop',
      style: 'cop',
      config,
      rng,
      speedMultiplier,
    });
    this.car.proximityRadius = GAMEPLAY.baseCopSenseRadius;
  }

  update(dt: number, world: ChunkWorld, thief: Thief): void {
    const config = this.car.config;
    const maxSpeed = topSpeed(config.aggression, this.car.speedMultiplier);
    this.car.proximityRadius = copSenseRadius(config.proximityPanic);

    const thiefPos = thief.car.pos;
    const thiefVel = thief.car.vel;

    let target = thiefPos;
    if (this.role === 'flank') {
      // Intercept ahead — pathfinder will route around buildings
      target = thiefPos.add(thiefVel.scale(STEERING.interceptLookahead * 1.6));
    } else if (this.role === 'ambush') {
      const ambush = nearestIntersectionAhead(world, thiefPos, thiefVel);
      target = ambush ?? thiefPos.add(thiefVel.scale(1.2));
    }

    // Sticky chase goal on the road network
    const chase = new Vector2(
      target.x * 0.55 + thiefPos.x * 0.45,
      target.y * 0.55 + thiefPos.y * 0.45,
    );

    steering.followPath(
      this.car,
      world,
      chase,
      config,
      maxSpeed,
      config.pathStyle,
      dt,
    );

    this.car.integrateControls(dt);
  }

  render(ctx: CanvasRenderingContext2D, t: number): void {
    this.car.renderProximityGlow(ctx);
    this.car.render(ctx, t);
  }
}
