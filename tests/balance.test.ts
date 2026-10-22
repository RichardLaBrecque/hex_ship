import { describe, expect, it } from "vitest";
import { PLANETS } from "../src/data/balance";
import { BUILDABLE, PARTS } from "../src/data/parts";
import { repairCost, sellValue } from "../src/economy/shop";
import { hex } from "../src/hex/hex";
import { starterShip } from "../src/ship/ship";
import { computeShipStats } from "../src/ship/stats";
import { burnFuel } from "../src/sim/fuel";
import { stepBody, type Body } from "../src/sim/physics";

// Design rules checked against the real balance numbers. If one fails after a rebalance,
// either the numbers or the rule needs to change on purpose.
describe("balance", () => {
  it("one full tank flies the starter ship twice the distance between the planets", () => {
    const stats = computeShipStats(starterShip(), Infinity);
    const planetGap = Math.hypot(PLANETS[1].x - PLANETS[0].x, PLANETS[1].y - PLANETS[0].y);

    let body: Body = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
    let fuel = stats.fuelCapacity;
    const dt = 1 / 60;
    while (fuel > 0) {
      body = stepBody(body, { thrust: 1, turn: 0 }, stats, dt);
      fuel = burnFuel(fuel, 1, stats.fuelBurn, dt);
    }

    expect(body.x).toBeGreaterThanOrEqual(2 * planetGap);
  });

  it("repairing a damaged part is cheaper than selling it and buying a new one", () => {
    for (const type of BUILDABLE) {
      const def = PARTS[type];
      for (let hp = 1; hp < def.maxHp; hp++) {
        const part = { hex: hex(0, 0), type, rotation: 0, hp };
        const replace = def.cost - sellValue(part);
        expect(repairCost(new Map([["0,0", part]])), `${type} at ${hp} hp`).toBeLessThan(replace);
      }
    }
  });

});
