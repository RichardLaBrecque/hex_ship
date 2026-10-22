import type { Point } from "../hex/hex";

// Short-lived glowing dots for sparks, explosions and exhaust. Purely visual: nothing in the sim reads them.
export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number; // seconds until it disappears
  size: number; // radius at birth; shrinks to nothing over its life
  color: string;
};

export const MAX_PARTICLES = 1500; // the oldest are dropped past this, so a big fight can't slow the game down
const DRAG = 2.5; // per second; particles slow down as they fade

// Moves every particle one step and drops the ones that have burnt out.
export function stepParticles(particles: readonly Particle[], dt: number): Particle[] {
  const slow = Math.exp(-DRAG * dt);
  const alive: Particle[] = [];
  for (const p of particles) {
    const age = p.age + dt;
    if (age >= p.life) continue;
    alive.push({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vx: p.vx * slow, vy: p.vy * slow, age });
  }
  return alive.length > MAX_PARTICLES ? alive.slice(alive.length - MAX_PARTICLES) : alive;
}

export type Burst = {
  count: number;
  speed: { min: number; max: number }; // pixels/s, in a random direction
  life: { min: number; max: number };
  size: { min: number; max: number };
  colors: readonly string[];
};

// What each kind of hit or explosion throws out.
export const BURSTS = {
  hullHit: { count: 8, speed: { min: 60, max: 200 }, life: { min: 0.15, max: 0.4 }, size: { min: 1, max: 2.5 }, colors: ["#fff3c4", "#ffb347"] },
  shieldHit: { count: 10, speed: { min: 40, max: 140 }, life: { min: 0.2, max: 0.45 }, size: { min: 1, max: 2.5 }, colors: ["#bfe0ff", "#3d8fd6"] },
  intercept: { count: 10, speed: { min: 40, max: 160 }, life: { min: 0.2, max: 0.5 }, size: { min: 1, max: 2.5 }, colors: ["#ffffff", "#e8c547"] },
  partDestroyed: { count: 26, speed: { min: 30, max: 220 }, life: { min: 0.3, max: 0.9 }, size: { min: 1.5, max: 4 }, colors: ["#fff3c4", "#ffb347", "#d9622b"] },
  shipDestroyed: { count: 90, speed: { min: 20, max: 320 }, life: { min: 0.5, max: 1.6 }, size: { min: 2, max: 6 }, colors: ["#ffffff", "#fff3c4", "#ffb347", "#d9622b", "#7a8899"] },
} satisfies Record<string, Burst>;

// Particles flying out from `at` in every direction. `drift` is added to each, e.g. the ship's own velocity.
export function burst(at: Point, kind: Burst, random: () => number, drift: Point = { x: 0, y: 0 }): Particle[] {
  return Array.from({ length: kind.count }, () => {
    const angle = random() * Math.PI * 2;
    const speed = between(kind.speed, random);
    return {
      x: at.x,
      y: at.y,
      vx: drift.x + Math.cos(angle) * speed,
      vy: drift.y + Math.sin(angle) * speed,
      age: 0,
      life: between(kind.life, random),
      size: between(kind.size, random),
      color: kind.colors[Math.floor(random() * kind.colors.length)],
    };
  });
}

// One puff out of an engine or a missile's tail. `angle` is the way the exhaust points; `drift` is the ship's velocity.
export function exhaust(at: Point, angle: number, drift: Point, random: () => number, color = "#ffb347"): Particle {
  const spread = (random() - 0.5) * 0.5;
  const speed = 80 + random() * 60;
  return {
    x: at.x,
    y: at.y,
    vx: drift.x + Math.cos(angle + spread) * speed,
    vy: drift.y + Math.sin(angle + spread) * speed,
    age: 0,
    life: 0.25 + random() * 0.25,
    size: 1.5 + random() * 1.5,
    color,
  };
}

// How many puffs to emit this step for `rate` per second: the fraction left over is a coin flip.
export function emitCount(rate: number, dt: number, random: () => number): number {
  const expected = rate * dt;
  const whole = Math.floor(expected);
  return whole + (random() < expected - whole ? 1 : 0);
}

const between = (range: { min: number; max: number }, random: () => number): number => range.min + random() * (range.max - range.min);

// Drawn additively, so overlapping sparks glow brighter.
export function drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[]): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const left = 1 - p.age / p.life;
    ctx.globalAlpha = left;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size * left), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
