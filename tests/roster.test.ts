import { describe, expect, it } from "vitest";
import { activeLevels, bossDefeated, fillSlots, retarget, vacate, type Slot } from "../src/sim/roster";

const ENC = { spawnDistance: 100, spawnSpread: 60, despawnDistance: 999, respawnDelay: 9, respawnDistance: 200 };

const slot = (overrides: Partial<Slot> = {}): Slot => ({ level: 1, filled: true, wait: 0, done: false, retired: false, ...overrides });

describe("activeLevels", () => {
  const ENCOUNTERS = [
    { at: 0.3, enemies: [1] },
    { at: 0.6, enemies: [2, 3], boss: true },
  ];

  it("lists the enemies of every encounter triggered so far, then the boss", () => {
    expect(activeLevels(ENCOUNTERS, 0.1)).toEqual([]);
    expect(activeLevels(ENCOUNTERS, 0.3)).toEqual([1]);
    expect(activeLevels(ENCOUNTERS, 0.9)).toEqual([1, 2, 3, "boss"]);
  });
});

describe("retarget", () => {
  it("adds a filled slot for each level wanted that has none", () => {
    const { slots, added } = retarget([slot({ level: 1 })], [1, 2, 2]);
    expect(slots).toEqual([slot({ level: 1 }), slot({ level: 2 }), slot({ level: 2 })]);
    expect(added).toEqual([1, 2]);
  });

  it("keeps a wanted slot as it is, even while it waits to refill", () => {
    const waiting = slot({ filled: false, wait: 4 });
    expect(retarget([waiting], [1])).toEqual({ slots: [waiting], added: [] });
  });

  it("keeps a destroyed boss's slot, so the boss isn't sent again", () => {
    const beaten = slot({ level: "boss", filled: false, done: true });
    expect(retarget([beaten], ["boss"])).toEqual({ slots: [beaten], added: [] });
  });

  it("retires slots no longer wanted and leaves them where they are", () => {
    // danger rose: two raiders become a raider and a gunship
    const { slots, added } = retarget([slot({ level: 1 }), slot({ level: 1 })], [1, 2]);
    expect(slots).toEqual([slot({ level: 1 }), slot({ level: 1, retired: true }), slot({ level: 2 })]);
    expect(added).toEqual([2]);
  });

  it("doesn't count retired slots toward what's wanted", () => {
    const { slots, added } = retarget([slot({ level: 1, retired: true })], [1]);
    expect(slots).toEqual([slot({ level: 1, retired: true }), slot({ level: 1 })]);
    expect(added).toEqual([1]);
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

  it("never refills a retired slot", () => {
    const retired = slot({ filled: false, wait: 1, retired: true });
    expect(fillSlots([retired], 99)).toEqual({ slots: [retired], due: [] });
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
