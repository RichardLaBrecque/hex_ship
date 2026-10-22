import { ECONOMY, type Economy } from "../data/balance";
import { PARTS, type PartCatalog, type PartId } from "../data/parts";
import type { Hex } from "../hex/hex";
import { partAt, placePart, removePart, rotatePart, type PlacedPart, type Ship } from "../ship/ship";
import { fitFuel } from "./fuel";
import type { Outcome, Run } from "./run";

// What you get back for a part: full price at full hp, scaled down by damage.
export function sellValue(part: PlacedPart, catalog: PartCatalog = PARTS): number {
  const def = catalog[part.type];
  return Math.floor(def.cost * (part.hp / def.maxHp));
}

// Buys a part into a hex. An existing part there is sold first.
// Placing the same type over itself just turns it to the new rotation, for free.
export function buyPart(
  run: Run,
  h: Hex,
  type: PartId,
  rotation: number,
  catalog: PartCatalog = PARTS,
): Outcome {
  const existing = partAt(run.ship, h);
  if (existing?.type === "bridge") return { ok: false, reason: "The bridge can't be replaced." };
  if (existing?.type === type) {
    return { ok: true, run: { ...run, ship: rotatePart(run.ship, h, rotation - existing.rotation) } };
  }
  const refund = existing ? sellValue(existing, catalog) : 0;
  const price = catalog[type].cost;
  if (run.money + refund < price) return { ok: false, reason: `${catalog[type].name} costs $${price}.` };
  const bought = { ...run, ship: placePart(run.ship, h, type, rotation, catalog), money: run.money + refund - price };
  return { ok: true, run: fitFuel(bought, catalog) };
}

export function sellPart(run: Run, h: Hex, catalog: PartCatalog = PARTS): Outcome {
  const existing = partAt(run.ship, h);
  if (!existing) return { ok: false, reason: "Nothing to sell there." };
  if (existing.type === "bridge") return { ok: false, reason: "The bridge can't be sold." };
  const sold = { ...run, ship: removePart(run.ship, h), money: run.money + sellValue(existing, catalog) };
  return { ok: true, run: fitFuel(sold, catalog) };
}

// Repairing a part costs a share of the value its damage knocked off, so it's always cheaper
// than selling it and buying a new one. The bridge has no price, so it uses a flat rate.
export function repairCost(ship: Ship, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): number {
  let cost = 0;
  for (const part of ship.values()) {
    const def = catalog[part.type];
    const missing = def.maxHp - part.hp;
    cost += part.type === "bridge" ? missing * econ.bridgeRepairPerHp : (def.cost * missing * econ.repairShare) / def.maxHp;
  }
  return Math.floor(cost);
}

export function repairAll(run: Run, catalog: PartCatalog = PARTS, econ: Economy = ECONOMY): Outcome {
  if ([...run.ship.values()].every((p) => p.hp >= catalog[p.type].maxHp)) return { ok: false, reason: "Nothing needs repairing." };
  const cost = repairCost(run.ship, catalog, econ);
  if (run.money < cost) return { ok: false, reason: `Repairs cost $${cost}.` };
  const repaired = new Map<string, PlacedPart>();
  for (const [key, part] of run.ship) repaired.set(key, { ...part, hp: catalog[part.type].maxHp });
  return { ok: true, run: { ...run, ship: repaired, money: run.money - cost } };
}
