import { FLIGHT } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { hexKey, hexToPixel, pixelToHex, type Point } from "../hex/hex";
import { absorbWithShield, damagePart } from "../ship/damage";
import { centerOfMass, findBridges, type PlacedPart, type Ship } from "../ship/ship";
import { computeShipStats, type ShipStats } from "../ship/stats";
import type { Body } from "./physics";

export type Side = "player" | "enemy";

// A ship out in space. The flight scene changes these in place every step.
export type Vessel = {
  side: Side;
  ship: Ship;
  body: Body; // x/y is where the ship's pivot sits in the world
  stats: ShipStats;
  pivot: Point; // ship-local centre of mass
  radius: number; // ship-local distance from the pivot to the farthest hex edge
  crew: number;
  shield: number;
  fullHull: number; // max hull at launch, before any parts were lost
  aimError: number; // degrees either side of a perfect shot; 0 for the player
  reload: Map<string, number>; // seconds until each weapon (by hexKey) can fire again
};

export function makeVessel(
  side: Side,
  ship: Ship,
  body: Body,
  crew: number,
  size: number = FLIGHT.hexSize,
  catalog: PartCatalog = PARTS,
): Vessel {
  const stats = computeShipStats(ship, crew, catalog);
  const pivot = centerOfMass(ship, size, catalog);
  return {
    side,
    ship,
    body,
    stats,
    pivot,
    radius: shipRadius(ship, pivot, size),
    crew,
    shield: stats.shieldMax,
    fullHull: stats.maxHull,
    aimError: 0,
    reload: new Map(),
  };
}

export function toWorld(v: Vessel, local: Point): Point {
  const dx = local.x - v.pivot.x;
  const dy = local.y - v.pivot.y;
  const cos = Math.cos(v.body.angle);
  const sin = Math.sin(v.body.angle);
  return { x: v.body.x + dx * cos - dy * sin, y: v.body.y + dx * sin + dy * cos };
}

export function toLocal(v: Vessel, world: Point): Point {
  const dx = world.x - v.body.x;
  const dy = world.y - v.body.y;
  const cos = Math.cos(v.body.angle);
  const sin = Math.sin(v.body.angle);
  return { x: v.pivot.x + dx * cos + dy * sin, y: v.pivot.y - dx * sin + dy * cos };
}

export const hexWorld = (v: Vessel, part: PlacedPart, size: number = FLIGHT.hexSize): Point =>
  toWorld(v, hexToPixel(part.hex, size));

// The hexKey of the part under a world point, if there is one.
export function keyAtWorld(v: Vessel, world: Point, size: number = FLIGHT.hexSize): string | undefined {
  if (Math.hypot(world.x - v.body.x, world.y - v.body.y) > v.radius) return undefined;
  const key = hexKey(pixelToHex(toLocal(v, world), size));
  return v.ship.has(key) ? key : undefined;
}

export const isWrecked = (v: Vessel): boolean => findBridges(v.ship).length === 0;

export type Hit = { destroyed: PlacedPart | null; detached: PlacedPart[] };

// Shields soak the hit first; whatever gets through damages the part that was struck.
export function applyHit(v: Vessel, key: string, damage: number, size: number = FLIGHT.hexSize, catalog: PartCatalog = PARTS): Hit {
  const { shield, leftover } = absorbWithShield(v.shield, damage);
  v.shield = shield;
  const result = damagePart(v.ship, key, leftover);
  if (result.ship !== v.ship) setShip(v, result.ship, size, catalog);
  return { destroyed: result.destroyed, detached: result.detached };
}

// Swaps in a changed layout. The ship stays where it was on screen even though its centre of mass moved.
export function setShip(v: Vessel, ship: Ship, size: number = FLIGHT.hexSize, catalog: PartCatalog = PARTS): void {
  const pivot = centerOfMass(ship, size, catalog);
  const anchor = toWorld(v, pivot);
  v.ship = ship;
  v.stats = computeShipStats(ship, v.crew, catalog);
  v.pivot = pivot;
  v.radius = shipRadius(ship, pivot, size);
  v.body = { ...v.body, x: anchor.x, y: anchor.y };
  v.shield = Math.min(v.shield, v.stats.shieldMax);
}

function shipRadius(ship: Ship, pivot: Point, size: number): number {
  let radius = 0;
  for (const part of ship.values()) {
    const p = hexToPixel(part.hex, size);
    radius = Math.max(radius, Math.hypot(p.x - pivot.x, p.y - pivot.y) + size);
  }
  return radius;
}
