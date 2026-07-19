export class Vector2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  static from(v: { x: number; y: number }): Vector2 {
    return new Vector2(v.x, v.y);
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  sub(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  scale(s: number): Vector2 {
    return new Vector2(this.x * s, this.y * s);
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): Vector2 {
    const len = this.length();
    if (len < 1e-8) return new Vector2(0, 0);
    return this.scale(1 / len);
  }

  dot(other: Vector2): number {
    return this.x * other.x + this.y * other.y;
  }

  rotate(angle: number): Vector2 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  limit(max: number): Vector2 {
    const len = this.length();
    if (len > max && len > 1e-8) return this.scale(max / len);
    return this.clone();
  }

  distance(other: Vector2): number {
    return this.sub(other).length();
  }

  heading(): number {
    return Math.atan2(this.y, this.x);
  }

  static fromAngle(angle: number, length = 1): Vector2 {
    return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  static zero(): Vector2 {
    return new Vector2(0, 0);
  }
}
