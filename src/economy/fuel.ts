import { ECONOMY, type Economy } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { computeShipStats } from "../ship/stats";
import type { Outcome, Run } from "./run";

export function missingFuel(run: Run, catalog: PartCatalog = PARTS): number {
  return Math.max(0, computeShipStats(run.ship, run.crew, catalog).fuelCapacity - run.fuel);
}

export const refuelCost = (run: Run, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): number =>
  Math.ceil(missingFuel(run, catalog) * econ.fuelPrice);

// Fills the tanks, or buys as much as you can afford.
export function refuel(run: Run, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): Outcome {
  const missing = missingFuel(run, catalog);
  if (missing === 0) return { ok: false, reason: "Tanks are already full." };
  const units = Math.min(missing, Math.floor(run.money / econ.fuelPrice));
  if (units === 0) return { ok: false, reason: `Fuel costs $${econ.fuelPrice} a unit.` };
  return { ok: true, run: { ...run, fuel: run.fuel + units, money: run.money - Math.ceil(units * econ.fuelPrice) } };
}

// After the ship changes, fuel that no longer fits in the tanks is sold back at the station's fuel price,
// so moving a tank (sell, then buy and refuel) costs nothing. The refund rounds up like refuelCost does,
// so buying the same fuel back costs exactly what selling it paid.
export function fitFuel(run: Run, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): Run {
  const capacity = computeShipStats(run.ship, run.crew, catalog).fuelCapacity;
  if (run.fuel <= capacity) return run;
  return { ...run, fuel: capacity, money: run.money + Math.ceil((run.fuel - capacity) * econ.fuelPrice) };
}
