import { ENCOUNTERS, type EnemyTier } from "../data/enemies";
import { PARTS, type PartCatalog, type PartId } from "../data/parts";
import type { Random } from "../economy/run";
import { hex, hexKey, neighbors, type Hex, type Point } from "../hex/hex";
import { placePart, shipValue, type Ship } from "../ship/ship";
import { computeShipStats } from "../ship/stats";
import { validateShip } from "../ship/validate";
import { thrustSpin, type Body } from "./physics";

const BUILD_ATTEMPTS = 60;
const MAX_DRIFT_TURN = (10 * Math.PI) / 180; // radians/s an enemy may drift-turn under thrust or braking, so the AI can still aim

export type Encounters = typeof ENCOUNTERS;

// Fits the tier's core, then buys random extras until the budget runs out.
// An extra is only kept if the ship still passes the same checks as a player ship and still flies straight.
export function buildEnemy(tier: EnemyTier, random: Random, catalog: PartCatalog = PARTS): Ship {
  let ship: Ship = new Map();
  for (const p of tier.core) ship = placePart(ship, hex(p.q, p.r), p.type, p.rotation, catalog);

  const budget = tier.budget.min + random() * (tier.budget.max - tier.budget.min);
  for (let i = 0; i < BUILD_ATTEMPTS && tier.extras.length > 0; i++) {
    const type = tier.extras[Math.floor(random() * tier.extras.length)];
    if (shipValue(ship, catalog) + catalog[type].cost > budget) continue;
    const spots = openHexes(ship);
    const spot = spots[Math.floor(random() * spots.length)];
    const candidate = placePart(ship, spot, type, facing(type), catalog);
    if (validateShip(candidate, catalog).valid && fliesStraight(candidate, catalog)) ship = candidate;
  }
  return ship;
}

// The engines barely turn the ship off course under thrust or braking.
function fliesStraight(ship: Ship, catalog: PartCatalog): boolean {
  const stats = computeShipStats(ship, Infinity, catalog);
  return Math.abs(thrustSpin(stats, stats.main)) < MAX_DRIFT_TURN && Math.abs(thrustSpin(stats, stats.brake)) < MAX_DRIFT_TURN;
}

// Engines exhaust backwards; weapons point at the nose so the AI aims them by turning.
const facing = (type: PartId): number => (type === "engine" ? 3 : 0);

// Empty hexes touching the ship.
function openHexes(ship: Ship): Hex[] {
  const open = new Map<string, Hex>();
  for (const part of ship.values()) {
    for (const n of neighbors(part.hex)) {
      const key = hexKey(n);
      if (!ship.has(key)) open.set(key, n);
    }
  }
  return [...open.values()];
}

// Somewhere ahead of the player toward `toward`, a little off the route, facing the player.
export function spawnBody(player: Body, toward: Point, random: Random, enc: Encounters = ENCOUNTERS): Body {
  const route = Math.atan2(toward.y - player.y, toward.x - player.x);
  const angle = route + (random() * 2 - 1) * ((enc.spawnSpread * Math.PI) / 180);
  const x = player.x + Math.cos(angle) * enc.spawnDistance;
  const y = player.y + Math.sin(angle) * enc.spawnDistance;
  return { x, y, vx: 0, vy: 0, angle: Math.atan2(player.y - y, player.x - x), spin: 0 };
}
