import { describe, expect, it } from "vitest";
import type { EnemyTier } from "../src/data/enemies";
import { shipValue } from "../src/ship/ship";
import { validateShip } from "../src/ship/validate";
import { buildEnemy, spawnBody } from "../src/sim/spawner";
import { TEST_PARTS } from "./catalog";
import { seeded } from "./random";

// bridge (2 berths) + rear engine + fuel = $120 and 2 crew; every extra needs no crew
const TIER: EnemyTier = {
  name: "TEST",
  budget: { min: 200, max: 200 },
  core: [
    { q: 0, r: 0, type: "bridge", rotation: 0 },
    { q: -1, r: 0, type: "engine", rotation: 3 },
    { q: 0, r: -1, type: "fuel", rotation: 0 },
  ],
  extras: ["cargo", "fuel"],
  aimError: 0,
};

describe("buildEnemy", () => {
  it("starts from the tier's core", () => {
    const ship = buildEnemy({ ...TIER, extras: [] }, seeded(9), TEST_PARTS);
    expect([...ship.values()].map((p) => p.type)).toEqual(["bridge", "engine", "fuel"]);
  });

  it("spends the budget on extras without going over", () => {
    // $80 left: cargo is $10 and fuel $20, so it ends within $10 of the budget
    for (let seed = 1; seed <= 20; seed++) {
      const value = shipValue(buildEnemy(TIER, seeded(seed), TEST_PARTS), TEST_PARTS);
      expect(value).toBeLessThanOrEqual(200);
      expect(value).toBeGreaterThan(190);
    }
  });

  it("keeps only extras the ship can crew", () => {
    // a laser needs a third crew member the bridge has no berth for
    const ship = buildEnemy({ ...TIER, extras: ["laser"] }, seeded(9), TEST_PARTS);
    expect(validateShip(ship, TEST_PARTS).valid).toBe(true);
    expect([...ship.values()].some((p) => p.type === "laser")).toBe(false);
  });

  it("never blocks an engine's exhaust", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ship = buildEnemy(TIER, seeded(seed), TEST_PARTS);
      expect(ship.has("-2,0")).toBe(false);
    }
  });
});

describe("spawnBody", () => {
  const ENC = { spawnDistance: 100, spawnSpread: 60, despawnDistance: 999 };

  it("appears ahead of the player along the route, facing the player", () => {
    // random 0.5 means no spread
    const body = spawnBody({ x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 }, { x: 0, y: 500 }, () => 0.5, ENC);
    expect(body.x).toBeCloseTo(0);
    expect(body.y).toBeCloseTo(100);
    expect(body.angle).toBeCloseTo(-Math.PI / 2);
  });

  it("strays no more than the spread off the route", () => {
    const body = spawnBody({ x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 }, { x: 500, y: 0 }, () => 1, ENC);
    expect(Math.atan2(body.y, body.x)).toBeCloseTo(Math.PI / 3);
  });
});
