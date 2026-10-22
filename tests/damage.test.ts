import { describe, expect, it } from "vitest";
import { hex } from "../src/hex/hex";
import { partAt, placePart, type Ship } from "../src/ship/ship";
import { absorbWithShield, damagePart, repairShip } from "../src/ship/damage";
import { TEST_PARTS } from "./catalog";

const build = (...parts: [number, number, Parameters<typeof placePart>[2], number][]): Ship =>
  parts.reduce<Ship>((ship, [q, r, type, rotation]) => placePart(ship, hex(q, r), type, rotation, TEST_PARTS), new Map());

const withHp = (ship: Ship, q: number, r: number, hp: number): Ship => {
  const next = new Map(ship);
  const key = `${q},${r}`;
  next.set(key, { ...next.get(key)!, hp });
  return next;
};

// bridge ─ armor ─ cargo in a row, plus fuel above the bridge
const chain = (): Ship => build([0, 0, "bridge", 0], [1, 0, "armor", 0], [2, 0, "cargo", 0], [0, -1, "fuel", 0]);

describe("damagePart", () => {
  it("takes hp off the part that was hit", () => {
    const result = damagePart(chain(), "1,0", 30);
    expect(partAt(result.ship, hex(1, 0))!.hp).toBe(70);
    expect(result.destroyed).toBeNull();
    expect(result.detached).toEqual([]);
  });

  it("destroys a part that drops to 0 hp", () => {
    const result = damagePart(chain(), "0,-1", 10);
    expect(result.ship.has("0,-1")).toBe(false);
    expect(result.destroyed?.type).toBe("fuel");
  });

  it("breaks off parts cut away from the bridge", () => {
    const result = damagePart(chain(), "1,0", 999);
    expect(result.detached.map((p) => p.type)).toEqual(["cargo"]);
    expect([...result.ship.keys()].sort()).toEqual(["0,-1", "0,0"]);
  });

  it("breaks the whole ship apart when the bridge goes", () => {
    const result = damagePart(chain(), "0,0", 50);
    expect(result.ship.size).toBe(0);
    expect(result.detached).toHaveLength(3);
  });

  it("leaves the ship alone for an empty hex", () => {
    const ship = chain();
    expect(damagePart(ship, "5,5", 10).ship).toBe(ship);
  });
});

describe("absorbWithShield", () => {
  it("lets nothing through while the shield holds", () => {
    expect(absorbWithShield(20, 5)).toEqual({ shield: 15, leftover: 0 });
  });

  it("passes on what the shield can't hold", () => {
    expect(absorbWithShield(3, 5)).toEqual({ shield: 0, leftover: 2 });
  });
});

describe("repairShip", () => {
  it("shares the repair evenly across damaged parts", () => {
    const ship = repairShip(withHp(withHp(chain(), 0, 0, 40), 1, 0, 90), 4, TEST_PARTS);
    expect(partAt(ship, hex(0, 0))!.hp).toBe(42);
    expect(partAt(ship, hex(1, 0))!.hp).toBe(92);
  });

  it("never repairs past full hp", () => {
    const ship = repairShip(withHp(chain(), 0, 0, 49), 10, TEST_PARTS);
    expect(partAt(ship, hex(0, 0))!.hp).toBe(50);
  });

  it("returns the same ship when nothing is damaged", () => {
    const ship = chain();
    expect(repairShip(ship, 10, TEST_PARTS)).toBe(ship);
  });
});
