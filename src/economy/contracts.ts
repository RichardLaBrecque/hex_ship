import { CARGO_NAMES, ECONOMY, type Economy } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { computeShipStats } from "../ship/stats";
import type { Outcome, Random, Run } from "./run";

export type Contract = {
  readonly id: string;
  readonly cargo: string;
  readonly units: number;
  readonly payPerUnit: number;
  readonly tier: number; // index into ECONOMY.contractTiers
};

export const contractPay = (contract: Contract): number => contract.units * contract.payPerUnit;

export const cargoUnits = (contracts: readonly Contract[]): number => contracts.reduce((sum, c) => sum + c.units, 0);

// How many contract tiers `delivered` contracts have unlocked.
export const unlockedTiers = (delivered: number, econ: Economy = ECONOMY): number =>
  econ.contractTiers.filter((tier) => delivered >= tier.unlockAt).length;

export type Reputation = {
  rank: string;
  payBonus: number; // share added to contract pay, e.g. 0.21 for +21%
  next: { rank: string; at: number } | null; // the next rank and the deliveries it needs
};

export function reputation(delivered: number, econ: Economy = ECONOMY): Reputation {
  const unlocked = unlockedTiers(delivered, econ);
  const next = econ.contractTiers[unlocked];
  return {
    rank: econ.contractTiers[unlocked - 1].rank,
    payBonus: econ.payBonusPerDelivery * delivered,
    next: next ? { rank: next.rank, at: next.unlockAt } : null,
  };
}

// Offers come from your best unlocked tier some of the time and from any unlocked tier otherwise,
// so a small ship can still find work. Reputation raises the pay on all of them.
export function generateOffers(day: number, delivered: number, random: Random, econ: Economy = ECONOMY): Contract[] {
  const unlocked = unlockedTiers(delivered, econ);
  const bonus = 1 + reputation(delivered, econ).payBonus;
  return Array.from({ length: econ.offersPerStation }, (_, i) => {
    const tier = random() < econ.topTierShare ? unlocked - 1 : Math.floor(random() * unlocked);
    const { units, pay } = econ.contractTiers[tier];
    return {
      id: `${day}-${i}`,
      cargo: CARGO_NAMES[Math.floor(random() * CARGO_NAMES.length)],
      units: randomInt(units.min, units.max, random),
      payPerUnit: Math.round(randomInt(pay.min, pay.max, random) * bonus),
      tier,
    };
  });
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
