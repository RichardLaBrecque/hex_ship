import { describe, expect, it } from "vitest";
import { hex } from "../src/hex/hex";
import { placePart, type Ship } from "../src/ship/ship";
import { validateShip } from "../src/ship/validate";
import { TEST_PARTS } from "./catalog";

const build = (...parts: [number, number, Parameters<typeof placePart>[2], number][]): Ship =>
  parts.reduce<Ship>((ship, [q, r, type, rotation]) => placePart(ship, hex(q, r), type, rotation, TEST_PARTS), new Map());

describe("validateShip", () => {
  it("accepts a bridge with a rear-facing engine and a fuel tank", () => {
    const result = validateShip(build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [0, -1, "fuel", 0]), TEST_PARTS);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("rejects a ship without a bridge", () => {
    const result = validateShip(build([-1, 0, "engine", 3]), TEST_PARTS);
    expect(result.valid).toBe(false);
    expect(result.problems).toContain("Ship needs a bridge.");
  });

  it("rejects two bridges", () => {
    const result = validateShip(build([0, 0, "bridge", 0], [1, 0, "bridge", 0], [-1, 0, "engine", 3]), TEST_PARTS);
    expect(result.problems).toContain("Ship can only have one bridge.");
  });

  it("flags parts that don't connect to the bridge", () => {
    const result = validateShip(build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [3, 0, "cargo", 0]), TEST_PARTS);
    expect(result.valid).toBe(false);
    expect([...result.disconnected]).toEqual(["3,0"]);
  });

  it("follows connections through other parts", () => {
    const result = validateShip(
      build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [1, 0, "cargo", 0], [2, 0, "fuel", 0]),
      TEST_PARTS,
    );
    expect(result.disconnected.size).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("flags engines with a blocked exhaust", () => {
    const result = validateShip(
      build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [0, 1, "engine", 3], [-1, 1, "cargo", 0]),
      TEST_PARTS,
    );
    expect([...result.blockedEngines]).toEqual(["0,1"]);
    expect(result.valid).toBe(false);
  });

  it("rejects a ship with no forward thrust", () => {
    const result = validateShip(build([0, 0, "bridge", 0], [1, 0, "engine", 0]), TEST_PARTS);
    expect(result.problems).toContain("No forward thrust: add an engine with its exhaust pointing back.");
  });

  it("rejects a ship without a fuel tank", () => {
    const result = validateShip(build([0, 0, "bridge", 0], [-1, 0, "engine", 3]), TEST_PARTS);
    expect(result.problems).toEqual(["Ship needs a fuel tank."]);
  });

  it("rejects a ship that needs more crew than it can hold", () => {
    // bridge holds 2; bridge + engine + laser need 3
    const result = validateShip(build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [1, 0, "laser", 0]), TEST_PARTS);
    expect(result.problems).toContain("Needs 3 crew but only has room for 2.");
  });
});
