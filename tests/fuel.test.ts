import { describe, expect, it } from "vitest";
import type { Economy } from "../src/data/balance";
import { fitFuel, refuel, refuelCost } from "../src/economy/fuel";
import type { Outcome, Run } from "../src/economy/run";
import { sellPart } from "../src/economy/shop";
import { hex } from "../src/hex/hex";
import { placePart, type Ship } from "../src/ship/ship";
import { burnFuel, tripFuelEstimate } from "../src/sim/fuel";
import { TEST_PARTS } from "./catalog";

const TEST_ECONOMY: Economy = {
  startingMoney: 0,
  startingCrew: 0,
  repairCostPerHp: 1,
  crewHireCost: 1,
  crewWage: 1,
  fuelPrice: 3,
  towFee: 100,
  offersPerStation: 1,
  contractUnitsMin: 1,
  contractUnitsMax: 1,
  payPerUnitMin: 1,
  payPerUnitMax: 1,
  payGrowthPerDay: 0,
};

const TUNING = { hexSize: 10, thrustScale: 10, reverseFactor: 0.5, turnScale: 1, drag: 0.5, dockSpeed: 50 };

// bridge + rear engine + two 30-unit tanks = 60 fuel capacity
function testShip(): Ship {
  let ship: Ship = placePart(new Map(), hex(0, 0), "bridge", 0, TEST_PARTS);
  ship = placePart(ship, hex(-1, 0), "engine", 3, TEST_PARTS);
  ship = placePart(ship, hex(0, -1), "fuel", 0, TEST_PARTS);
  return placePart(ship, hex(0, 1), "fuel", 0, TEST_PARTS);
}

function testRun(overrides: Partial<Run> = {}): Run {
  return { money: 1000, day: 1, ship: testShip(), crew: 2, crewSigned: 2, fuel: 50, docked: 0, offers: [], cargo: [], ...overrides };
}

function ok(outcome: Outcome): Run {
  if (!outcome.ok) throw new Error(`expected success, got: ${outcome.reason}`);
  return outcome.run;
}

describe("burnFuel", () => {
  it("burns the rate times throttle times time", () => {
    expect(burnFuel(10, 1, 2, 0.5)).toBe(9);
  });

  it("burns half as much at half power (braking)", () => {
    expect(burnFuel(10, -0.5, 2, 1)).toBe(9);
  });

  it("burns nothing while coasting", () => {
    expect(burnFuel(10, 0, 2, 1)).toBe(10);
  });

  it("never goes below empty", () => {
    expect(burnFuel(1, 1, 2, 5)).toBe(0);
  });
});

describe("tripFuelEstimate", () => {
  it("is time at top speed plus spin-up, times burn rate", () => {
    // top speed 2 × 10 / 0.5 = 40; 400 px takes 10 s + 1 / 0.5 s spin-up = 12 s; 3 units/s → 36
    expect(tripFuelEstimate({ acceleration: 2, fuelBurn: 3 }, 400, TUNING)).toBe(36);
  });

  it("is infinite for a ship that can't move", () => {
    expect(tripFuelEstimate({ acceleration: 0, fuelBurn: 3 }, 400, TUNING)).toBe(Infinity);
  });
});

describe("refuel", () => {
  it("costs the missing units times the price", () => {
    expect(refuelCost(testRun(), TEST_PARTS, TEST_ECONOMY)).toBe(30);
  });

  it("fills the tanks and charges for it", () => {
    const run = ok(refuel(testRun(), TEST_PARTS, TEST_ECONOMY));
    expect(run.fuel).toBe(60);
    expect(run.money).toBe(970);
  });

  it("buys only what you can afford", () => {
    const run = ok(refuel(testRun({ money: 20 }), TEST_PARTS, TEST_ECONOMY));
    expect(run.fuel).toBe(56);
    expect(run.money).toBe(2);
  });

  it("refuses when the tanks are full", () => {
    expect(refuel(testRun({ fuel: 60 }), TEST_PARTS, TEST_ECONOMY)).toEqual({ ok: false, reason: "Tanks are already full." });
  });
});

describe("fitFuel", () => {
  it("spills fuel that no longer fits after selling a tank", () => {
    const run = ok(sellPart(testRun(), hex(0, 1), TEST_PARTS));
    expect(run.fuel).toBe(30);
  });

  it("leaves fuel alone when it fits", () => {
    const run = testRun({ fuel: 10 });
    expect(fitFuel(run, TEST_PARTS)).toBe(run);
  });
});
