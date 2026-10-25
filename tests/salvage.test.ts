import { describe, expect, it } from "vitest";
import { ECONOMY, type Economy } from "../src/data/balance";
import type { Outcome, Run } from "../src/economy/run";
import { installSalvage, pickSalvage, salvageUnits, sellSalvage } from "../src/economy/salvage";
import { hex } from "../src/hex/hex";
import { partAt, placePart, type Ship } from "../src/ship/ship";
import { TEST_PARTS } from "./catalog";

const TEST_ECONOMY: Economy = { ...ECONOMY, fuelPrice: 2, salvageUnits: 5, salvageChance: 0.5, salvageMax: 2 };

// bridge + rear engine + fuel tank (30 units) + cargo bay (10 units).
function testShip(): Ship {
  let ship: Ship = placePart(new Map(), hex(0, 0), "bridge", 0, TEST_PARTS);
  ship = placePart(ship, hex(-1, 0), "engine", 3, TEST_PARTS);
  ship = placePart(ship, hex(0, -1), "fuel", 0, TEST_PARTS);
  return placePart(ship, hex(0, 1), "cargo", 0, TEST_PARTS);
}

function testRun(overrides: Partial<Run> = {}): Run {
  return {
    money: 1000,
    day: 1,
    ship: testShip(),
    crew: 2,
    crewSigned: 2,
    fuel: 30,
    docked: 0,
    offers: [],
    cargo: [],
    salvage: [],
    delivered: 0,
    kills: 0,
    valueTier: 1,
    topTrips: 0,
    peakShipValue: 0,
    cargoEarned: 0,
    bountiesEarned: 0,
    ...overrides,
  };
}

function ok(outcome: Outcome): Run {
  if (!outcome.ok) throw new Error(`expected success, got: ${outcome.reason}`);
  return outcome.run;
}

function reason(outcome: Outcome): string {
  if (outcome.ok) throw new Error("expected failure");
  return outcome.reason;
}

// Returns each value in turn, forever.
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("pickSalvage", () => {
  it("keeps each part that rolls under the salvage chance", () => {
    const parts = [
      { type: "engine" as const, hp: 9 },
      { type: "fuel" as const, hp: 9 },
      { type: "cannon" as const, hp: 9 },
    ];
    expect(pickSalvage(parts, sequence(0.1, 0.9, 0.4), TEST_ECONOMY)).toEqual([parts[0], parts[2]]);
  });

  it("drops no more than the most salvage per kill", () => {
    const parts = [
      { type: "engine" as const, hp: 9 },
      { type: "fuel" as const, hp: 9 },
      { type: "cannon" as const, hp: 9 },
    ];
    expect(pickSalvage(parts, () => 0, TEST_ECONOMY)).toEqual([parts[0], parts[1]]);
  });

  it("never salvages the bridge", () => {
    expect(pickSalvage([{ type: "bridge" as const, hp: 9 }], () => 0, TEST_ECONOMY)).toEqual([]);
  });
});

describe("salvageUnits", () => {
  it("takes the same hold space for every part", () => {
    const salvage = [
      { type: "engine" as const, hp: 20 },
      { type: "cargo" as const, hp: 1 },
    ];
    expect(salvageUnits(salvage, TEST_ECONOMY)).toBe(10);
  });
});

describe("sellSalvage", () => {
  it("pays what the damaged part is worth and counts it toward bounties", () => {
    // engine: $100 at 20 hp, so 5 hp sells for $25
    const run = ok(sellSalvage(testRun({ salvage: [{ type: "laser", hp: 1 }, { type: "engine", hp: 5 }], bountiesEarned: 9 }), 1, TEST_PARTS));
    expect(run.money).toBe(1025);
    expect(run.bountiesEarned).toBe(34);
    expect(run.salvage).toEqual([{ type: "laser", hp: 1 }]);
  });

  it("refuses salvage that isn't in the hold", () => {
    expect(reason(sellSalvage(testRun(), 0, TEST_PARTS))).toBe("That salvage isn't in the hold.");
  });
});

describe("installSalvage", () => {
  it("fits the part for free, damage and all, and frees its hold space", () => {
    const run = ok(installSalvage(testRun({ salvage: [{ type: "laser", hp: 3 }] }), 0, hex(1, 0), 2, TEST_PARTS, TEST_ECONOMY));
    expect(run.money).toBe(1000);
    expect(partAt(run.ship, hex(1, 0))).toEqual({ hex: hex(1, 0), type: "laser", rotation: 2, hp: 3 });
    expect(run.salvage).toEqual([]);
  });

  it("sells the part it replaces, and the fuel that no longer fits", () => {
    // fuel tank $20 refunded, 30 fuel × $2 sold back
    const run = ok(installSalvage(testRun({ salvage: [{ type: "laser", hp: 3 }] }), 0, hex(0, -1), 0, TEST_PARTS, TEST_ECONOMY));
    expect(run.money).toBe(1080);
    expect(run.fuel).toBe(0);
  });

  it("won't replace the bridge", () => {
    expect(reason(installSalvage(testRun({ salvage: [{ type: "laser", hp: 3 }] }), 0, hex(0, 0), 0, TEST_PARTS, TEST_ECONOMY))).toBe(
      "The bridge can't be replaced.",
    );
  });

  it("doesn't score installed salvage as bounties", () => {
    const run = ok(installSalvage(testRun({ salvage: [{ type: "laser", hp: 3 }] }), 0, hex(1, 0), 0, TEST_PARTS, TEST_ECONOMY));
    expect(run.bountiesEarned).toBe(0);
  });
});
