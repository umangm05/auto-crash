import { Vector2 } from '../core/Vector2';
import type { Rng } from '../core/rng';
import type { BehaviorConfig } from '../core/types';
import { GAMEPLAY, topSpeed } from '../config/GameConfig';
import { steering } from '../ai/SteeringBehaviors';
import type { ChunkWorld } from '../map/ChunkWorld';
import { isRoadLike } from '../map/biomes';
import { raycastGrid } from '../map/gridCollision';
import { nearestRoadPoint } from '../map/Pathfinding';
import { Car } from './Car';
import type { Cop } from './Cop';

type NitroState = 'ready' | 'active' | 'cooldown';

export class Thief {
  readonly car: Car;
  private escapeTarget: Vector2 | null = null;
  private replanTimer = 0;
  /** How long we've been driving mostly along the same axis without a turn. */
  private straightSec = 0;
  private lastHeading = new Vector2(1, 0);
  private nitroState: NitroState = 'ready';
  private nitroTimer = 0;
  private wasNitroActive = false;
  /** Any cop inside the thief sense / flee radius — stay on asphalt. */
  copInSense = false;

  constructor(x: number, y: number, config: BehaviorConfig, rng: Rng) {
    this.car = new Car({
      x,
      y,
      label: 'thief',
      style: 'thief',
      config,
      rng,
      speedMultiplier: GAMEPLAY.thiefSpeedMult,
    });
  }

  /** True while the 1s boost is burning. */
  get isNitroActive(): boolean {
    return this.nitroState === 'active';
  }

  /**
   * 1 = ready / full, during cooldown rises 0→1 as it refills,
   * while active shows remaining burn as 1→0.
   */
  get nitroFill(): number {
    if (this.nitroState === 'ready') return 1;
    if (this.nitroState === 'active') {
      return Math.max(0, this.nitroTimer / GAMEPLAY.nitroDurationSec);
    }
    return Math.max(
      0,
      1 - this.nitroTimer / GAMEPLAY.nitroCooldownSec,
    );
  }

  /**
   * Roads-only when off-road is disabled globally, or when any cop is inside
   * the thief sense radius (opposite of cop off-road gate).
   */
  get mustStayOnRoad(): boolean {
    if (!GAMEPLAY.allowOffRoad) return true;
    return this.copInSense;
  }

  /** Call before surface apply / AI so lot bans stay in sync. */
  refreshThreatSense(cops: readonly Cop[]): void {
    const fleeR = steering.fleeRadius(this.car.config);
    this.car.proximityRadius = fleeR;
    this.copInSense = cops.some(
      (c) => this.car.pos.distance(c.car.pos) <= fleeR,
    );
  }

  update(dt: number, world: ChunkWorld, cops: Cop[], rng: Rng): void {
    const config = this.car.config;
    const fleeR = steering.fleeRadius(config);
    this.refreshThreatSense(cops);
    const roadsOnly = this.mustStayOnRoad;

    let danger = Vector2.zero();
    let nearestDist = Infinity;
    let nearestAheadDist = Infinity;
    let threats = 0;
    let aheadThreat = 0;
    let behindThreat = 0;
    const heading = this.car.heading;

    for (const cop of cops) {
      const toCop = cop.car.pos.sub(this.car.pos);
      const d = toCop.length();
      if (d < nearestDist) nearestDist = d;
      // Sense radius = flee glow; anything inside must trigger flee
      if (d > fleeR) continue;
      threats++;
      const weight = 1 / Math.max(40, d);
      const n = toCop.normalize();
      danger = danger.add(n.scale(weight));
      const along = n.dot(heading);
      if (along > 0.2) {
        aheadThreat += weight;
        if (d < nearestAheadDist) nearestAheadDist = d;
      } else if (along < -0.15) {
        behindThreat += weight;
      }
    }

    const dangerDir =
      danger.length() > 1e-4 ? danger.normalize() : Vector2.zero();
    const headingIntoDanger =
      dangerDir.length() > 0.5 && heading.dot(dangerDir) > 0.15;

    // Cop planted in front — must cut sideways / reverse, not boost into them
    const blockedAhead =
      aheadThreat > 0 &&
      nearestAheadDist < fleeR * 0.9 &&
      aheadThreat >= behindThreat * 0.3;

    this.updateNitro(
      dt,
      threats,
      nearestDist,
      fleeR,
      blockedAhead,
      headingIntoDanger,
    );

    const boost = this.isNitroActive ? GAMEPLAY.nitroSpeedMult : 1;
    this.car.speedMultiplier = GAMEPLAY.thiefSpeedMult * boost;
    this.car.accelScale = this.isNitroActive ? GAMEPLAY.nitroAccelScale : 1;
    if (this.isNitroActive && !this.wasNitroActive) {
      this.car.applySpeedKick(0.65);
    }
    this.wasNitroActive = this.isNitroActive;
    const maxSpeed = topSpeed(config.aggression, this.car.speedMultiplier);

    const turnDot = heading.dot(this.lastHeading);
    if (turnDot > 0.92) this.straightSec += dt;
    else {
      this.straightSec = 0;
      this.lastHeading = heading;
    }

    this.replanTimer -= dt;
    // Don't force random curb-dives when idle — only when threatened or truly stuck
    const forceTurn =
      blockedAhead ||
      (threats > 0 &&
        (headingIntoDanger ||
          aheadThreat > behindThreat * 0.45 ||
          nearestDist < fleeR * 0.65)) ||
      (threats === 0 && this.straightSec > 6);

    const needReplan =
      this.replanTimer <= 0 ||
      !this.escapeTarget ||
      this.car.pos.distance(this.escapeTarget) < 28 ||
      forceTurn ||
      blockedAhead ||
      (threats > 0 && this.replanTimer < 0.8);

    if (needReplan) {
      this.escapeTarget = this.pickEscape(
        world,
        dangerDir,
        threats,
        forceTurn,
        blockedAhead,
        roadsOnly,
        rng,
      );
      this.replanTimer =
        threats > 0 ? 0.35 + rng() * 0.25 : forceTurn ? 0.8 + rng() * 0.4 : 1.6 + rng();
      if (forceTurn) this.straightSec = 0;
      steering.invalidatePath(this.car);
    }

    let goal = this.escapeTarget ?? this.car.pos.add(heading.scale(120));
    if (roadsOnly) {
      const cell = world.worldToCell(this.car.pos.x, this.car.pos.y);
      const onRoad = isRoadLike(world.getKind(cell.col, cell.row));
      if (!onRoad) {
        goal = nearestRoadPoint(world, this.car.pos, 16) ?? goal;
      } else {
        goal = nearestRoadPoint(world, goal, 18) ?? goal;
      }
    }

    steering.followPath(
      this.car,
      world,
      goal,
      config,
      threats > 0 || this.isNitroActive ? maxSpeed : maxSpeed * 0.85,
      config.pathStyle,
      dt,
      { roadsOnly },
    );

    // Flee = turn first. Always commit escape heading when threatened.
    if (threats > 0 && this.escapeTarget) {
      this.commitEvadeTurn(this.escapeTarget, world, roadsOnly);
    } else if (!this.isNitroActive) {
      steering.emergencyBrakeForCars(
        this.car,
        cops.map((c) => c.car),
      );
    }

    // Keep off the roadside — feelers ignore lots, so recenter on asphalt.
    if (roadsOnly) steering.keepCenteredOnRoad(this.car, world);

    // Nitro full-throttle only once we're pointed away from danger
    if (this.isNitroActive) {
      const fleeing =
        dangerDir.length() < 0.5 || this.car.heading.dot(dangerDir) < 0.05;
      if (fleeing) this.car.setThrottle(1);
    }

    this.car.integrateControls(dt);
  }

  /**
   * Blend toward the escape heading (hard snaps at speed drive into the curb).
   * Skip override if the escape ray dies on a roadside wall.
   */
  private commitEvadeTurn(
    target: Vector2,
    world: ChunkWorld,
    roadsOnly: boolean,
  ): void {
    const to = target.sub(this.car.pos);
    if (to.length() < 4) return;
    const n = to.normalize();

    if (roadsOnly) {
      const tip = this.car.pos.add(n.scale(48));
      const hit = raycastGrid(world, this.car.pos, tip, 4, { roadsOnly: true });
      if (hit && this.car.pos.distance(hit) < 30) {
        // Escape points into the curb — stay on path + recenter instead
        steering.keepCenteredOnRoad(this.car, world);
        return;
      }
    }

    const err = wrapAngle(to.heading() - this.car.angle);
    this.car.setDesiredHeading(wrapAngle(this.car.angle + err * 0.42));
    const alongEscape = n.dot(this.car.heading);
    this.car.setThrottle(alongEscape < 0.25 ? 0.55 : 0.9);
  }

  private updateNitro(
    dt: number,
    threats: number,
    nearestDist: number,
    fleeR: number,
    blockedAhead: boolean,
    headingIntoDanger: boolean,
  ): void {
    if (this.nitroState === 'active') {
      this.nitroTimer -= dt;
      if (this.nitroTimer <= 0) {
        this.nitroState = 'cooldown';
        this.nitroTimer = GAMEPLAY.nitroCooldownSec;
      }
      return;
    }

    if (this.nitroState === 'cooldown') {
      this.nitroTimer -= dt;
      if (this.nitroTimer <= 0) {
        this.nitroState = 'ready';
        this.nitroTimer = 0;
      }
      return;
    }

    // Never nitro into a threat — wait until turned away
    if (blockedAhead || headingIntoDanger) return;
    const shouldBoost = threats > 0 && nearestDist < fleeR * 0.75;
    if (shouldBoost) {
      this.nitroState = 'active';
      this.nitroTimer = GAMEPLAY.nitroDurationSec;
    }
  }

  /**
   * Pick a flee / cruise goal. Prefers road-network directions so we don't
   * constantly aim at the curb; when threatened, maximize distance from danger.
   */
  private pickEscape(
    world: ChunkWorld,
    dangerDir: Vector2,
    threats: number,
    forceTurn: boolean,
    blockedAhead: boolean,
    roadsOnly: boolean,
    rng: Rng,
  ): Vector2 {
    const heading = this.car.heading;
    const cell = world.worldToCell(this.car.pos.x, this.car.pos.y);

    const snap = (p: Vector2): Vector2 => {
      if (!roadsOnly) return p;
      return nearestRoadPoint(world, p, 16) ?? p;
    };

    // Candidate directions: road neighbors first, then flee vectors
    const candidates: Vector2[] = [];
    const dirs = [
      new Vector2(1, 0),
      new Vector2(-1, 0),
      new Vector2(0, 1),
      new Vector2(0, -1),
      heading,
      heading.rotate(0.4),
      heading.rotate(-0.4),
    ];

    if (threats > 0 || blockedAhead || forceTurn) {
      const left = new Vector2(-heading.y, heading.x);
      const right = new Vector2(heading.y, -heading.x);
      dirs.push(
        left,
        right,
        left.add(heading.scale(0.4)).normalize(),
        right.add(heading.scale(0.4)).normalize(),
        heading.scale(-1),
      );
      if (dangerDir.length() > 0.5) {
        const away = dangerDir.scale(-1);
        dirs.push(
          away,
          away.add(left).normalize(),
          away.add(right).normalize(),
          away.add(heading).normalize(),
        );
      }
    }

    for (const d of dirs) {
      if (d.length() < 1e-4) continue;
      candidates.push(d.normalize());
    }

    // Prefer axes that stay on asphalt from the current cell
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (isRoadLike(world.getKind(cell.col + dc, cell.row + dr))) {
        candidates.push(new Vector2(dc, dr));
      }
    }

    let best = heading;
    let bestScore = -Infinity;
    for (const n of candidates) {
      const tip = this.car.pos.add(n.scale(110));
      // When roads-only, lots count as blocked so curb-dives score poorly
      const hit = raycastGrid(world, this.car.pos, tip, 5, { roadsOnly });
      const clear = hit ? this.car.pos.distance(hit) : 110;

      // Must have some runway — ignore directions that kiss a wall/curb
      if (clear < 28) continue;

      let score = clear;

      // Prefer the middle of the strip — outer-lane aims scrape the roadside
      if (roadsOnly) {
        const mid = this.car.pos.add(n.scale(40));
        const side = new Vector2(-n.y, n.x);
        const lHit = raycastGrid(
          world,
          mid,
          mid.add(side.scale(-40)),
          3,
          { roadsOnly: true },
        );
        const rHit = raycastGrid(
          world,
          mid,
          mid.add(side.scale(40)),
          3,
          { roadsOnly: true },
        );
        const lClear = lHit ? mid.distance(lHit) : 40;
        const rClear = rHit ? mid.distance(rHit) : 40;
        const sideMin = Math.min(lClear, rClear);
        score += sideMin * 1.4;
        if (sideMin < 14) score -= 55;
      }

      // Strongly prefer continuing along the current road when idle
      if (threats === 0) {
        score += n.dot(heading) * 55;
      }

      if (threats > 0 && dangerDir.length() > 0.5) {
        // Flee away from cops — not into them
        score -= n.dot(dangerDir) * 120;
        score += n.dot(heading) * 10; // slight keep-rolling bias
      }

      // Bonus if the step lands on a road cell
      const step = world.worldToCell(
        this.car.pos.x + n.x * 50,
        this.car.pos.y + n.y * 50,
      );
      if (isRoadLike(world.getKind(step.col, step.row))) score += 40;

      score += rng() * 6;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    // Idle cruise: go farther forward along the road
    const distCells =
      threats > 0 || blockedAhead ? 5 + Math.floor(rng() * 4) : 7 + Math.floor(rng() * 4);
    return snap(world.cellInDirection(this.car.pos, best, distCells));
  }

  render(ctx: CanvasRenderingContext2D, t: number): void {
    this.car.renderProximityGlow(ctx);
    if (this.isNitroActive) {
      this.renderNitroTrail(ctx, t);
    }
    this.car.render(ctx, t);
  }

  private renderNitroTrail(ctx: CanvasRenderingContext2D, t: number): void {
    const { x, y } = this.car.body.position;
    const heading = this.car.heading;
    const pulse = 0.65 + 0.35 * Math.sin(t * 28);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.car.angle);
    ctx.shadowColor = '#7dff3a';
    ctx.shadowBlur = 18 * pulse;
    ctx.fillStyle = `rgba(180, 255, 80, ${0.55 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-22 - 6 * pulse, -5);
    ctx.lineTo(-28 - 10 * pulse, 0);
    ctx.lineTo(-22 - 6 * pulse, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = `rgba(57, 255, 20, ${0.35 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - heading.x * 12, y - heading.y * 12);
    ctx.lineTo(x - heading.x * 36, y - heading.y * 36);
    ctx.stroke();
    ctx.restore();
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
