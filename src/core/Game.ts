import Matter from 'matter-js';
import { CopManager } from '../ai/CopManager';
import type { MatchSettings } from './types';
import { createRng, type Rng } from './rng';
import { GameLoop } from './GameLoop';
import { Camera } from './Camera';
import { KeyboardInput } from './KeyboardInput';
import { Thief } from '../entities/Thief';
import type { Car } from '../entities/Car';
import { ChunkWorld } from '../map/ChunkWorld';
import { resolveCarAgainstGrid } from '../map/gridCollision';
import { RoadSpillManager } from '../map/RoadSpill';
import {
  addBody,
  clearWorld,
  createPhysicsWorld,
  stepPhysics,
  type PhysicsWorld,
} from '../physics/world';
import { HUD } from '../ui/HUD';
import { GameOverOverlay } from '../ui/GameOverOverlay';
import { SetupOverlay } from '../ui/SetupOverlay';
import { LLMClient } from '../llm/LLMClient';
import { BIOME_COLORS, isRoadLike } from '../map/biomes';
import { CAR, GAMEPLAY } from '../config/GameConfig';

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly llm = new LLMClient();
  private readonly setup: SetupOverlay;
  private readonly hud: HUD;
  private readonly gameOver: GameOverOverlay;
  private readonly loop: GameLoop;
  private readonly camera = new Camera();
  private readonly keys = new KeyboardInput();

  private physics: PhysicsWorld | null = null;
  private world: ChunkWorld | null = null;
  private thief: Thief | null = null;
  private cops: CopManager | null = null;
  private spills: RoadSpillManager | null = null;
  private rng: Rng = createRng('default');
  private survival = 0;
  private playing = false;
  private over = false;
  private pendingGameOver = false;
  private timeSec = 0;
  private manualThief = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;

    this.setup = new SetupOverlay(uiRoot, (s) => this.startMatch(s), this.llm);
    this.hud = new HUD(uiRoot);
    this.hud.hide();
    this.gameOver = new GameOverOverlay(uiRoot, () => this.returnToSetup());
    this.loop = new GameLoop((dt) => this.update(dt), () => this.render());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private startMatch(settings: MatchSettings): void {
    this.teardownWorld();
    this.survival = 0;
    this.timeSec = 0;
    this.over = false;
    this.pendingGameOver = false;
    this.playing = true;
    this.rng = createRng(settings.seed);

    this.physics = createPhysicsWorld();
    this.world = new ChunkWorld(settings.seed, settings.biome, settings.difficulty);

    const thiefConfig =
      settings.mode === 'thief' ? settings.playerConfig : settings.opponentConfig;
    const copConfig =
      settings.mode === 'cop' ? settings.playerConfig : settings.opponentConfig;

    const spawnPos = this.world.findSpawnNear(0, 0, 16);
    this.world.updateAround(spawnPos.x, spawnPos.y, 2);

    this.manualThief = settings.mode === 'thief' && settings.manual;
    this.thief = new Thief(spawnPos.x, spawnPos.y, thiefConfig, this.rng);
    this.thief.manual = this.manualThief;
    addBody(this.physics.world, this.thief.car.body);

    this.cops = new CopManager(copConfig, this.rng);
    this.cops.spawnInitial(this.physics, this.world, spawnPos);

    this.spills = new RoadSpillManager(settings.seed);
    this.camera.snapTo(spawnPos, this.canvas.width, this.canvas.height);

    this.keys.clear();
    if (this.manualThief) this.keys.attach();
    else this.keys.detach();

    this.setup.hide();
    this.gameOver.hide();
    this.hud.show();
    this.loop.start();
  }

  private returnToSetup(): void {
    this.loop.stop();
    this.keys.detach();
    this.manualThief = false;
    this.teardownWorld();
    this.playing = false;
    this.over = false;
    this.pendingGameOver = false;
    this.hud.hide();
    this.gameOver.hide();
    this.setup.show();
    this.renderIdle();
  }

  private teardownWorld(): void {
    this.world?.clear();
    if (this.physics) {
      clearWorld(this.physics.world);
      this.physics = null;
    }
    this.world = null;
    this.thief = null;
    this.cops = null;
    this.spills = null;
  }

  private finishGameOver(): void {
    if (this.over) return;
    this.over = true;
    this.playing = false;
    this.pendingGameOver = false;
    this.loop.stop();
    this.hud.hide();
    this.gameOver.show(
      this.survival,
      this.cops?.cops.length ?? 0,
      this.cops?.getCycles() ?? 0,
    );
  }

  private focusPos() {
    return this.thief!.car.pos;
  }

  /**
   * Full speed on road/junction/bridge; crawl on sidewalk / open lots.
   * Cops with banOffRoad (thief outside sense) get near-zero lot speed.
   */
  private applySurface(car: Car, opts?: { banOffRoad?: boolean }): void {
    if (!this.world) return;
    const cell = this.world.worldToCell(car.pos.x, car.pos.y);
    const kind = this.world.getKind(cell.col, cell.row);
    if (isRoadLike(kind)) {
      car.surfaceSpeedScale = 1;
      return;
    }
    // 0 = hard ban (Car treats surface < 0.05 as no drive)
    car.surfaceSpeedScale = opts?.banOffRoad ? 0 : CAR.offRoadSpeedScale;
  }

  private update(dt: number): void {
    if (!this.playing || this.over) return;
    if (!this.physics || !this.world || !this.thief || !this.cops || !this.spills) return;

    this.survival += dt;
    this.timeSec += dt;

    const focus = this.focusPos();
    if (!Number.isFinite(focus.x) || !Number.isFinite(focus.y)) {
      this.finishGameOver();
      return;
    }

    this.world.updateAround(focus.x, focus.y, 2);
    this.camera.follow(focus, this.canvas.width, this.canvas.height);

    const view = this.camera.worldBounds(this.canvas.width, this.canvas.height);
    this.cops.update(dt, this.physics, this.world, focus, view);
    this.spills.update(dt, this.world, focus, this.survival);

    this.thief.refreshThreatSense(this.cops.cops);
    this.thief.car.tractionMultiplier = this.spills.tractionAt(this.thief.car.pos);
    // Thief stays on road while any cop is inside their sense radius
    this.applySurface(this.thief.car, { banOffRoad: this.thief.mustStayOnRoad });
    for (const cop of this.cops.cops) {
      cop.refreshSense(this.thief.car.pos);
      cop.car.tractionMultiplier = this.spills.tractionAt(cop.car.pos);
      // Cops stay on roads unless the thief is inside this cop's sense radius
      this.applySurface(cop.car, { banOffRoad: cop.mustStayOnRoad });
    }

    // Visual → radio broadcast before AI so the whole pack shares one contact
    this.cops.updateRadio(dt, this.world, this.thief);

    this.thief.update(
      dt,
      this.world,
      this.cops.cops,
      this.rng,
      this.manualThief ? this.keys : undefined,
    );
    for (const cop of this.cops.cops) {
      cop.update(
        dt,
        this.world,
        this.cops.radio,
        this.cops.cops,
        this.thief.car.pos,
      );
    }

    stepPhysics(this.physics.engine, dt);

    // Arcade heading is authoritative — kill any Matter residual spin after step
    Matter.Body.setAngularVelocity(this.thief.car.body, 0);
    for (const cop of this.cops.cops) {
      Matter.Body.setAngularVelocity(cop.car.body, 0);
    }

    // Lots act as walls when roads-only — scrape the curb, no teleport loop
    resolveCarAgainstGrid(this.thief.car, this.world, {
      roadsOnly: this.thief.mustStayOnRoad,
    });
    for (const cop of this.cops.cops) {
      resolveCarAgainstGrid(cop.car, this.world, {
        roadsOnly: cop.mustStayOnRoad,
      });
    }

    for (const cop of this.cops.cops) {
      if (this.thief.car.pos.distance(cop.car.pos) < GAMEPLAY.catchRadius) {
        this.pendingGameOver = true;
        break;
      }
    }

    if (this.pendingGameOver) {
      this.finishGameOver();
      return;
    }

    this.hud.set(
      this.survival,
      this.cops.cops.length,
      this.cops.getSpeedMultiplier(),
      this.thief.nitroFill,
      this.thief.isNitroActive,
      this.manualThief,
    );
  }

  private render(): void {
    if (!this.playing && !this.over) {
      this.renderIdle();
      return;
    }
    if (!this.world || !this.thief || !this.cops || !this.spills) return;

    const { ctx, canvas } = this;
    if (!Number.isFinite(this.camera.x) || !Number.isFinite(this.camera.y)) return;

    const colors = BIOME_COLORS[this.world.biome];
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.camera.begin(ctx);
    const view = this.camera.worldBounds(canvas.width, canvas.height, 40);
    this.world.render(ctx, view);
    this.spills.render(ctx);
    this.thief.render(ctx, this.timeSec);
    for (const cop of this.cops.cops) cop.render(ctx, this.timeSec);
    this.camera.end(ctx);
  }

  private renderIdle(): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
