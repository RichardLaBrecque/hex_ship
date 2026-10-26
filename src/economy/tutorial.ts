import { PARTS, type PartCatalog } from "../data/parts";
import type { TutorialLeg } from "../data/tutorial";
import { hex } from "../hex/hex";
import { placePart, type Ship } from "../ship/ship";
import { computeShipStats } from "../ship/stats";
import { newRun, type Run } from "./run";

// A run for flying one leg of the tutorial: its demo ship fully crewed and fuelled, docked where the leg starts,
// with its cargo aboard. It's never saved or scored.
export function tutorialRun(leg: TutorialLeg, catalog: PartCatalog = PARTS): Run {
  let ship: Ship = new Map();
  for (const p of leg.ship) ship = placePart(ship, hex(p.q, p.r), p.type, p.rotation, catalog);
  const stats = computeShipStats(ship, Infinity, catalog);
  const cargo = leg.cargo
    ? [{ id: "tutorial", cargo: leg.cargo.name, units: leg.cargo.units, payPerUnit: 0, tier: 0, from: leg.from, to: leg.flight.to, grand: false }]
    : [];
  return {
    ...newRun(),
    ship,
    crew: stats.crewRequired,
    crewSigned: stats.crewRequired,
    fuel: stats.fuelCapacity,
    docked: leg.from,
    offers: [],
    cargo,
  };
}
