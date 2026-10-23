import { describe, expect, it } from "vitest";
import { ECONOMY, PLANETS } from "../src/data/balance";
import { BOSS, bossTier, DANGER, ENEMY_TIERS } from "../src/data/enemies";
import { BUILDABLE, PARTS } from "../src/data/parts";
import { repairCost, sellValue } from "../src/economy/shop";
import { hex } from "../src/hex/hex";
import { shipValue, starterShip } from "../src/ship/ship";
import { computeShipStats } from "../src/ship/stats";
import { validateShip } from "../src/ship/validate";
import { burnFuel } from "../src/sim/fuel";
import { stepBody, thrustSpin, type Body } from "../src/sim/physics";
import { buildEnemy } from "../src/sim/spawner";
import { seeded } from "./random";

// Design rules checked against the real balance numbers. If one fails after a rebalance,
// either the numbers or the rule needs to change on purpose.
describe("balance", () => {
  it("one full tank flies the starter ship twice the distance between the planets", () => {
    const stats = computeShipStats(starterShip(), Infinity);
    const planetGap = Math.hypot(PLANETS[1].x - PLANETS[0].x, PLANETS[1].y - PLANETS[0].y);

    let body: Body = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 };
    let fuel = stats.fuelCapacity;
    const dt = 1 / 60;
    while (fuel > 0) {
      // The pilot steers to hold the heading: the starter's engines pull it slightly off a straight line.
      const turn = Math.max(-1, Math.min(1, -body.angle * 5 - body.spin));
      body = stepBody(body, { thrust: 1, turn }, stats, dt);
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

  it("one laser shoots down every other missile from a missile pod", () => {
    expect(PARTS.laser.weapon!.intercept).toBe(PARTS.missile.weapon!.fireRate / 2);
  });

  describe("contract tiers", () => {
    const tiers = ECONOMY.contractTiers;

    it("pay more per unit than the tier below", () => {
      for (let i = 1; i < tiers.length; i++) expect(tiers[i].pay.min).toBeGreaterThan(tiers[i - 1].pay.min);
    });

    it("need more units at their smallest than the tier below", () => {
      for (let i = 1; i < tiers.length; i++) expect(tiers[i].units.min).toBeGreaterThan(tiers[i - 1].units.min);
    });

    it("above tier 1 need a bigger hold than the starter ship has", () => {
      const hold = computeShipStats(starterShip(), Infinity).cargoCapacity;
      expect(tiers[0].units.max).toBeLessThanOrEqual(hold);
      for (const tier of tiers.slice(1)) expect(tier.units.min).toBeGreaterThan(hold);
    });
  });

  describe("tier-1 enemies", () => {
    const enemies = Array.from({ length: 200 }, (_, i) => buildEnemy(ENEMY_TIERS[0], seeded(i + 1)));

    it("are spaceworthy by the same rules as the player's ship", () => {
      for (const ship of enemies) expect(validateShip(ship).problems).toEqual([]);
    });

    it("are worth within 15% of the starter ship", () => {
      const starter = shipValue(starterShip());
      for (const ship of enemies) {
        expect(shipValue(ship)).toBeGreaterThanOrEqual(starter * 0.85);
        expect(shipValue(ship)).toBeLessThanOrEqual(starter * 1.15);
      }
    });

    it("carry only projectile weapons", () => {
      for (const ship of enemies) {
        for (const part of ship.values()) {
          const weapon = PARTS[part.type].weapon;
          if (weapon) expect(weapon.kind).toBe("shell");
        }
      }
    });
  });

  describe.each(ENEMY_TIERS.map((tier, i) => ({ tier, level: i + 1 })))("tier-$level enemies ($tier.name)", ({ tier }) => {
    const enemies = Array.from({ length: 200 }, (_, i) => buildEnemy(tier, seeded(i + 1)));

    it("are spaceworthy by the same rules as the player's ship", () => {
      for (const ship of enemies) expect(validateShip(ship).problems).toEqual([]);
    });

    it("drift-turn under 10°/s from lopsided engines, so the AI can still aim", () => {
      const limit = (10 * Math.PI) / 180;
      for (const ship of enemies) {
        const stats = computeShipStats(ship, Infinity);
        expect(Math.abs(thrustSpin(stats, stats.main))).toBeLessThan(limit);
        expect(Math.abs(thrustSpin(stats, stats.brake))).toBeLessThan(limit);
      }
    });

    it("stay within 15% under their budget and never go over", () => {
      for (const ship of enemies) {
        expect(shipValue(ship)).toBeGreaterThanOrEqual(tier.budget.min * 0.85);
        expect(shipValue(ship)).toBeLessThanOrEqual(tier.budget.max);
      }
    });
  });

  // A ship just into top danger, and one far past it.
  describe.each([3200, 8000])("bosses against a $%i ship", (playerValue) => {
    const tier = bossTier(playerValue);
    const bosses = Array.from({ length: 50 }, (_, i) => buildEnemy(tier, seeded(i + 1)));

    it("are spaceworthy by the same rules as the player's ship", () => {
      for (const ship of bosses) expect(validateShip(ship).problems).toEqual([]);
    });

    it("stay within 15% under valueShare of the player's ship and never go over", () => {
      const budget = playerValue * DANGER.boss.valueShare;
      for (const ship of bosses) {
        expect(shipValue(ship)).toBeGreaterThanOrEqual(budget * 0.85);
        expect(shipValue(ship)).toBeLessThanOrEqual(budget);
      }
    });
  });

  it("the boss outclasses the top regular enemy tier and aims better", () => {
    expect(BOSS.aimError).toBeLessThan(ENEMY_TIERS[ENEMY_TIERS.length - 1].aimError);
    expect(DANGER.valueCheckpoints[DANGER.valueCheckpoints.length - 1]).toBeGreaterThan(ENEMY_TIERS[ENEMY_TIERS.length - 1].budget.max);
  });

  it("each enemy tier costs more and aims better than the one below", () => {
    for (let i = 1; i < ENEMY_TIERS.length; i++) {
      expect(ENEMY_TIERS[i].budget.min).toBeGreaterThan(ENEMY_TIERS[i - 1].budget.max);
      expect(ENEMY_TIERS[i].aimError).toBeLessThan(ENEMY_TIERS[i - 1].aimError);
    }
  });

  it("every danger level only sends enemy tiers that exist", () => {
    for (const level of DANGER.levels) {
      for (const encounter of level) {
        for (const tier of encounter.enemies) expect(ENEMY_TIERS[tier - 1]).toBeDefined();
      }
    }
    expect(DANGER.levels).toHaveLength(DANGER.valueCheckpoints.length + 1);
  });
});
