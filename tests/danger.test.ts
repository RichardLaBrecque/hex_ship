import { describe, expect, it } from "vitest";
import type { Danger } from "../src/data/enemies";
import { dangerOutlook, dangerTier, notorietyTier, valueTier } from "../src/economy/danger";
import type { Run } from "../src/economy/run";
import { hex } from "../src/hex/hex";
import { placePart, type Ship } from "../src/ship/ship";
import { TEST_PARTS } from "./catalog";

// checkpoints at $100 and $200 for danger 2 and 3; three levels in all
const TEST_DANGER: Danger = {
  valueCheckpoints: [100, 200],
  dropBuffer: 20,
  killsPerTier: 5,
  levels: [[], [], []],
};

// a bridge ($0) plus some $100 engines
function shipWorth(engines: number): Ship {
  let ship: Ship = placePart(new Map(), hex(0, 0), "bridge", 0, TEST_PARTS);
  for (let i = 0; i < engines; i++) ship = placePart(ship, hex(i + 1, 0), "engine", 0, TEST_PARTS);
  return ship;
}

const run = (overrides: Partial<Run>): Run => ({
  money: 0,
  day: 1,
  ship: shipWorth(0),
  crew: 0,
  crewSigned: 0,
  fuel: 0,
  docked: 0,
  offers: [],
  cargo: [],
  delivered: 0,
  kills: 0,
  valueTier: 1,
  peakShipValue: 0,
  cargoEarned: 0,
  bountiesEarned: 0,
  ...overrides,
});

describe("valueTier", () => {
  it("rises as soon as a checkpoint is reached", () => {
    expect(valueTier(100, 1, TEST_DANGER)).toBe(2);
    expect(valueTier(250, 1, TEST_DANGER)).toBe(3);
  });

  it("stays put while the value is only just under the checkpoint", () => {
    expect(valueTier(85, 2, TEST_DANGER)).toBe(2);
  });

  it("drops once the value falls the buffer under the checkpoint", () => {
    expect(valueTier(79, 2, TEST_DANGER)).toBe(1);
  });

  it("drops only as far as the value warrants", () => {
    expect(valueTier(150, 3, TEST_DANGER)).toBe(2);
  });
});

describe("notorietyTier", () => {
  it("adds a tier for every killsPerTier kills", () => {
    expect(notorietyTier(4, TEST_DANGER)).toBe(1);
    expect(notorietyTier(5, TEST_DANGER)).toBe(2);
    expect(notorietyTier(12, TEST_DANGER)).toBe(3);
  });
});

describe("dangerTier", () => {
  it("is the ship-value tier when that's higher", () => {
    expect(dangerTier(run({ ship: shipWorth(1), kills: 0 }), TEST_PARTS, TEST_DANGER)).toBe(2);
  });

  it("is the notoriety tier when that's higher, whatever the ship is worth", () => {
    expect(dangerTier(run({ ship: shipWorth(0), kills: 5 }), TEST_PARTS, TEST_DANGER)).toBe(2);
  });

  it("never goes past the highest level", () => {
    expect(dangerTier(run({ ship: shipWorth(9), kills: 99 }), TEST_PARTS, TEST_DANGER)).toBe(3);
  });
});

describe("dangerOutlook", () => {
  it("shows the next checkpoint and the kills still needed", () => {
    expect(dangerOutlook(run({ kills: 3 }), TEST_PARTS, TEST_DANGER)).toEqual({ tier: 1, nextValue: 100, killsToNext: 2 });
  });

  it("has nothing left to reach at the top level", () => {
    expect(dangerOutlook(run({ ship: shipWorth(2) }), TEST_PARTS, TEST_DANGER)).toEqual({ tier: 3, nextValue: null, killsToNext: null });
  });
});
