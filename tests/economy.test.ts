import { describe, expect, it } from "vitest";
import type { Economy, Planet } from "../src/data/balance";
import { dumpContract, generateOffers, loadContract, reputation, unloadContract, type Contract } from "../src/economy/contracts";
import { fireCrew, hireCrew, hiringFees } from "../src/economy/crew";
import { afterFlight, arrive, bountyFor, launch, launchCost, launchProblems, towBack, type Outcome, type Run, type TripResult } from "../src/economy/run";
import { buyPart, repairAll, repairCost, sellPart, sellValue } from "../src/economy/shop";
import { hex } from "../src/hex/hex";
import { partAt, placePart, type Ship } from "../src/ship/ship";
import { TEST_PARTS } from "./catalog";

const TEST_ECONOMY: Economy = {
  startingMoney: 0,
  startingCrew: 0,
  repairShare: 0.5,
  bridgeRepairPerHp: 3,
  crewHireCost: 40,
  crewWage: 10,
  fuelPrice: 2,
  towFee: 100,
  offersPerStation: 2,
  payBonusPerDelivery: 0.1,
  topTierShare: 0.5,
  openShare: 0.5,
  openPayShare: 0.5,
  dumpPenaltyShare: 0.1,
  dumpReputationLoss: 3,
  payDistance: 1000,
  contractTiers: [
    { rank: "LOW", unlockAt: 0, units: { min: 1, max: 10 }, pay: { min: 10, max: 20 } },
    { rank: "HIGH", unlockAt: 3, units: { min: 20, max: 30 }, pay: { min: 50, max: 60 } },
  ],
  bountyShare: 0.5,
};

// bridge (2 berths) + rear engine + cargo bay (10 units) + fuel tank (30 units). Needs 2 crew.
function testShip(): Ship {
  let ship: Ship = placePart(new Map(), hex(0, 0), "bridge", 0, TEST_PARTS);
  ship = placePart(ship, hex(-1, 0), "engine", 3, TEST_PARTS);
  ship = placePart(ship, hex(0, -1), "fuel", 0, TEST_PARTS);
  return placePart(ship, hex(0, 1), "cargo", 0, TEST_PARTS);
}

// Loaded at planet 0 and bound for planet 1 unless a route is given.
const CONTRACT = (id: string, units: number, payPerUnit = 10, route: Pick<Contract, "from" | "to"> = { from: 0, to: 1 }): Contract => ({
  id,
  cargo: "ORE",
  units,
  payPerUnit,
  tier: 0,
  ...route,
});

// Three planets in a row: planet 1 is 1000 px from planet 0 (one payDistance), planet 2 is 3000 px.
const planet = (x: number): Planet => ({ name: `P${x}`, x, y: 0, radius: 1, dockRadius: 1, color: "#000" });
const TEST_PLANETS: readonly Planet[] = [planet(0), planet(1000), planet(3000)];

// A trip at danger 1 that changed nothing: no fuel burned, no damage, no kills.
const quietTrip = (run: Run): TripResult => ({ fuel: run.fuel, ship: run.ship, bounty: 0, kills: 0, danger: 1, boss: false, bossKilled: false });

const NO_BOSS = { every: 3, valueShare: 1, encounters: [] };

function testRun(overrides: Partial<Run> = {}): Run {
  return {
    money: 1000,
    day: 1,
    ship: testShip(),
    crew: 2,
    crewSigned: 2,
    fuel: 30,
    docked: 0,
    offers: [],
    cargo: [],
    delivered: 0,
    kills: 0,
    valueTier: 1,
    topTrips: 0,
    peakShipValue: 0,
    cargoEarned: 0,
    bountiesEarned: 0,
    ...overrides,
  };
}

function ok(outcome: Outcome): Run {
  if (!outcome.ok) throw new Error(`expected success, got: ${outcome.reason}`);
  return outcome.run;
}

function reason(outcome: Outcome): string {
  if (outcome.ok) throw new Error("expected failure");
  return outcome.reason;
}

// Returns each value in turn, forever.
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("buyPart", () => {
  it("charges the part's price", () => {
    const run = ok(buyPart(testRun(), hex(1, 0), "laser", 0, TEST_PARTS));
    expect(run.money).toBe(900);
    expect(partAt(run.ship, hex(1, 0))?.type).toBe("laser");
  });

  it("refuses when you can't afford it", () => {
    expect(reason(buyPart(testRun({ money: 99 }), hex(1, 0), "laser", 0, TEST_PARTS))).toBe("LASER costs $100.");
  });

  it("sells the part it replaces first", () => {
    // cargo bay (cost 10) refunds 10, laser costs 100
    const run = ok(buyPart(testRun({ money: 90 }), hex(0, 1), "laser", 0, TEST_PARTS));
    expect(run.money).toBe(0);
  });

  it("turns a part of the same type for free", () => {
    const run = ok(buyPart(testRun(), hex(-1, 0), "engine", 2, TEST_PARTS));
    expect(run.money).toBe(1000);
    expect(partAt(run.ship, hex(-1, 0))?.rotation).toBe(2);
  });

  it("won't replace the bridge", () => {
    expect(reason(buyPart(testRun(), hex(0, 0), "armor", 0, TEST_PARTS))).toBe("The bridge can't be replaced.");
  });
});

describe("sellPart", () => {
  it("refunds the full price of an undamaged part", () => {
    const run = ok(sellPart(testRun(), hex(-1, 0), TEST_PARTS));
    expect(run.money).toBe(1100);
    expect(partAt(run.ship, hex(-1, 0))).toBeUndefined();
  });

  it("gives all the money back for a part bought and sold before launch", () => {
    const bought = ok(buyPart(testRun(), hex(1, 0), "laser", 0, TEST_PARTS));
    expect(ok(sellPart(bought, hex(1, 0), TEST_PARTS)).money).toBe(1000);
  });

  it("won't sell the bridge", () => {
    expect(reason(sellPart(testRun(), hex(0, 0), TEST_PARTS))).toBe("The bridge can't be sold.");
  });
});

describe("sellValue", () => {
  it("drops with damage", () => {
    // engine: cost 100, max hp 20, at 5 hp → a quarter of its price
    expect(sellValue({ hex: hex(0, 0), type: "engine", rotation: 3, hp: 5 }, TEST_PARTS)).toBe(25);
  });
});

describe("repairs", () => {
  const damaged = (): Run => {
    const ship = new Map(testShip());
    ship.set("0,0", { ...ship.get("0,0")!, hp: 40 }); // bridge missing 10
    ship.set("-1,0", { ...ship.get("-1,0")!, hp: 15 }); // engine missing 5
    return testRun({ ship });
  };

  it("cost half the value the damage took off, plus the bridge's flat rate", () => {
    // engine: $100 part missing a quarter of its hp → 25 × 0.5 = 12.5; bridge: 10 hp × $3 = 30
    expect(repairCost(damaged().ship, TEST_PARTS, TEST_ECONOMY)).toBe(42);
  });

  it("restore every part to full and charge for it", () => {
    const run = ok(repairAll(damaged(), TEST_PARTS, TEST_ECONOMY));
    expect(run.money).toBe(958);
    expect(partAt(run.ship, hex(0, 0))?.hp).toBe(50);
    expect(partAt(run.ship, hex(-1, 0))?.hp).toBe(20);
  });

  it("fix a scratch too small to charge for", () => {
    const ship = new Map(testShip());
    ship.set("0,1", { ...ship.get("0,1")!, hp: 9.9 }); // $10 cargo bay
    const run = ok(repairAll(testRun({ ship }), TEST_PARTS, TEST_ECONOMY));
    expect(run.money).toBe(1000);
    expect(partAt(run.ship, hex(0, 1))?.hp).toBe(10);
  });

  it("refuse when nothing is damaged", () => {
    expect(reason(repairAll(testRun(), TEST_PARTS, TEST_ECONOMY))).toBe("Nothing needs repairing.");
  });
});

describe("bountyFor", () => {
  it("pays the bounty share of the enemy's part value", () => {
    // engine $100 + fuel $20 + cargo $10 = $130, half of it
    expect(bountyFor(testShip(), TEST_PARTS, TEST_ECONOMY)).toBe(65);
  });
});

describe("afterFlight", () => {
  it("keeps the fuel left and the damage taken, pays the bounties and counts the kills", () => {
    const ship = placePart(new Map(), hex(0, 0), "bridge", 0, TEST_PARTS);
    const run = afterFlight(testRun({ kills: 9, bountiesEarned: 9 }), { fuel: 9, ship, bounty: 99, kills: 2, danger: 1, boss: false, bossKilled: false });
    expect(run.fuel).toBe(9);
    expect(run.ship).toBe(ship);
    expect(run.money).toBe(1099);
    expect(run.bountiesEarned).toBe(108);
    expect(run.kills).toBe(11);
  });
});

describe("crew", () => {
  it("hiring adds to the roster without charging yet", () => {
    const ship = placePart(testShip(), hex(1, 0), "crew", 0, TEST_PARTS);
    const run = ok(hireCrew(testRun({ ship }), TEST_PARTS));
    expect(run.crew).toBe(3);
    expect(run.money).toBe(1000);
  });

  it("hiring works with no money", () => {
    const ship = placePart(testShip(), hex(1, 0), "crew", 0, TEST_PARTS);
    expect(ok(hireCrew(testRun({ ship, money: 0 }), TEST_PARTS)).crew).toBe(3);
  });

  it("hiring needs a free berth", () => {
    expect(reason(hireCrew(testRun(), TEST_PARTS))).toBe("No free berths. Add a crew module.");
  });

  it("signing fees cover only crew beyond those already signed", () => {
    expect(hiringFees(testRun({ crew: 5, crewSigned: 2 }), TEST_ECONOMY)).toBe(120);
  });

  it("re-hiring someone fired at the same station costs nothing", () => {
    expect(hiringFees(testRun({ crew: 2, crewSigned: 2 }), TEST_ECONOMY)).toBe(0);
    expect(hiringFees(testRun({ crew: 1, crewSigned: 2 }), TEST_ECONOMY)).toBe(0);
  });

  it("firing gives nothing back", () => {
    const run = ok(fireCrew(testRun()));
    expect(run.crew).toBe(1);
    expect(run.money).toBe(1000);
  });
});

describe("contracts", () => {
  it("loading moves a contract from the board into the hold", () => {
    const run = ok(loadContract(testRun({ offers: [CONTRACT("A", 4), CONTRACT("B", 3)] }), "A", TEST_PARTS));
    expect(run.cargo.map((c) => c.id)).toEqual(["A"]);
    expect(run.offers.map((c) => c.id)).toEqual(["B"]);
  });

  it("loading needs enough free space", () => {
    const run = testRun({ cargo: [CONTRACT("A", 8)], offers: [CONTRACT("B", 3)] });
    expect(reason(loadContract(run, "B", TEST_PARTS))).toBe("Needs 3 units of space, only 2 free.");
  });

  it("unloading puts it back on the board", () => {
    const run = ok(unloadContract(testRun({ cargo: [CONTRACT("A", 4)] }), "A"));
    expect(run.cargo).toEqual([]);
    expect(run.offers.map((c) => c.id)).toEqual(["A"]);
  });

  it("dumps cargo loaded at another planet for 10% of its pay and 3 deliveries of reputation", () => {
    // 4 × $25 = $100 → $10 penalty
    const run = ok(dumpContract(testRun({ docked: 0, delivered: 7, cargo: [CONTRACT("A", 4, 25, { from: 2, to: 1 })] }), "A", TEST_ECONOMY));
    expect(run.cargo).toEqual([]);
    expect(run.offers).toEqual([]);
    expect(run.money).toBe(990);
    expect(run.delivered).toBe(4);
  });

  it("rounds the dump penalty up and never takes reputation below zero", () => {
    // 3 × $7 = $21 → $2.10 → $3
    const run = ok(dumpContract(testRun({ docked: 0, delivered: 1, cargo: [CONTRACT("A", 3, 7, { from: 2, to: null })] }), "A", TEST_ECONOMY));
    expect(run.money).toBe(997);
    expect(run.delivered).toBe(0);
  });

  it("dumps even into debt", () => {
    const run = ok(dumpContract(testRun({ money: 5, docked: 0, cargo: [CONTRACT("A", 4, 25, { from: 2, to: 1 })] }), "A", TEST_ECONOMY));
    expect(run.money).toBe(-5);
  });

  it("won't dump cargo loaded here, which goes back on the board for free", () => {
    const run = testRun({ docked: 0, cargo: [CONTRACT("A", 4)] });
    expect(reason(dumpContract(run, "A", TEST_ECONOMY))).toBe("Cargo loaded here goes back on the board for free.");
  });

  it("can't unload cargo loaded at another planet", () => {
    const run = testRun({ docked: 0, cargo: [CONTRACT("A", 4, 10, { from: 2, to: 1 })] });
    expect(reason(unloadContract(run, "A", TEST_PLANETS))).toBe("That cargo was loaded at P3000. It stays aboard until you reach P1000.");
  });

});

describe("generateOffers", () => {
  // Rolls in order: tier, cargo, units, pay, open (under openShare is open), then which other planet.
  it("offers only the first tier to a newcomer", () => {
    // tier roll 0 → top unlocked tier; cargo 0; units 1 + floor(0.5 × 10) = 6; pay 10 + floor(0.5 × 11) = 15;
    // not open; first other planet, one payDistance away
    const [offer] = generateOffers(3, 0, 0, sequence(0, 0, 0.5, 0.5, 0.9, 0), TEST_ECONOMY, TEST_PLANETS);
    expect(offer).toEqual({ id: "3-0", cargo: "Medical supplies", units: 6, payPerUnit: 15, tier: 0, from: 0, to: 1 });
  });

  it("raises pay by the reputation bonus for every contract delivered", () => {
    // 2 delivered × 10% = +20%: 15 → 18
    const [offer] = generateOffers(3, 2, 0, sequence(0, 0, 0.5, 0.5, 0.9, 0), TEST_ECONOMY, TEST_PLANETS);
    expect(offer.payPerUnit).toBe(18);
  });

  it("offers the best unlocked tier when the tier roll is under topTierShare", () => {
    // 3 delivered unlocks HIGH; units 20 + floor(0 × 11) = 20; pay 50 × 1.3 = 65
    const [offer] = generateOffers(3, 3, 0, sequence(0.4, 0, 0, 0, 0.9, 0), TEST_ECONOMY, TEST_PLANETS);
    expect(offer).toMatchObject({ units: 20, payPerUnit: 65, tier: 1 });
  });

  it("can still offer a lower tier once higher ones are unlocked", () => {
    // tier roll 0.6 misses the top-tier chance; then 0.4 × 2 unlocked tiers → tier 0
    const [offer] = generateOffers(3, 3, 0, sequence(0.6, 0.4, 0, 0, 0, 0.9, 0), TEST_ECONOMY, TEST_PLANETS);
    expect(offer.tier).toBe(0);
  });

  it("pays more per unit the farther the cargo goes", () => {
    // pay 15; the second other planet is 3000 px away: 3 payDistances → 45
    const [offer] = generateOffers(3, 0, 0, sequence(0, 0, 0.5, 0.5, 0.9, 0.5), TEST_ECONOMY, TEST_PLANETS);
    expect(offer).toMatchObject({ to: 2, payPerUnit: 45 });
  });

  it("offers open contracts at a share of the tier's pay, wherever they go", () => {
    // pay 10 + floor(0 × 11) = 10; open roll 0.1 is under openShare; 10 × openPayShare 0.5 = 5
    const [offer] = generateOffers(3, 0, 0, sequence(0, 0, 0.5, 0, 0.1), TEST_ECONOMY, TEST_PLANETS);
    expect(offer).toMatchObject({ from: 0, to: null, payPerUnit: 5 });
  });

  it("never sends cargo to the planet it's offered at", () => {
    // docked at planet 1: the first other planet is planet 0
    const [offer] = generateOffers(3, 0, 1, sequence(0, 0, 0.5, 0.5, 0.9, 0), TEST_ECONOMY, TEST_PLANETS);
    expect(offer).toMatchObject({ from: 1, to: 0 });
  });
});

describe("reputation", () => {
  it("starts at the first rank with the next one to earn", () => {
    expect(reputation(0, TEST_ECONOMY)).toEqual({ rank: "LOW", payBonus: 0, next: { rank: "HIGH", at: 3 } });
  });

  it("reaches the top rank with nothing left to earn", () => {
    const rep = reputation(4, TEST_ECONOMY);
    expect(rep.rank).toBe("HIGH");
    expect(rep.payBonus).toBeCloseTo(0.4);
    expect(rep.next).toBeNull();
  });
});

describe("launch", () => {
  it("costs the crew's wages", () => {
    expect(launchCost(testRun(), TEST_ECONOMY)).toBe(20);
  });

  it("takes the wages from your money and leaves fuel alone", () => {
    const run = ok(launch(testRun(), TEST_PARTS, TEST_ECONOMY));
    expect(run.money).toBe(980);
    expect(run.fuel).toBe(30);
  });

  it("records a new peak ship value", () => {
    // engine $100 + fuel $20 + cargo $10
    expect(ok(launch(testRun({ peakShipValue: 99 }), TEST_PARTS, TEST_ECONOMY)).peakShipValue).toBe(130);
  });

  it("sets the ship-value danger tier from the ship launched", () => {
    // $130 of parts passes a $100 checkpoint
    const danger = { valueCheckpoints: [100], dropBuffer: 0, killsPerTier: 9, levels: [[], []], boss: NO_BOSS };
    expect(ok(launch(testRun({ valueTier: 1 }), TEST_PARTS, TEST_ECONOMY, danger)).valueTier).toBe(2);
  });

  it("keeps an earlier, higher peak ship value", () => {
    expect(ok(launch(testRun({ peakShipValue: 999 }), TEST_PARTS, TEST_ECONOMY)).peakShipValue).toBe(999);
  });

  it("adds signing fees for new crew", () => {
    // 3 crew × 10 wages + 1 new hire × 40
    expect(launchCost(testRun({ crew: 3, crewSigned: 2 }), TEST_ECONOMY)).toBe(70);
  });

  it("charges signing fees once, then everyone aboard is signed", () => {
    const ship = placePart(testShip(), hex(1, 0), "crew", 0, TEST_PARTS);
    const run = ok(launch(testRun({ ship, crew: 3, crewSigned: 2 }), TEST_PARTS, TEST_ECONOMY));
    expect(run.money).toBe(930);
    expect(run.crewSigned).toBe(3);
    expect(launchCost(run, TEST_ECONOMY)).toBe(30);
  });

  it("signs a smaller crew after firing", () => {
    expect(ok(launch(testRun({ crew: 1, crewSigned: 2 }), TEST_PARTS, TEST_ECONOMY)).crewSigned).toBe(1);
  });

  it("is blocked when you can't pay", () => {
    expect(launchProblems(testRun({ money: 19 }), TEST_PARTS, TEST_ECONOMY)).toEqual(["Launching costs $20 but you have $19."]);
  });

  it("is blocked with an empty tank", () => {
    expect(launchProblems(testRun({ fuel: 0 }), TEST_PARTS, TEST_ECONOMY)).toEqual(["Fuel tank is empty. Refuel before launching."]);
  });

  it("is blocked with no crew", () => {
    expect(launchProblems(testRun({ crew: 0 }), TEST_PARTS, TEST_ECONOMY)).toContain("No crew to fly the ship.");
  });

  it("is blocked with more crew than berths", () => {
    expect(launchProblems(testRun({ crew: 3 }), TEST_PARTS, TEST_ECONOMY)).toContain(
      "1 crew have no berth. Add crew modules or fire crew.",
    );
  });

  it("is blocked when cargo no longer fits", () => {
    const ship = new Map(testShip());
    ship.delete("0,1"); // sold the only cargo bay
    expect(launchProblems(testRun({ ship, cargo: [CONTRACT("A", 4)] }), TEST_PARTS, TEST_ECONOMY)).toContain(
      "Cargo is over capacity (4 / 0). Unload a contract or add cargo bays.",
    );
  });
});

describe("towBack", () => {
  it("charges the tow fee, even into debt", () => {
    const run = towBack(testRun({ money: 40, fuel: 0 }), TEST_ECONOMY);
    expect(run.money).toBe(-60);
    expect(run.fuel).toBe(0);
  });
});

describe("arrive", () => {
  it("pays for delivered cargo, moves a day on and docks at the planet it reached", () => {
    const run = testRun({ cargo: [CONTRACT("A", 4, 10), CONTRACT("B", 2, 25)], offers: [CONTRACT("OLD", 1)] });
    const result = arrive(run, quietTrip(run), 1, sequence(0), TEST_ECONOMY);
    expect(result.earned).toBe(90);
    expect(result.delivered.map((c) => c.id)).toEqual(["A", "B"]);
    expect(result.run.money).toBe(1090);
    expect(result.run.day).toBe(2);
    expect(result.run.docked).toBe(1);
    expect(result.run.cargo).toEqual([]);
    expect(result.run.offers.map((c) => c.id)).toEqual(["2-0", "2-1"]);
    expect(result.run.offers.every((c) => c.from === 1)).toBe(true);
  });

  it("keeps cargo bound for other planets aboard, unpaid", () => {
    const elsewhere = CONTRACT("B", 2, 25, { from: 0, to: 2 });
    const run = testRun({ cargo: [CONTRACT("A", 4, 10), elsewhere] });
    const result = arrive(run, quietTrip(run), 1, sequence(0), TEST_ECONOMY);
    expect(result.earned).toBe(40);
    expect(result.delivered.map((c) => c.id)).toEqual(["A"]);
    expect(result.run.cargo).toEqual([elsewhere]);
  });

  it("delivers open cargo at any planet but the one it came from", () => {
    const open = CONTRACT("A", 4, 10, { from: 0, to: null });
    const run = testRun({ cargo: [open] });
    expect(arrive(run, quietTrip(run), 2, sequence(0), TEST_ECONOMY).earned).toBe(40);
    expect(arrive(run, quietTrip(run), 0, sequence(0), TEST_ECONOMY).run.cargo).toEqual([open]);
  });

  it("adds every delivered contract to your reputation", () => {
    const run = testRun({ delivered: 4, cargo: [CONTRACT("A", 1), CONTRACT("B", 1), CONTRACT("C", 1, 10, { from: 0, to: 2 })] });
    expect(arrive(run, quietTrip(run), 1, sequence(0), TEST_ECONOMY).run.delivered).toBe(6);
  });

  it("adds the pay to the cargo sold score", () => {
    const run = testRun({ cargoEarned: 9, cargo: [CONTRACT("A", 4, 10)] });
    expect(arrive(run, quietTrip(run), 1, sequence(0), TEST_ECONOMY).run.cargoEarned).toBe(49);
  });

  it("counts a trip flown at top danger toward the boss", () => {
    const danger = { valueCheckpoints: [100], dropBuffer: 0, killsPerTier: 9, levels: [[], []], boss: NO_BOSS };
    const run = testRun({ topTrips: 4 });
    expect(arrive(run, { ...quietTrip(run), danger: 2 }, 1, sequence(0), TEST_ECONOMY, danger).run.topTrips).toBe(5);
  });

  it("counts a boss trip that destroyed the boss", () => {
    const danger = { valueCheckpoints: [100], dropBuffer: 0, killsPerTier: 9, levels: [[], []], boss: NO_BOSS };
    const run = testRun({ topTrips: 2 });
    const trip = { ...quietTrip(run), danger: 2, boss: true, bossKilled: true };
    expect(arrive(run, trip, 1, sequence(0), TEST_ECONOMY, danger).run.topTrips).toBe(3);
  });

  it("doesn't count a boss trip the boss survived, so the next trip meets it again", () => {
    const danger = { valueCheckpoints: [100], dropBuffer: 0, killsPerTier: 9, levels: [[], []], boss: NO_BOSS };
    const run = testRun({ topTrips: 2 });
    const trip = { ...quietTrip(run), danger: 2, boss: true, bossKilled: false };
    expect(arrive(run, trip, 1, sequence(0), TEST_ECONOMY, danger).run.topTrips).toBe(2);
  });

  it("doesn't count a trip flown below top danger", () => {
    const danger = { valueCheckpoints: [100], dropBuffer: 0, killsPerTier: 9, levels: [[], []], boss: NO_BOSS };
    const run = testRun({ topTrips: 4 });
    expect(arrive(run, { ...quietTrip(run), danger: 1 }, 1, sequence(0), TEST_ECONOMY, danger).run.topTrips).toBe(4);
  });

  it("keeps what the flight changed", () => {
    const run = testRun({ kills: 9 });
    const result = arrive(run, { ...quietTrip(run), fuel: 9, bounty: 99, kills: 2 }, 1, sequence(0), TEST_ECONOMY);
    expect(result.run.fuel).toBe(9);
    expect(result.run.money).toBe(1099);
    expect(result.run.kills).toBe(11);
  });
});
