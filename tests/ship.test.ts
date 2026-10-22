import { describe, expect, it } from "vitest";
import { hex } from "../src/hex/hex";
import { centerOfMass, partAt, placePart, rotatePart, type Ship } from "../src/ship/ship";
import { TEST_PARTS } from "./catalog";

describe("rotatePart", () => {
  const damagedEngine = (): Ship => {
    const ship = placePart(new Map(), hex(-1, 0), "engine", 3, TEST_PARTS);
    return new Map([["-1,0", { ...partAt(ship, hex(-1, 0))!, hp: 7 }]]);
  };

  it("turns the part clockwise and wraps past 5", () => {
    const ship = rotatePart(damagedEngine(), hex(-1, 0), 3);
    expect(partAt(ship, hex(-1, 0))!.rotation).toBe(0);
  });

  it("turns anticlockwise with negative steps", () => {
    const ship = rotatePart(damagedEngine(), hex(-1, 0), -1);
    expect(partAt(ship, hex(-1, 0))!.rotation).toBe(2);
  });

  it("keeps the part's current hp", () => {
    const ship = rotatePart(damagedEngine(), hex(-1, 0), 1);
    expect(partAt(ship, hex(-1, 0))!.hp).toBe(7);
  });

  it("leaves the ship unchanged for an empty hex", () => {
    const ship = damagedEngine();
    expect(rotatePart(ship, hex(5, 5), 1)).toBe(ship);
  });
});

describe("centerOfMass", () => {
  it("weights each hex's position by its part's mass", () => {
    // bridge (mass 10) at 0,0 and armor (mass 20) at 1,0, which sits 10 × √3 px to the right
    let ship: Ship = placePart(new Map(), hex(0, 0), "bridge", 0, TEST_PARTS);
    ship = placePart(ship, hex(1, 0), "armor", 0, TEST_PARTS);
    const result = centerOfMass(ship, 10, TEST_PARTS);
    expect(result.x).toBeCloseTo((20 * 10 * Math.sqrt(3)) / 30);
    expect(result.y).toBeCloseTo(0);
  });

  it("is the origin for an empty ship", () => {
    expect(centerOfMass(new Map(), 10, TEST_PARTS)).toEqual({ x: 0, y: 0 });
  });
});
