import Matter from 'matter-js';

export type BodyLabel = 'thief' | 'cop' | 'traffic' | 'building' | 'boundary';

export interface PhysicsWorld {
  engine: Matter.Engine;
  world: Matter.World;
}

export function createPhysicsWorld(): PhysicsWorld {
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: 0, scale: 0 },
    enableSleeping: false,
  });
  engine.timing.timeScale = 1;
  return { engine, world: engine.world };
}

export function stepPhysics(engine: Matter.Engine, dtSeconds: number): void {
  Matter.Engine.update(engine, dtSeconds * 1000);
}

export function clearWorld(world: Matter.World): void {
  Matter.World.clear(world, false);
}

export function addBody(world: Matter.World, body: Matter.Body): void {
  Matter.World.add(world, body);
}

export function removeBody(world: Matter.World, body: Matter.Body): void {
  Matter.World.remove(world, body);
}

export function createStaticRect(
  x: number,
  y: number,
  w: number,
  h: number,
  label: BodyLabel = 'building',
): Matter.Body {
  return Matter.Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    label,
    friction: 0.2,
    frictionStatic: 0.4,
    restitution: 0.05,
  });
}

export function createCarBody(
  x: number,
  y: number,
  width: number,
  height: number,
  label: BodyLabel,
): Matter.Body {
  const body = Matter.Bodies.rectangle(x, y, width, height, {
    label,
    frictionAir: 0.04,
    friction: 0.08,
    restitution: 0.02,
    density: 0.004,
    // Cars don't physically collide with each other in Matter — capture is
    // distance-checked in Game.update. Avoids Matter collision-callback hangs.
    collisionFilter: {
      category: 0x0002,
      mask: 0x0000,
    },
  });
  // Heading is owned by arcade drive — Matter must never torque-spin the car.
  Matter.Body.setInertia(body, Infinity);
  Matter.Body.setAngularVelocity(body, 0);
  return body;
}
