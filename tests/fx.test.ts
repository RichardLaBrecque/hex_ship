import { describe, expect, it } from "vitest";
import { burst, emitCount, MAX_PARTICLES, stepParticles, type Burst, type Particle } from "../src/fx/particles";
import { addTrauma, decayTrauma, shakeOffset } from "../src/fx/shake";
import { seeded } from "./random";

const particle = (overrides: Partial<Particle> = {}): Particle => ({
  x: 0,
  y: 0,
  vx: 100,
  vy: 0,
  age: 0,
  life: 1,
  size: 2,
  color: "#fff",
  ...overrides,
});

describe("stepParticles", () => {
  it("moves a particle along its velocity and ages it", () => {
    const [moved] = stepParticles([particle()], 0.1);
    expect(moved.x).toBeCloseTo(10);
    expect(moved.age).toBeCloseTo(0.1);
  });

  it("slows particles down", () => {
    const [moved] = stepParticles([particle()], 0.1);
    expect(moved.vx).toBeLessThan(100);
    expect(moved.vx).toBeGreaterThan(0);
  });

  it("drops particles that have burnt out", () => {
    expect(stepParticles([particle({ age: 0.95 })], 0.1)).toEqual([]);
  });

  it("keeps only the newest particles past the cap", () => {
    const many = Array.from({ length: MAX_PARTICLES + 9 }, (_, i) => particle({ x: i }));
    const kept = stepParticles(many, 0);
    expect(kept).toHaveLength(MAX_PARTICLES);
    expect(kept[0].x).toBe(9);
  });
});

describe("burst", () => {
  const KIND: Burst = { count: 9, speed: { min: 10, max: 20 }, life: { min: 1, max: 2 }, size: { min: 1, max: 3 }, colors: ["#A", "#B"] };

  it("throws out `count` particles from the point, within the burst's ranges", () => {
    const particles = burst({ x: 5, y: 9 }, KIND, seeded(1));
    expect(particles).toHaveLength(9);
    for (const p of particles) {
      expect(p).toMatchObject({ x: 5, y: 9, age: 0 });
      const speed = Math.hypot(p.vx, p.vy);
      expect(speed).toBeGreaterThanOrEqual(10);
      expect(speed).toBeLessThanOrEqual(20);
      expect(p.life).toBeGreaterThanOrEqual(1);
      expect(p.life).toBeLessThanOrEqual(2);
      expect(["#A", "#B"]).toContain(p.color);
    }
  });

  it("adds the drift to every particle", () => {
    // random 0 → angle 0, minimum speed: straight along x at 10
    const [p] = burst({ x: 0, y: 0 }, KIND, () => 0, { x: 90, y: 9 });
    expect(p.vx).toBeCloseTo(100);
    expect(p.vy).toBeCloseTo(9);
  });
});

describe("emitCount", () => {
  it("emits the whole number of puffs due", () => {
    // 90/s × 0.1s = 9 exactly
    expect(emitCount(90, 0.1, () => 0.99)).toBe(9);
  });

  it("flips a coin for the fraction left over", () => {
    // 25/s × 0.1s = 2.5
    expect(emitCount(25, 0.1, () => 0.4)).toBe(3);
    expect(emitCount(25, 0.1, () => 0.6)).toBe(2);
  });
});

describe("screen shake", () => {
  it("caps trauma at 1", () => {
    expect(addTrauma(0.9, 0.5)).toBe(1);
  });

  it("fades trauma over time, but not below 0", () => {
    const shake = { maxOffset: 10, decay: 2 };
    expect(decayTrauma(0.9, 0.1, shake)).toBeCloseTo(0.7);
    expect(decayTrauma(0.1, 1, shake)).toBe(0);
  });

  it("shakes by trauma squared", () => {
    const shake = { maxOffset: 10, decay: 2 };
    // random 1 → the full offset each way: 10 × 0.5² = 2.5
    expect(shakeOffset(0.5, () => 1, shake)).toEqual({ x: 2.5, y: 2.5 });
    expect(shakeOffset(0, () => 1, shake)).toEqual({ x: 0, y: 0 });
  });
});
