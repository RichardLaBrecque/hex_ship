import { ECONOMY, type Economy } from "../data/balance";
import { PARTS, type PartCatalog, type PartId } from "../data/parts";
import type { Hex } from "../hex/hex";
import { partAt, placePart, removePart, rotatePart, type PlacedPart, type Ship } from "../ship/ship";
import { fitFuel } from "./fuel";
import type { Outcome, Run } from "./run";

// What you get back for a part: a share of its price, less for damaged parts.
export function sellValue(part: PlacedPart, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): number {
  const def = catalog[part.type];
  return Math.floor(def.cost * econ.sellRefund * (part.hp / def.maxHp));
}

// Buys a part into a hex. An existing part there is sold first.
// Placing the same type over itself just turns it to the new rotation, for free.
export function buyPart(
  run: Run,
  h: Hex,
  type: PartId,
  rotation: number,
  catalog: PartCatalog = PARTS,
  econ: Economy = ECONOMY,
): Outcome {
  const existing = partAt(run.ship, h);
  if (existing?.type === "bridge") return { ok: false, reason: "The bridge can't be replaced." };
  if (existing?.type === type) {
    return { ok: true, run: { ...run, ship: rotatePart(run.ship, h, rotation - existing.rotation) } };
  }
  const refund = existing ? sellValue(existing, catalog, econ) : 0;
  const price = catalog[type].cost;
  if (run.money + refund < price) return { ok: false, reason: `${catalog[type].name} costs $${price}.` };
  const bought = { ...run, ship: placePart(run.ship, h, type, rotation, catalog), money: run.money + refund - price };
  return { ok: true, run: fitFuel(bought, catalog) };
}

export function sellPart(run: Run, h: Hex, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): Outcome {
  const existing = partAt(run.ship, h);
  if (!existing) return { ok: false, reason: "Nothing to sell there." };
  if (existing.type === "bridge") return { ok: false, reason: "The bridge can't be sold." };
  const sold = { ...run, ship: removePart(run.ship, h), money: run.money + sellValue(existing, catalog, econ) };
  return { ok: true, run: fitFuel(sold, catalog) };
}

export function repairCost(ship: Ship, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): number {
  let missing = 0;
  for (const part of ship.values()) missing += catalog[part.type].maxHp - part.hp;
  return Math.ceil(missing * econ.repairCostPerHp);
}

export function repairAll(run: Run, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): Outcome {
  const cost = repairCost(run.ship, catalog, econ);
  if (cost === 0) return { ok: false, reason: "Nothing needs repairing." };
  if (run.money < cost) return { ok: false, reason: `Repairs cost $${cost}.` };
  const repaired = new Map<string, PlacedPart>();
  for (const [key, part] of run.ship) repaired.set(key, { ...part, hp: catalog[part.type].maxHp });
  return { ok: true, run: { ...run, ship: repaired, money: run.money - cost } };
}
