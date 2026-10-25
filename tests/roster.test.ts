import { describe, expect, it } from "vitest";
import { bossDefeated, encounterSlots, fillSlots, vacate, type Slot } from "../src/sim/roster";

const ENC = { spawnDistance: 100, spawnSpread: 60, despawnDistance: 999, respawnDelay: 9, respawnDistance: 200 };

const slot = (overrides: Partial<Slot> = {}): Slot => ({ level: 1, filled: true, wait: 0, done: false, ...overrides });

describe("encounterSlots", () => {
  it("adds a filled slot for each enemy, then the boss", () => {
    expect(encounterSlots({ at: 0.5, enemies: [1, 3], boss: true }).map((s) => [s.level, s.filled])).toEqual([
      [1, true],
      [3, true],
      ["boss", true],
    ]);
  });
});

describe("vacate", () => {
  it("empties the slot until respawnDelay passes, whether the enemy was destroyed or escaped", () => {
    expect(vacate(slot(), true, ENC)).toEqual(slot({ filled: false, wait: 9 }));
    expect(vacate(slot(), false, ENC)).toEqual(slot({ filled: false, wait: 9 }));
  });

  it("never refills the boss's slot once the boss is destroyed", () => {
    expect(vacate(slot({ level: "boss" }), true, ENC)).toEqual(slot({ level: "boss", filled: false, done: true }));
  });
});

describe("fillSlots", () => {
  it("counts down an empty slot", () => {
    const { slots, due } = fillSlots([slot({ filled: false, wait: 9 })], 4);
    expect(slots).toEqual([slot({ filled: false, wait: 5 })]);
    expect(due).toEqual([]);
  });

  it("fills a slot whose wait is over and reports it", () => {
    const { slots, due } = fillSlots([slot(), slot({ filled: false, wait: 1 })], 2);
    expect(slots).toEqual([slot(), slot()]);
    expect(due).toEqual([1]);
  });

  it("leaves a destroyed boss's slot empty", () => {
    const done = slot({ level: "boss", filled: false, done: true });
    expect(fillSlots([done], 99)).toEqual({ slots: [done], due: [] });
  });
});

describe("bossDefeated", () => {
  it("is true only once the boss's slot is done", () => {
    expect(bossDefeated([slot(), slot({ level: "boss" })])).toBe(false);
    expect(bossDefeated([slot(), slot({ level: "boss", filled: false, done: true })])).toBe(true);
  });
});
