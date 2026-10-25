import { ECONOMY, type Economy } from "../data/balance";
import { PARTS, type PartCatalog, type PartId } from "../data/parts";
import { hexKey, type Hex } from "../hex/hex";
import { partAt } from "../ship/ship";
import { fitFuel } from "./fuel";
import type { Outcome, Random, Run } from "./run";
import { sellValue } from "./shop";

// A part salvaged from a wreck, riding in the hold with the damage it had when it broke off.
export type Salvage = { readonly type: PartId; readonly hp: number };

// Which of a destroyed enemy's remaining parts survive as salvage: each has salvageChance, up to salvageMax.
// The bridge never does.
export function pickSalvage<T extends Salvage>(parts: readonly T[], random: Random, econ: Economy = ECONOMY): T[] {
  return parts.filter((part) => part.type !== "bridge" && random() < econ.salvageChance).slice(0, econ.salvageMax);
}

export const salvageUnits = (salvage: readonly Salvage[], econ: Economy = ECONOMY): number => salvage.length * econ.salvageUnits;

// Sells the salvage at `index` in the hold for what the part is worth as it is. It counts toward bounties.
export function sellSalvage(run: Run, index: number, catalog: PartCatalog = PARTS): Outcome {
  const salvage = run.salvage[index];
  if (!salvage) return { ok: false, reason: "That salvage isn't in the hold." };
  const value = sellValue(salvage, catalog);
  return {
    ok: true,
    run: { ...run, salvage: without(run.salvage, index), money: run.money + value, bountiesEarned: run.bountiesEarned + value },
  };
}

// Installs the salvage at `index` into a hex for free, damage and all, freeing its hold space.
// An existing part there is sold first, along with any fuel that no longer fits (see fitFuel).
export function installSalvage(
  run: Run,
  index: number,
  h: Hex,
  rotation: number,
  catalog: PartCatalog = PARTS,
  econ: Economy = ECONOMY,
): Outcome {
  const salvage = run.salvage[index];
  if (!salvage) return { ok: false, reason: "That salvage isn't in the hold." };
  const existing = partAt(run.ship, h);
  if (existing?.type === "bridge") return { ok: false, reason: "The bridge can't be replaced." };
  const refund = existing ? sellValue(existing, catalog) : 0;
  const ship = new Map(run.ship);
  ship.set(hexKey(h), { hex: h, type: salvage.type, rotation, hp: salvage.hp });
  const installed = { ...run, ship, salvage: without(run.salvage, index), money: run.money + refund };
  return { ok: true, run: fitFuel(installed, catalog, econ) };
}

const without = (salvage: readonly Salvage[], index: number): Salvage[] => salvage.filter((_, i) => i !== index);
