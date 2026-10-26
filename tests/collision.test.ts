import { describe, expect, it } from "vitest";
import { COMBAT } from "../src/data/balance";
import { hex } from "../src/hex/hex";
import { placePart, type Ship } from "../src/ship/ship";
import { bounce, findContact, ramDamage } from "../src/sim/collision";
import type { Body } from "../src/sim/physics";
import { makeVessel, type Vessel } from "../src/sim/vessel";
import { TEST_PARTS } from "./catalog";

const SIZE = 10;
const HEX_WIDTH = SIZE * Math.sqrt(3); // pixels between neighboring hex centers in a row

const build = (...parts: [number, number, Parameters<typeof placePart>[2], number][]): Ship =>
  parts.reduce<Ship>((ship, [q, r, type, rotation]) => placePart(ship, hex(q, r), type, rotation, TEST_PARTS), new Map());

const moving = (x: number, y: number, vx = 0, vy = 0): Body => ({ x, y, vx, vy, angle: 0, spin: 0 });

const vessel = (ship: Ship, body: Body): Vessel => makeVessel("enemy", ship, body, 9, SIZE, TEST_PARTS);

// One bridge hex of mass 10: its pivot is its own center, so world position = body position.
const dot = (body: Body): Vessel => vessel(build([0, 0, "bridge", 0]), body);

describe("findContact", () => {
  it("finds two parts closer than neighboring hexes", () => {
    const contact = findContact(dot(moving(0, 0)), dot(moving(10, 0)), SIZE)!;
    expect(contact.aKey).toBe("0,0");
    expect(contact.bKey).toBe("0,0");
    expect(contact.depth).toBeCloseTo(HEX_WIDTH - 10);
    expect(contact.normal.x).toBeCloseTo(1);
    expect(contact.normal.y).toBeCloseTo(0);
    expect(contact.point.x).toBeCloseTo(5);
  });

  it("finds nothing between ships a hex apart or more", () => {
    expect(findContact(dot(moving(0, 0)), dot(moving(HEX_WIDTH, 0)), SIZE)).toBeNull();
  });

  it("picks the pair of parts that overlap the most", () => {
    // bridge (mass 10) with armor (mass 20) one hex right: the pivot sits 2/3 of the way to the armor,
    // so the armor is a third of a hex right of the body and the bridge two thirds left.
    const a = vessel(build([0, 0, "bridge", 0], [1, 0, "armor", 0]), moving(0, 0));
    const b = dot(moving(HEX_WIDTH / 3 + 5, 0));
    const contact = findContact(a, b, SIZE)!;
    expect(contact.aKey).toBe("1,0");
    expect(contact.depth).toBeCloseTo(HEX_WIDTH - 5);
  });
});

describe("bounce", () => {
  it("sends equal ships back apart at the bounce share of their speed", () => {
    const a = dot(moving(0, 0, 50, 0));
    const b = dot(moving(10, 0, -50, 0));
    const closing = bounce(a, b, findContact(a, b, SIZE)!, { ...COMBAT, ramBounce: 0.5 });
    expect(closing).toBeCloseTo(100);
    expect(a.body.vx).toBeCloseTo(-25);
    expect(b.body.vx).toBeCloseTo(25);
  });

  it("pushes equal ships apart by half the overlap each", () => {
    const a = dot(moving(0, 0));
    const b = dot(moving(10, 0));
    bounce(a, b, findContact(a, b, SIZE)!);
    expect(a.body.x).toBeCloseTo(-(HEX_WIDTH - 10) / 2);
    expect(b.body.x).toBeCloseTo(10 + (HEX_WIDTH - 10) / 2);
  });

  it("keeps momentum when ships stick together", () => {
    // mass 30 at 40 px/s into mass 10 at rest: 1200 momentum over 40 mass is 30 px/s for both
    const a = vessel(build([0, 0, "bridge", 0], [1, 0, "armor", 0]), moving(0, 0, 40, 0));
    const b = dot(moving(HEX_WIDTH / 3 + 10, 0));
    bounce(a, b, findContact(a, b, SIZE)!, { ...COMBAT, ramBounce: 0 });
    expect(a.body.vx).toBeCloseTo(30);
    expect(b.body.vx).toBeCloseTo(30);
  });

  it("leaves ships already moving apart at their speeds", () => {
    const a = dot(moving(0, 0, -20, 0));
    const b = dot(moving(10, 0, 20, 0));
    expect(bounce(a, b, findContact(a, b, SIZE)!)).toBe(0);
    expect(a.body.vx).toBe(-20);
    expect(b.body.vx).toBe(20);
  });
});

describe("ramDamage", () => {
  const tuning = { ...COMBAT, ramSafeSpeed: 50, ramDamage: 0.5 };

  it("does nothing at or below the safe speed", () => {
    expect(ramDamage(50, tuning)).toBe(0);
  });

  it("grows with the closing speed above the safe speed", () => {
    expect(ramDamage(90, tuning)).toBe(20);
  });
});
