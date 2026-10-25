import { CARGO_NAMES, ECONOMY, PLANETS, type Economy, type Planet } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { computeShipStats } from "../ship/stats";
import type { Outcome, Random, Run } from "./run";

export type Contract = {
  readonly id: string;
  readonly cargo: string;
  readonly units: number;
  readonly payPerUnit: number;
  readonly tier: number; // index into ECONOMY.contractTiers
  readonly from: number; // index into PLANETS: where it was offered
  readonly to: number | null; // index into PLANETS, or null for an open contract that any other planet takes
};

export const isOpen = (contract: Contract): boolean => contract.to === null;

// Open contracts are delivered at the first planet you dock at after leaving the one they came from.
export const deliverableAt = (contract: Contract, planet: number): boolean =>
  contract.to === null ? contract.from !== planet : contract.to === planet;

export const planetDistance = (a: number, b: number, planets: readonly Planet[] = PLANETS): number =>
  Math.hypot(planets[b].x - planets[a].x, planets[b].y - planets[a].y);

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
// Pay is fixed when the offer is made. A contract for a set planet pays more per unit the farther away it is;
// an open one pays a low fixed rate wherever it goes.
export function generateOffers(
  day: number,
  delivered: number,
  docked: number,
  random: Random,
  econ: Economy = ECONOMY,
  planets: readonly Planet[] = PLANETS,
): Contract[] {
  const unlocked = unlockedTiers(delivered, econ);
  const bonus = 1 + reputation(delivered, econ).payBonus;
  const others = planets.map((_, i) => i).filter((i) => i !== docked);
  return Array.from({ length: econ.offersPerStation }, (_, i) => {
    const tier = random() < econ.topTierShare ? unlocked - 1 : Math.floor(random() * unlocked);
    const { units, pay } = econ.contractTiers[tier];
    const cargo = CARGO_NAMES[Math.floor(random() * CARGO_NAMES.length)];
    const count = randomInt(units.min, units.max, random);
    const base = randomInt(pay.min, pay.max, random) * bonus;
    const to = random() < econ.openShare ? null : others[Math.floor(random() * others.length)];
    const reach = to === null ? econ.openPayShare : planetDistance(docked, to, planets) / econ.payDistance;
    return { id: `${day}-${i}`, cargo, units: count, payPerUnit: Math.max(1, Math.round(base * reach)), tier, from: docked, to };
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

// Only cargo loaded at this planet can go back on its board. Cargo from anywhere else stays aboard until it's delivered.
export function unloadContract(run: Run, id: string, planets: readonly Planet[] = PLANETS): Outcome {
  const contract = run.cargo.find((c) => c.id === id);
  if (!contract) return { ok: false, reason: "That contract isn't loaded." };
  if (contract.from !== run.docked) {
    const where = contract.to === null ? "any planet but this one" : planets[contract.to].name;
    return { ok: false, reason: `That cargo was loaded at ${planets[contract.from].name}. It stays aboard until you reach ${where}.` };
  }
  return {
    ok: true,
    run: { ...run, cargo: run.cargo.filter((c) => c.id !== id), offers: [...run.offers, contract] },
  };
}

// Inclusive of both ends.
const randomInt = (min: number, max: number, random: Random): number => min + Math.floor(random() * (max - min + 1));
