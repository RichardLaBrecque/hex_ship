import { describe, expect, it } from "vitest";
import { speed, stepBody, type Body } from "../src/sim/physics";

const TUNING = { hexSize: 10, thrustScale: 10, reverseFactor: 0.5, turnScale: 1, drag: 0.5, dockSpeed: 50 };
const SHIP = { acceleration: 2, turnRate: 1 };
const AT_REST: Body = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };

const run = (body: Body, thrust: number, turn: number, steps: number, dt = 1 / 60): Body => {
  let b = body;
  for (let i = 0; i < steps; i++) b = stepBody(b, { thrust, turn }, SHIP, dt, TUNING);
  return b;
};

describe("stepBody", () => {
  it("accelerates along the facing direction", () => {
    const facingDown = { ...AT_REST, angle: Math.PI / 2 };
    const result = run(facingDown, 1, 0, 30);
    expect(result.vx).toBeCloseTo(0);
    expect(result.vy).toBeGreaterThan(0);
    expect(result.y).toBeGreaterThan(0);
  });

  it("brakes at half strength", () => {
    const forward = run(AT_REST, 1, 0, 1, 0.1);
    const backward = run(AT_REST, -1, 0, 1, 0.1);
    expect(backward.vx).toBeCloseTo(-forward.vx / 2);
  });

  it("turns at the ship's turn rate", () => {
    expect(run(AT_REST, 0, 1, 60).angle).toBeCloseTo(1);
    expect(run(AT_REST, 0, -1, 30).angle).toBeCloseTo(-0.5);
  });

  it("slows a coasting ship down", () => {
    const moving = { ...AT_REST, vx: 100 };
    expect(speed(run(moving, 0, 0, 60))).toBeCloseTo(100 * Math.exp(-0.5));
  });

  it("settles near top speed = acceleration × thrustScale / drag", () => {
    // 2 × 10 / 0.5 = 40
    expect(speed(run(AT_REST, 1, 0, 60 * 30))).toBeCloseTo(40, 0);
  });
});
