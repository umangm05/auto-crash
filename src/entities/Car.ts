import Matter from 'matter-js';
import { Vector2 } from '../core/Vector2';
import { gaussian, type Rng } from '../core/rng';
import type { BehaviorConfig } from '../core/types';
import { CAR, topSpeed } from '../config/GameConfig';
import { createCarBody, type BodyLabel } from '../physics/world';

export type CarStyle = 'thief' | 'cop';

export interface CarOptions {
  x: number;
  y: number;
  angle?: number;
  label: BodyLabel;
  style: CarStyle;
  config: BehaviorConfig;
  speedMultiplier?: number;
  rng: Rng;
}

/**
 * Arcade chase car: throttle + desired heading.
 * Turns at a limited rate, grips/drifts laterally, never free-spins.
 */
export class Car {
  readonly body: Matter.Body;
  readonly style: CarStyle;
  config: BehaviorConfig;
  speedMultiplier: number;
  tractionMultiplier = 1;
  /** 1 on asphalt/bridge; lower on sidewalk / open lots. */
  surfaceSpeedScale = 1;
  /** Extra accel scale (nitro uses >1 so the boost is felt within 1s). */
  accelScale = 1;
  proximityRadius = 120;
  private readonly rng: Rng;
  private throttle = 0;
  private desiredHeading = 0;
  /** 0..1 how hard we want to turn (from AI). */
  private turnIntent = 0;

  constructor(opts: CarOptions) {
    this.body = createCarBody(opts.x, opts.y, CAR.width, CAR.height, opts.label);
    const ang = opts.angle ?? 0;
    Matter.Body.setAngle(this.body, ang);
    Matter.Body.setAngularVelocity(this.body, 0);
    this.desiredHeading = ang;
    this.style = opts.style;
    this.config = opts.config;
    this.speedMultiplier = opts.speedMultiplier ?? 1;
    this.rng = opts.rng;
  }

  get pos(): Vector2 {
    return Vector2.from(this.body.position);
  }

  get vel(): Vector2 {
    return Vector2.from(this.body.velocity);
  }

  get angle(): number {
    return this.body.angle;
  }

  get angularVelocity(): number {
    return this.body.angularVelocity;
  }

  get heading(): Vector2 {
    return Vector2.fromAngle(this.angle);
  }

  get side(): Vector2 {
    return Vector2.fromAngle(this.angle + Math.PI / 2);
  }

  faceToward(target: Vector2): void {
    const d = target.sub(this.pos);
    if (d.length() > 1e-3) {
      const a = d.heading();
      Matter.Body.setAngle(this.body, a);
      this.desiredHeading = a;
      Matter.Body.setAngularVelocity(this.body, 0);
    }
  }

  /** @deprecated use setThrottle / setDesiredHeading */
  setThrust(amount: number): void {
    this.setThrottle(amount);
  }

  /** @deprecated use setDesiredHeading */
  setSteerTorque(amount: number): void {
    // Interpret legacy torque-ish signal as turn intent toward current+signal
    this.turnIntent = Math.max(-1, Math.min(1, amount / 8));
    this.desiredHeading = wrapAngle(this.angle + this.turnIntent * 1.2);
  }

  /**
   * Drive input: `1` full throttle, `0` coast, `-1` full brake.
   * Negative values decelerate along forward speed (no reverse drive).
   */
  setThrottle(amount: number): void {
    this.throttle = Math.max(-1, Math.min(1, amount));
  }

  /** Brake intensity 0..1 (convenience wrapper over negative throttle). */
  setBrake(amount: number): void {
    this.setThrottle(-Math.max(0, Math.min(1, amount)));
  }

  setDesiredHeading(radians: number): void {
    this.desiredHeading = radians;
  }

  getThrottle(): number {
    return this.throttle;
  }

  /**
   * Instant forward kick toward the current speed cap — used when nitro
   * engages so the boost is visible immediately (accel alone is too slow).
   */
  applySpeedKick(factor = 0.55): void {
    const surface = Math.max(0, Math.min(1, this.surfaceSpeedScale));
    if (surface < 0.05) return;
    const maxSpd = topSpeed(this.config.aggression, this.speedMultiplier) * surface;
    const heading = this.heading;
    let vx = this.body.velocity.x;
    let vy = this.body.velocity.y;
    const forward = vx * heading.x + vy * heading.y;
    const targetFwd = Math.min(maxSpd, Math.max(forward, forward + (maxSpd - Math.max(0, forward)) * factor));
    const delta = targetFwd - forward;
    if (delta <= 0.5) return;
    vx += heading.x * delta;
    vy += heading.y * delta;
    const spd = Math.hypot(vx, vy);
    if (spd > maxSpd && spd > 1e-6) {
      vx = (vx / spd) * maxSpd;
      vy = (vy / spd) * maxSpd;
    }
    Matter.Body.setVelocity(this.body, { x: vx, y: vy });
  }

  applyForce(_force: Vector2): void {
    // unused — kept for API compatibility
  }

  integrateControls(dt: number): void {
    const speedNow = this.vel.length();
    // Do NOT floor surface at 0.15 — that broke allowOffRoad / roads-only bans
    const surface = Math.max(0, Math.min(1, this.surfaceSpeedScale));
    const banned = surface < 0.05;
    const maxSpd = banned
      ? 0
      : topSpeed(this.config.aggression, this.speedMultiplier) * Math.max(surface, 0.15);

    // Turn rate drops at speed (real-car feel); low driftStability = looser / more oversteer
    const speedFactor = 1 - Math.min(0.75, speedNow / Math.max(1, maxSpd || 1)) * 0.7;
    const stability = 0.35 + this.config.driftStability * 0.65;
    let turnRate = CAR.maxTurnRate * speedFactor * (0.7 + stability * 0.5);

    let err = wrapAngle(this.desiredHeading - this.angle);
    // Micro jitter (blueprint) — tiny, not spin
    err += gaussian(this.rng) * (1 - this.config.driftStability) * 0.02;

    const maxStep = turnRate * dt;
    const step = Math.max(-maxStep, Math.min(maxStep, err));
    const newAngle = this.angle + step;
    Matter.Body.setAngle(this.body, newAngle);
    Matter.Body.setAngularVelocity(this.body, 0); // kill Matter spin entirely

    const heading = Vector2.fromAngle(newAngle);
    const side = Vector2.fromAngle(newAngle + Math.PI / 2);

    // Accelerate / brake along heading
    let vx = this.body.velocity.x;
    let vy = this.body.velocity.y;
    const forwardSpeed = vx * heading.x + vy * heading.y;

    if (banned) {
      // Roads-only ban: kill speed; Game will snap back onto asphalt
      const hold = 1 - Math.min(0.95, 10 * dt);
      vx *= hold;
      vy *= hold;
    } else if (this.throttle > 0) {
      const room = Math.max(0, maxSpd - Math.max(0, forwardSpeed));
      const a =
        CAR.accel *
        this.accelScale *
        this.throttle *
        (0.55 + this.config.aggression * 0.6) *
        (0.55 + surface * 0.45);
      vx += heading.x * a * dt * (room > 0 || forwardSpeed < 0 ? 1 : 0.15);
      vy += heading.y * a * dt * (room > 0 || forwardSpeed < 0 ? 1 : 0.15);
    } else if (this.throttle < 0) {
      // True braking: scrub forward speed; do not reverse-drive
      const brakePower = -this.throttle;
      const decel =
        CAR.brake *
        brakePower *
        (0.65 + this.config.driftStability * 0.35) *
        (0.55 + surface * 0.45) *
        this.tractionMultiplier;
      if (forwardSpeed > 0.4) {
        const kill = Math.min(forwardSpeed, decel * dt);
        vx -= heading.x * kill;
        vy -= heading.y * kill;
      } else {
        const hold = 1 - Math.min(0.95, 4.5 * brakePower * dt);
        vx *= hold;
        vy *= hold;
      }
    } else {
      // coast
      vx *= 1 - CAR.coastDrag * dt;
      vy *= 1 - CAR.coastDrag * dt;
    }

    // Off-road: heavy drag so leaving asphalt feels sluggish
    if (!banned && surface < 0.99) {
      const drag = 1 - Math.min(0.85, CAR.offRoadDrag * (1 - surface) * dt);
      vx *= drag;
      vy *= drag;
    }

    // Lateral grip / drift (blueprint 4.2)
    const grip =
      (CAR.baseGrip * (0.25 + this.config.driftStability * 0.75) * this.tractionMultiplier) *
      Math.min(1, dt * 60);
    const lat = vx * side.x + vy * side.y;
    vx -= side.x * lat * grip;
    vy -= side.y * lat * grip;

    // Hard speed cap
    const spd = Math.hypot(vx, vy);
    if (spd > maxSpd && spd > 1e-6) {
      vx = (vx / spd) * maxSpd;
      vy = (vy / spd) * maxSpd;
    }
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      vx = 0;
      vy = 0;
    }

    Matter.Body.setVelocity(this.body, { x: vx, y: vy });

    const MAX_COORD = 500_000;
    const px = this.body.position.x;
    const py = this.body.position.y;
    if (!Number.isFinite(px) || !Number.isFinite(py) || Math.abs(px) > MAX_COORD || Math.abs(py) > MAX_COORD) {
      Matter.Body.setPosition(this.body, {
        x: Number.isFinite(px) ? Math.max(-MAX_COORD, Math.min(MAX_COORD, px)) : 0,
        y: Number.isFinite(py) ? Math.max(-MAX_COORD, Math.min(MAX_COORD, py)) : 0,
      });
      Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
    }
  }

  /** Called by wall resolver when we slam into a building. */
  onHitWall(normal: Vector2, strength = 1): void {
    const v = this.vel;
    const into = Math.min(0, v.dot(normal));
    // Kill into-wall velocity + scrape speed
    let vx = v.x - normal.x * into * 1.15;
    let vy = v.y - normal.y * into * 1.15;
    vx *= 1 - 0.35 * strength;
    vy *= 1 - 0.35 * strength;
    Matter.Body.setVelocity(this.body, { x: vx, y: vy });
    // Glancing bounce of heading
    this.desiredHeading = wrapAngle(this.desiredHeading + (Math.random() - 0.5) * 0.15 * strength);
  }

  renderProximityGlow(ctx: CanvasRenderingContext2D): void {
    const { x, y } = this.body.position;
    const r = this.proximityRadius;
    const grad = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    if (this.style === 'thief') {
      grad.addColorStop(0, 'rgba(57, 255, 20, 0.2)');
      grad.addColorStop(0.55, 'rgba(57, 255, 20, 0.07)');
      grad.addColorStop(1, 'rgba(57, 255, 20, 0)');
    } else {
      grad.addColorStop(0, 'rgba(59, 130, 255, 0.18)');
      grad.addColorStop(0.55, 'rgba(255, 59, 59, 0.07)');
      grad.addColorStop(1, 'rgba(255, 59, 59, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  render(ctx: CanvasRenderingContext2D, timeSec: number): void {
    const { x, y } = this.body.position;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.angle);

    if (this.style === 'thief') {
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#39ff14';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -7);
      ctx.lineTo(-10, 7);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      const pulse = 0.55 + 0.45 * Math.sin(timeSec * 8);
      ctx.strokeStyle = pulse > 0.55 ? '#ff3b3b' : '#3b82ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -6);
      ctx.lineTo(-10, 6);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
