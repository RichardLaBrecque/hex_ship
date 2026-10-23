import { ECONOMY, PLANETS, type Economy } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { shipValue, starterShip, type Ship } from "../ship/ship";
import { computeShipStats } from "../ship/stats";
import { validateShip } from "../ship/validate";
import { DANGER, type Danger } from "../data/enemies";
import { cargoUnits, contractPay, generateOffers, type Contract } from "./contracts";
import { valueTier } from "./danger";
import { hiringFees, wages } from "./crew";

// Everything about the current run. Actions return a new Run instead of changing this one.
export type Run = {
  readonly money: number;
  readonly day: number;
  readonly ship: Ship;
  readonly crew: number; // the roster as planned at this station
  readonly crewSigned: number; // crew whose signing fee is already paid
  readonly fuel: number; // units in the tanks
  readonly docked: 0 | 1; // index into PLANETS
  readonly offers: readonly Contract[]; // contracts on the board at this station
  readonly cargo: readonly Contract[]; // contracts loaded aboard, paid on arrival
  readonly delivered: number; // contracts delivered this run: reputation
  readonly kills: number; // enemy ships destroyed this run: notoriety
  readonly valueTier: number; // ship-value danger tier as of the last launch (see danger.ts)
  readonly topTrips: number; // trips that arrived after flying at top danger: every few is a boss trip (see danger.ts)
  // The score, kept as three separate columns.
  readonly peakShipValue: number; // the most the ship's parts were worth at any launch
  readonly cargoEarned: number; // total paid for delivered contracts
  readonly bountiesEarned: number; // total paid for kills
};

// An action either succeeds with a new Run or explains why it can't happen.
export type Outcome = { ok: true; run: Run } | { ok: false; reason: string };

export type Random = () => number;

export function newRun(random: Random = Math.random, econ: Economy = ECONOMY): Run {
  const ship = starterShip();
  return {
    money: econ.startingMoney,
    day: 1,
    ship,
    crew: econ.startingCrew,
    crewSigned: econ.startingCrew,
    fuel: computeShipStats(ship, econ.startingCrew).fuelCapacity,
    docked: 0,
    offers: generateOffers(1, 0, random, econ),
    cargo: [],
    delivered: 0,
    kills: 0,
    valueTier: 1,
    topTrips: 0,
    peakShipValue: shipValue(ship),
    cargoEarned: 0,
    bountiesEarned: 0,
  };
}

export const destination = (run: Run): 0 | 1 => (run.docked === 0 ? 1 : 0);

export function tripDistance(run: Run): number {
  const from = PLANETS[run.docked];
  const to = PLANETS[destination(run)];
  return Math.hypot(to.x - from.x, to.y - from.y);
}

// Wages and new crew's signing fees are paid at launch. Fuel is bought separately when refuelling.
export const launchCost = (run: Run, econ: Economy = ECONOMY): number => wages(run.crew, econ) + hiringFees(run, econ);

export const expectedPay = (run: Run): number => run.cargo.reduce((sum, c) => sum + contractPay(c), 0);

// Everything stopping the ship from leaving: layout problems plus money, crew and cargo.
export function launchProblems(run: Run, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): string[] {
  const problems = [...validateShip(run.ship, catalog).problems];
  const stats = computeShipStats(run.ship, run.crew, catalog);
  if (run.crew > stats.crewCapacity) problems.push(`${run.crew - stats.crewCapacity} crew have no berth. Add crew modules or fire crew.`);
  if (run.crew === 0) problems.push("No crew to fly the ship.");
  const loaded = cargoUnits(run.cargo);
  if (loaded > stats.cargoCapacity) problems.push(`Cargo is over capacity (${loaded} / ${stats.cargoCapacity}). Unload a contract.`);
  if (stats.fuelCapacity > 0 && run.fuel <= 0) problems.push("Fuel tank is empty. Refuel before launching.");
  const cost = launchCost(run, econ);
  if (run.money < cost) problems.push(`Launching costs $${cost} but you have $${run.money}.`);
  return problems;
}

// Pays wages and any new crew's signing fees. Everyone aboard is now signed.
// The ship's value at launch sets its danger tier and counts toward the peak ship value score.
export function launch(run: Run, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY, danger: Danger = DANGER): Outcome {
  const problems = launchProblems(run, catalog, econ);
  if (problems.length > 0) return { ok: false, reason: problems[0] };
  const value = shipValue(run.ship, catalog);
  return {
    ok: true,
    run: {
      ...run,
      money: run.money - launchCost(run, econ),
      crewSigned: run.crew,
      valueTier: valueTier(value, run.valueTier, danger),
      peakShipValue: Math.max(run.peakShipValue, value),
    },
  };
}

// A kill pays a share of what the enemy's parts are worth.
export const bountyFor = (enemy: Ship, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): number =>
  Math.round(shipValue(enemy, catalog) * econ.bountyShare);

// What a flight changed, however it ended, and the danger tier it flew at.
export type TripResult = { fuel: number; ship: Ship; bounty: number; kills: number; danger: number };

// Fuel burned, damage taken (lost parts are gone), bounties earned and kills made.
export const afterFlight = (run: Run, trip: TripResult): Run => ({
  ...run,
  fuel: trip.fuel,
  ship: trip.ship,
  money: run.money + trip.bounty,
  bountiesEarned: run.bountiesEarned + trip.bounty,
  kills: run.kills + trip.kills,
});

// Ran dry mid-flight: towed back to the planet you left, for a fee. Money can go negative.
export const towBack = (run: Run, econ: Economy = ECONOMY): Run => ({ ...run, fuel: 0, money: run.money - econ.towFee });

export type Arrival = { run: Run; delivered: readonly Contract[]; earned: number };

// Docking at the destination after `trip`: get paid for cargo, a day passes, a new contract board.
// Every contract delivered adds to your reputation, which the new board already reflects.
export function arrive(launched: Run, trip: TripResult, random: Random = Math.random, econ: Economy = ECONOMY, danger: Danger = DANGER): Arrival {
  const run = afterFlight(launched, trip);
  const earned = expectedPay(run);
  const day = run.day + 1;
  const delivered = run.delivered + run.cargo.length;
  return {
    run: {
      ...run,
      topTrips: run.topTrips + (trip.danger === danger.levels.length ? 1 : 0),
      money: run.money + earned,
      cargoEarned: run.cargoEarned + earned,
      day,
      docked: destination(run),
      cargo: [],
      delivered,
      offers: generateOffers(day, delivered, random, econ),
    },
    delivered: run.cargo,
    earned,
  };
}
