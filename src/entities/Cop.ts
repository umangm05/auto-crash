import { Vector2 } from '../core/Vector2';
import type { Rng } from '../core/rng';
import type { BehaviorConfig, CopRole } from '../core/types';
import { GAMEPLAY, STEERING, copSenseRadius, topSpeed } from '../config/GameConfig';
import { steering } from '../ai/SteeringBehaviors';
import type { CopRadio } from '../ai/CopRadio';
import type { ChunkWorld } from '../map/ChunkWorld';
import { isRoadLike } from '../map/biomes';
import { raycastGrid } from '../map/gridCollision';
import { nearestIntersectionAhead, nearestRoadPoint } from '../map/Pathfinding';
import { Car } from './Car';

export class Cop {
  readonly car: Car;
  readonly role: CopRole;
  readonly index: number;
  /** True this frame if this unit has clear LOS on the thief. */
  hasVisual = false;
  /** Outside the camera viewport — catch-up rules apply. */
  offScreen = false;
  /** On ROAD / JUNCTION / BRIDGE this frame. */
  onRoad = true;
  /**
   * Thief is inside this unit's sense radius (distance only).
   * Only then may the cop leave the road network.
   */
  thiefInSense = false;
  private lastRadioRev = -1;
  /** Seconds of hard lock onto radio.pos after a revision bump. */
  private directChaseSec = 0;

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

  /** In sense radius with an unobstructed grid ray to the thief. */
  canSee(world: ChunkWorld, thiefPos: Vector2): boolean {
    const dist = this.car.pos.distance(thiefPos);
    if (dist > this.car.proximityRadius) return false;
    // Vision can look across lots; don't use roadsOnly ray here
    return raycastGrid(world, this.car.pos, thiefPos, 5) === null;
  }

  refreshOnRoad(world: ChunkWorld): void {
    const cell = world.worldToCell(this.car.pos.x, this.car.pos.y);
    this.onRoad = isRoadLike(world.getKind(cell.col, cell.row));
  }

  /** Update sense radius + whether the thief is inside it (allows off-road). */
  refreshSense(thiefPos: Vector2): void {
    this.car.proximityRadius = copSenseRadius(this.car.config.proximityPanic);
    this.thiefInSense = this.car.pos.distance(thiefPos) <= this.car.proximityRadius;
  }

  /**
   * Roads-only when off-road is disabled globally, or when the thief is
   * outside this unit's sense radius.
   */
  get mustStayOnRoad(): boolean {
    if (!GAMEPLAY.allowOffRoad) return true;
    return !this.thiefInSense;
  }

  update(
    dt: number,
    world: ChunkWorld,
    radio: CopRadio,
    pack: readonly Cop[],
    thiefPosLive?: Vector2,
  ): void {
    const config = this.car.config;
    const maxSpeed = topSpeed(config.aggression, this.car.speedMultiplier);
    if (thiefPosLive) this.refreshSense(thiefPosLive);
    this.refreshOnRoad(world);

    const roadsOnly = this.mustStayOnRoad;

    if (!radio.hasContact && !thiefPosLive) {
      const wander = roadsOnly
        ? (nearestRoadPoint(world, this.car.pos.add(this.car.heading.scale(80)), 12) ??
          this.car.pos.add(this.car.heading.scale(80)))
        : this.car.pos.add(this.car.heading.scale(80));
      steering.followPath(
        this.car,
        world,
        wander,
        config,
        maxSpeed * 0.45,
        config.pathStyle,
        dt,
        { roadsOnly },
      );
      this.car.integrateControls(dt);
      return;
    }

    // New radio fix → drop stale path and commit toward the contact
    const radioUpdated = radio.revision !== this.lastRadioRev;
    if (radioUpdated) {
      this.lastRadioRev = radio.revision;
      steering.invalidatePath(this.car);
      this.directChaseSec = 1.6;
    }
    if (this.directChaseSec > 0) this.directChaseSec -= dt;

    // Path toward the live thief when known — radio alone lagged and wandered
    const thiefPos = thiefPosLive ?? radio.pos;
    const thiefVel = thiefPosLive ? Vector2.zero() : radio.vel;
    const lockOn =
      this.hasVisual ||
      this.directChaseSec > 0 ||
      radio.ageSec < 0.35 ||
      !!thiefPosLive;

    let chase = thiefPos;

    if (roadsOnly) {
      // Stay on asphalt — recover to road first if we slipped into a lot
      if (!this.onRoad) {
        chase = nearestRoadPoint(world, this.car.pos, 16) ?? thiefPos;
      } else {
        // Goal must also be road-snapped so A* doesn't dead-end at a lot cell
        chase =
          nearestRoadPoint(world, thiefPos, 20) ??
          nearestRoadPoint(world, thiefPos, 40) ??
          thiefPos;
      }
    } else if (!lockOn) {
      // Close enough to leave the road — soft role offsets on stale contact
      if (this.role === 'flank') {
        chase = thiefPos.add(thiefVel.scale(STEERING.interceptLookahead * 1.6));
      } else if (this.role === 'ambush') {
        const ambush = nearestIntersectionAhead(world, thiefPos, thiefVel);
        chase = ambush ?? thiefPos.add(thiefVel.scale(1.2));
      }
      chase = new Vector2(
        chase.x * 0.55 + thiefPos.x * 0.45,
        chase.y * 0.55 + thiefPos.y * 0.45,
      );
    }

    steering.followPath(
      this.car,
      world,
      chase,
      config,
      maxSpeed,
      'Linear', // chase ignores Chaotic wander — go at the thief
      dt,
      { roadsOnly, chase: true },
    );

    // Commit onto the road route (look ahead) so packs close distance
    if (roadsOnly) {
      const wp =
        steering.nextWaypoint(this.car, 2) ?? steering.nextWaypoint(this.car, 0);
      if (wp) this.snapTowardTarget(wp, true);
      // Keep throttle up after snap (snap only nudges heading)
      if (this.car.getThrottle() < 0.7) this.car.setThrottle(0.85);
    } else {
      this.snapTowardTarget(chase, true);
    }

    const others = [];
    for (const c of pack) {
      if (c !== this) others.push(c.car);
    }
    steering.emergencyBrakeForCars(this.car, others);

    this.car.integrateControls(dt);
  }

  /** Override heading toward a target so cops don't keep driving past a fix behind them. */
  private snapTowardTarget(target: Vector2, aggressive: boolean): void {
    const to = target.sub(this.car.pos);
    if (to.length() < 8) return;
    const desired = to.heading();
    const along = to.normalize().dot(this.car.heading);
    if (!aggressive && along > 0.35) return;

    this.car.setDesiredHeading(desired);
    if (along < 0.25) {
      this.car.setThrottle(0.75);
    }
  }

  render(ctx: CanvasRenderingContext2D, t: number): void {
    this.car.renderProximityGlow(ctx);
    this.car.render(ctx, t);
  }
}
