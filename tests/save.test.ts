import { describe, expect, it } from "vitest";
import type { Run } from "../src/economy/run";
import { hex } from "../src/hex/hex";
import { clearRun, loadRun, SAVE_KEY, SAVE_VERSION, saveRun } from "../src/save/save";
import { memoryStore } from "../src/save/store";
import { placePart, type Ship } from "../src/ship/ship";
import { TEST_PARTS } from "./catalog";

function testShip(): Ship {
  const ship = placePart(new Map(), hex(0, 0), "bridge", 0, TEST_PARTS);
  return placePart(ship, hex(-1, 0), "engine", 3, TEST_PARTS);
}

const testRun = (): Run => ({
  money: 999,
  day: 9,
  ship: testShip(),
  crew: 3,
  crewSigned: 2,
  fuel: 19,
  docked: 1,
  offers: [{ id: "9-0", cargo: "ORE", units: 9, payPerUnit: 19, tier: 1 }],
  cargo: [{ id: "9-1", cargo: "ICE", units: 4, payPerUnit: 29, tier: 0 }],
  delivered: 9,
  kills: 4,
  valueTier: 2,
  peakShipValue: 990,
  cargoEarned: 900,
  bountiesEarned: 90,
});

describe("saveRun / loadRun", () => {
  it("loads back the run that was saved, ship included", () => {
    const store = memoryStore();
    saveRun(testRun(), store);
    expect(loadRun(store, TEST_PARTS)).toEqual(testRun());
  });

  it("loads nothing when there is no save", () => {
    expect(loadRun(memoryStore(), TEST_PARTS)).toBeNull();
  });

  it("ignores a save from another version", () => {
    const store = memoryStore();
    saveRun(testRun(), store);
    const file = JSON.parse(store.get(SAVE_KEY)!);
    store.set(SAVE_KEY, JSON.stringify({ ...file, version: SAVE_VERSION + 1 }));
    expect(loadRun(store, TEST_PARTS)).toBeNull();
  });

  it("ignores a save that isn't JSON", () => {
    const store = memoryStore();
    store.set(SAVE_KEY, "{not json");
    expect(loadRun(store, TEST_PARTS)).toBeNull();
  });

  it("ignores a save with a part that doesn't exist", () => {
    const store = memoryStore();
    saveRun(testRun(), store);
    store.set(SAVE_KEY, store.get(SAVE_KEY)!.replace('"engine"', '"warp drive"'));
    expect(loadRun(store, TEST_PARTS)).toBeNull();
  });

  it("ignores a save missing a field", () => {
    const store = memoryStore();
    const { kills: _, ...missing } = testRun();
    store.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, run: { ...missing, ship: [...testRun().ship.values()] } }));
    expect(loadRun(store, TEST_PARTS)).toBeNull();
  });
});

describe("clearRun", () => {
  it("deletes the save", () => {
    const store = memoryStore();
    saveRun(testRun(), store);
    clearRun(store);
    expect(loadRun(store, TEST_PARTS)).toBeNull();
  });
});
