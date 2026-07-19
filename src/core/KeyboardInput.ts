/** Tracks WASD / arrow keys for thief manual drive. */
export class KeyboardInput {
  private readonly down = new Set<string>();
  private attached = false;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!isDriveKey(e.code)) return;
    e.preventDefault();
    this.down.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (!isDriveKey(e.code)) return;
    e.preventDefault();
    this.down.delete(e.code);
  };

  attach(): void {
    if (this.attached) return;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.down.clear();
    this.attached = false;
  }

  clear(): void {
    this.down.clear();
  }

  /** +1 forward / −1 brake; 0 coast. */
  get throttleAxis(): number {
    const up = this.pressed('KeyW', 'ArrowUp');
    const down = this.pressed('KeyS', 'ArrowDown');
    if (up && !down) return 1;
    if (down && !up) return -1;
    return 0;
  }

  /** −1 left / +1 right; 0 hold. */
  get turnAxis(): number {
    const left = this.pressed('KeyA', 'ArrowLeft');
    const right = this.pressed('KeyD', 'ArrowRight');
    if (left && !right) return -1;
    if (right && !left) return 1;
    return 0;
  }

  /** Space — manual nitro. */
  get nitroPressed(): boolean {
    return this.pressed('Space');
  }

  private pressed(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }
}

function isDriveKey(code: string): boolean {
  return (
    code === 'KeyW' ||
    code === 'KeyA' ||
    code === 'KeyS' ||
    code === 'KeyD' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight' ||
    code === 'Space'
  );
}
