import { CARGO_NAMES, ECONOMY, type Economy } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { computeShipStats } from "../ship/stats";
import type { Outcome, Random, Run } from "./run";

export type Contract = {
  readonly id: string;
  readonly cargo: string;
  readonly units: number;
  readonly payPerUnit: number;
};

export const contractPay = (contract: Contract): number => contract.units * contract.payPerUnit;

export const cargoUnits = (contracts: readonly Contract[]): number => contracts.reduce((sum, c) => sum + c.units, 0);

export function generateOffers(day: number, random: Random, econ: Economy = ECONOMY): Contract[] {
  const growth = 1 + econ.payGrowthPerDay * (day - 1);
  return Array.from({ length: econ.offersPerStation }, (_, i) => ({
    id: `${day}-${i}`,
    cargo: CARGO_NAMES[Math.floor(random() * CARGO_NAMES.length)],
    units: randomInt(econ.contractUnitsMin, econ.contractUnitsMax, random),
    payPerUnit: Math.round(randomInt(econ.payPerUnitMin, econ.payPerUnitMax, random) * growth),
  }));
}

export function loadContract(run: Run, id: string, catalog: PartCatalog = PARTS): Outcome {
  const contract = run.offers.find((c) => c.id === id);
  if (!contract) return { ok: false, reason: "That contract isn't on the board." };
  const capacity = computeShipStats(run.ship, run.crew, catalog).cargoCapacity;
  const free = capacity - cargoUnits(run.cargo);
  if (contract.units > free) return { ok: false, reason: `Needs ${contract.units} units of space, only ${free} free.` };
  return {
    ok: true,
    run: { ...run, offers: run.offers.filter((c) => c.id !== id), cargo: [...run.cargo, contract] },
  };
}

export function unloadContract(run: Run, id: string): Outcome {
  const contract = run.cargo.find((c) => c.id === id);
  if (!contract) return { ok: false, reason: "That contract isn't loaded." };
  return {
    ok: true,
    run: { ...run, cargo: run.cargo.filter((c) => c.id !== id), offers: [...run.offers, contract] },
  };
}

// Inclusive of both ends.
const randomInt = (min: number, max: number, random: Random): number => min + Math.floor(random() * (max - min + 1));
