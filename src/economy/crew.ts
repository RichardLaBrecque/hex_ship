import { ECONOMY, type Economy } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { computeShipStats } from "../ship/stats";
import type { Outcome, Run } from "./run";

export const wages = (crew: number, econ: Economy = ECONOMY): number => crew * econ.crewWage;

// Signing fees for crew added since the last launch. Paid at launch, not when hiring.
export const hiringFees = (run: Run, econ: Economy = ECONOMY): number => Math.max(0, run.crew - run.crewSigned) * econ.crewHireCost;

// Adds crew to the roster. Nothing is charged until launch.
export function hireCrew(run: Run, catalog: PartCatalog = PARTS): Outcome {
  const berths = computeShipStats(run.ship, run.crew, catalog).crewCapacity;
  if (run.crew >= berths) return { ok: false, reason: "No free berths. Add a crew module." };
  return { ok: true, run: { ...run, crew: run.crew + 1 } };
}

// Takes crew off the roster. Signing fees already paid aren't refunded.
export function fireCrew(run: Run): Outcome {
  if (run.crew === 0) return { ok: false, reason: "No crew to fire." };
  return { ok: true, run: { ...run, crew: run.crew - 1 } };
}
