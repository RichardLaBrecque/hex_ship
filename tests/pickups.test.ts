import { describe, expect, it } from "vitest";
import { collectPickups, pullPickups, stepPickups, type Pickup } from "../src/sim/pickups";

const pickup = (overrides: Partial<Pickup> = {}): Pickup => ({
  salvage: { type: "engine", hp: 9 },
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  angle: 0,
  spin: 0,
  age: 0,
  ...overrides,
});

describe("stepPickups", () => {
  it("drifts along its velocity and slows down", () => {
    const [moved] = stepPickups([pickup({ vx: 100 })], 0.1, 0.5, 30);
    expect(moved.x).toBeCloseTo(10);
    expect(moved.vx).toBeCloseTo(100 * Math.exp(-0.05));
    expect(moved.age).toBeCloseTo(0.1);
  });

  it("loses salvage that has drifted for its whole life", () => {
    expect(stepPickups([pickup({ age: 29.95 }), pickup({ age: 9 })], 0.1, 0.5, 30)).toHaveLength(1);
  });
});

describe("collectPickups", () => {
  it("picks up salvage within reach and leaves the rest", () => {
    const near = pickup({ x: 9 });
    const far = pickup({ x: 99 });
    const result = collectPickups([near, far], { x: 0, y: 0 }, 10, 20, 5);
    expect(result.collected).toEqual([near]);
    expect(result.left).toEqual([far]);
    expect(result.blocked).toBe(false);
  });

  it("only picks up what fits in the hold, and says the rest was blocked", () => {
    const first = pickup({ x: 1 });
    const second = pickup({ x: 2 });
    const result = collectPickups([first, second], { x: 0, y: 0 }, 10, 9, 5);
    expect(result.collected).toEqual([first]);
    expect(result.left).toEqual([second]);
    expect(result.blocked).toBe(true);
  });

  it("isn't blocked by a full hold when nothing is in reach", () => {
    expect(collectPickups([pickup({ x: 99 })], { x: 0, y: 0 }, 10, 0, 5).blocked).toBe(false);
  });
});

describe("pullPickups", () => {
  // A grip this strong reaches the pull within one step.
  const GRIP = 1000;

  it("pulls salvage in range straight toward the ship", () => {
    const [pulled] = pullPickups([pickup()], { x: 90, y: 0, vx: 0, vy: 0 }, 100, 50, 1, GRIP);
    expect(pulled.vx).toBeCloseTo(50);
    expect(pulled.vy).toBeCloseTo(0);
  });

  it("adds the ship's own velocity, so salvage keeps up with a ship flying away", () => {
    const [pulled] = pullPickups([pickup()], { x: 90, y: 0, vx: 300, vy: 0 }, 100, 50, 1, GRIP);
    expect(pulled.vx).toBeCloseTo(350);
  });

  it("eases toward the pull rather than snapping to it", () => {
    // 1 - e^(-3 × 0.1) of the way from 0 to 50
    const [pulled] = pullPickups([pickup()], { x: 90, y: 0, vx: 0, vy: 0 }, 100, 50, 0.1, 3);
    expect(pulled.vx).toBeCloseTo(50 * (1 - Math.exp(-0.3)));
  });

  it("leaves salvage out of range alone", () => {
    const far = pickup({ vx: 9 });
    expect(pullPickups([far], { x: 101, y: 0, vx: 0, vy: 0 }, 100, 50, 1, GRIP)).toEqual([far]);
  });

  it("leaves salvage alone without a working tractor beam", () => {
    const near = pickup({ vx: 9 });
    expect(pullPickups([near], { x: 9, y: 0, vx: 0, vy: 0 }, 100, 0, 1, GRIP)).toEqual([near]);
  });
});
