import { describe, expect, it } from "vitest";
import { hex } from "../src/hex/hex";
import { placePart, type Ship } from "../src/ship/ship";
import { absorbWithShields, clampShields, coveringShields, rechargeShields, shieldCapacity, totalShield } from "../src/ship/shields";
import { TEST_PARTS } from "./catalog";

const build = (...parts: [number, number, Parameters<typeof placePart>[2], number][]): Ship =>
  parts.reduce<Ship>((ship, [q, r, type, rotation]) => placePart(ship, hex(q, r), type, rotation, TEST_PARTS), new Map());

const withHp = (ship: Ship, key: string, hp: number): Ship => {
  const next = new Map(ship);
  next.set(key, { ...next.get(key)!, hp });
  return next;
};

// shield ─ bridge ─ cargo ─ cargo ─ shield in a row: each generator reaches the middle three hexes
const row = (): Ship =>
  build([-2, 0, "shield", 0], [-1, 0, "bridge", 0], [0, 0, "cargo", 0], [1, 0, "cargo", 0], [2, 0, "shield", 0]);

describe("shieldCapacity", () => {
  it("holds less in a damaged generator", () => {
    // test shield generators hold 40 at full hp (maxHp 10)
    const ship = withHp(row(), "2,0", 5);
    expect(shieldCapacity(ship, TEST_PARTS)).toEqual(new Map([["-2,0", 40], ["2,0", 20]]));
  });
});

describe("coveringShields", () => {
  it("finds generators up to two hexes from the struck part", () => {
    expect(coveringShields(row(), "0,0", 2, TEST_PARTS).sort()).toEqual(["-2,0", "2,0"]);
    expect(coveringShields(row(), "1,0", 2, TEST_PARTS)).toEqual(["2,0"]);
  });

  it("finds none out of reach", () => {
    expect(coveringShields(row(), "1,0", 1, TEST_PARTS)).toEqual(["2,0"]);
    expect(coveringShields(row(), "0,0", 1, TEST_PARTS)).toEqual([]);
  });
});

describe("absorbWithShields", () => {
  const CHARGED = new Map([["A", 10], ["B", 30]]);

  it("drains the fullest covering generator first", () => {
    const { shields, leftover } = absorbWithShields(CHARGED, ["A", "B"], 25, 1);
    expect(shields).toEqual(new Map([["A", 10], ["B", 5]]));
    expect(leftover).toBe(0);
  });

  it("moves on to the next generator and passes on what none can hold", () => {
    const { shields, leftover } = absorbWithShields(CHARGED, ["A", "B"], 45, 1);
    expect(shields).toEqual(new Map([["A", 0], ["B", 0]]));
    expect(leftover).toBe(5);
  });

  it("ignores generators that don't cover the hit", () => {
    const { shields, leftover } = absorbWithShields(CHARGED, ["A"], 15, 1);
    expect(shields).toEqual(new Map([["A", 0], ["B", 30]]));
    expect(leftover).toBe(5);
  });

  it("drains only a share of the damage when it costs less", () => {
    // 60 damage at a quarter cost would take 15 charge; A holds 10, so 40 damage is stopped and 20 gets through
    const { shields, leftover } = absorbWithShields(CHARGED, ["A"], 60, 0.25);
    expect(shields.get("A")).toBe(0);
    expect(leftover).toBe(20);
  });

  it("lets everything through with nothing covering", () => {
    expect(absorbWithShields(CHARGED, [], 9, 1).leftover).toBe(9);
  });
});

describe("rechargeShields", () => {
  it("recharges each generator by its health and the crew, up to what it holds", () => {
    // test shield generators regen 4/s at full hp; one is at half hp
    const ship = withHp(row(), "2,0", 5);
    const shields = rechargeShields(new Map([["-2,0", 39], ["2,0", 0]]), ship, 0.5, 2, TEST_PARTS);
    expect(shields).toEqual(new Map([["-2,0", 40], ["2,0", 2]]));
  });
});

describe("clampShields", () => {
  it("drops lost generators and caps damaged ones", () => {
    const ship = new Map(withHp(row(), "-2,0", 5));
    ship.delete("2,0");
    expect(clampShields(new Map([["-2,0", 40], ["2,0", 40]]), ship, TEST_PARTS)).toEqual(new Map([["-2,0", 20]]));
  });
});

describe("totalShield", () => {
  it("adds up every generator's charge", () => {
    expect(totalShield(new Map([["A", 9], ["B", 9]]))).toBe(18);
  });
});
