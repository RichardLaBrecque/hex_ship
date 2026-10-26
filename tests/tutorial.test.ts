import { describe, expect, it } from "vitest";
import { PLANETS } from "../src/data/balance";
import { PARTS } from "../src/data/parts";
import { TUTORIAL } from "../src/data/tutorial";
import { planetDistance } from "../src/economy/contracts";
import { tutorialRun } from "../src/economy/tutorial";
import { computeShipStats } from "../src/ship/stats";
import { validateShip } from "../src/ship/validate";
import { burnFuel } from "../src/sim/fuel";
import { stepBody, type Body } from "../src/sim/physics";
import { buildEnemy } from "../src/sim/spawner";
import { memoryStore } from "../src/save/store";
import { markTutorialDone, tutorialDone } from "../src/save/tutorial";

const [HAUL, HOME] = TUTORIAL.legs;

const nearestTo = (a: number): number =>
  PLANETS.map((_, b) => b)
    .filter((b) => b !== a)
    .reduce((best, b) => (planetDistance(a, b) < planetDistance(a, best) ? b : best));

const weaponsOn = (run: ReturnType<typeof tutorialRun>): string[] =>
  [...run.ship.values()].filter((p) => PARTS[p.type].weapon !== null).map((p) => p.type);

// How far one full tank flies the ship in a straight line, holding its heading.
function tankDistance(run: ReturnType<typeof tutorialRun>): number {
  const stats = computeShipStats(run.ship, run.crew);
  let body: Body = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 };
  let fuel = run.fuel;
  const dt = 1 / 60;
  while (fuel > 0) {
    const turn = Math.max(-1, Math.min(1, -body.angle * 5 - body.spin));
    body = stepBody(body, { thrust: 1, turn }, stats, dt);
    fuel = burnFuel(fuel, 1, stats.fuelBurn, dt);
  }
  return body.x;
}

describe("TUTORIAL", () => {
  it("hauls from Avalon to its nearest neighbor and flies back", () => {
    expect(PLANETS[HAUL.from].name).toBe("Avalon");
    expect(HAUL.flight.to).toBe(nearestTo(HAUL.from));
    expect(HOME.from).toBe(HAUL.flight.to);
    expect(HOME.flight.to).toBe(HAUL.from);
  });

  it("gives every leg a spaceworthy ship that flies the leg twice on one tank", () => {
    for (const leg of TUTORIAL.legs) {
      const run = tutorialRun(leg);
      expect(validateShip(run.ship).problems).toEqual([]);
      expect(tankDistance(run)).toBeGreaterThanOrEqual(2 * planetDistance(leg.from, leg.flight.to));
    }
  });

  it("sends the hauler out unarmed and without enemies", () => {
    expect(weaponsOn(tutorialRun(HAUL))).toEqual([]);
    expect(HAUL.flight.encounters).toEqual([]);
  });

  it("meets a single raider on the trip home, in a ship that can fight it", () => {
    expect(HOME.flight.encounters.flatMap((e) => e.enemies)).toEqual([1]);
    expect(weaponsOn(tutorialRun(HOME)).length).toBeGreaterThan(0);
  });

  it("builds the raider from its core alone", () => {
    const tier = HOME.flight.tiers[0];
    const ship = buildEnemy(tier, () => 0.5);
    expect(ship.size).toBe(tier.core.length);
    expect(validateShip(ship).problems).toEqual([]);
  });
});

describe("tutorialRun", () => {
  it("docks the leg's ship where the leg starts, fully crewed and fueled", () => {
    const run = tutorialRun(HAUL);
    const stats = computeShipStats(run.ship, Infinity);
    expect(run.docked).toBe(HAUL.from);
    expect(run.crew).toBe(stats.crewRequired);
    expect(run.fuel).toBe(stats.fuelCapacity);
  });

  it("loads the leg's cargo, bound for where the leg goes, and room for it", () => {
    const run = tutorialRun(HAUL);
    expect(run.cargo.map((c) => ({ units: c.units, from: c.from, to: c.to }))).toEqual([{ units: 20, from: HAUL.from, to: HAUL.flight.to }]);
    expect(computeShipStats(run.ship, Infinity).cargoCapacity).toBeGreaterThanOrEqual(20);
  });

  it("carries nothing on a leg without cargo", () => {
    expect(tutorialRun(HOME).cargo).toEqual([]);
  });
});

describe("tutorialDone", () => {
  it("is false until the tutorial is marked done", () => {
    const store = memoryStore();
    expect(tutorialDone(store)).toBe(false);
    markTutorialDone(store);
    expect(tutorialDone(store)).toBe(true);
  });
});
