import { Vector2 } from '../core/Vector2';

/**
 * Shared cop radio net: any unit with a visual on the thief broadcasts
 * position + velocity; the pack chases that last-known contact until the
 * next sighting refreshes it.
 *
 * `revision` increments whenever the contact meaningfully moves so every
 * unit can invalidate paths and turn toward the new fix.
 */
export class CopRadio {
  readonly pos = new Vector2();
  readonly vel = new Vector2();
  /** Seconds since the last visual / intel broadcast. */
  ageSec = Number.POSITIVE_INFINITY;
  hasContact = false;
  /** Bumps on each meaningful report — cops retarget when this changes. */
  revision = 0;

  /** Initial dispatch / 911 ping so the chase has a starting grid. */
  dispatch(pos: Vector2, vel: Vector2 = Vector2.zero()): void {
    this.report(pos, vel);
  }

  report(pos: Vector2, vel: Vector2): void {
    const moved = !this.hasContact || this.pos.distance(pos) > 6;
    this.pos.set(pos.x, pos.y);
    this.vel.set(vel.x, vel.y);
    this.ageSec = 0;
    this.hasContact = true;
    if (moved) this.revision += 1;
  }

  tick(dt: number): void {
    if (!this.hasContact) return;
    if (this.ageSec < Number.POSITIVE_INFINITY) {
      this.ageSec += dt;
    }
  }
}
