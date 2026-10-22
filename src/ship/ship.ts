import { PARTS, type PartCatalog, type PartId } from "../data/parts";
import { hex, hexKey, hexToPixel, mod6, neighbor, type Hex, type Point } from "../hex/hex";

export type PlacedPart = {
  readonly hex: Hex;
  readonly type: PartId;
  readonly rotation: number;
  readonly hp: number;
};

// Ship-local layout keyed by hexKey. Edits return a new ship so the old one stays usable (undo, previews).
export type Ship = ReadonlyMap<string, PlacedPart>;

export const partAt = (ship: Ship, h: Hex): PlacedPart | undefined => ship.get(hexKey(h));

export function placePart(ship: Ship, h: Hex, type: PartId, rotation: number, catalog: PartCatalog = PARTS): Ship {
  const next = new Map(ship);
  next.set(hexKey(h), { hex: h, type, rotation, hp: catalog[type].maxHp });
  return next;
}

export function removePart(ship: Ship, h: Hex): Ship {
  const next = new Map(ship);
  next.delete(hexKey(h));
  return next;
}

// Turns a placed part in place, keeping its current HP.
export function rotatePart(ship: Ship, h: Hex, steps: number): Ship {
  const part = partAt(ship, h);
  if (!part) return ship;
  const next = new Map(ship);
  next.set(hexKey(h), { ...part, rotation: mod6(part.rotation + steps) });
  return next;
}

export function findBridges(ship: Ship): PlacedPart[] {
  return [...ship.values()].filter((p) => p.type === "bridge");
}

export function isExhaustBlocked(ship: Ship, engine: PlacedPart): boolean {
  return ship.has(hexKey(neighbor(engine.hex, engine.rotation)));
}

// Share of an engine's push that goes forward (direction 0), indexed by push direction.
const FORWARD_SHARE = [1, 0.5, 0, 0, 0, 0.5];

// The ship is pushed opposite the exhaust: exhaust straight back gives full thrust, 60° off gives half.
export const forwardFactor = (exhaustDirection: number): number => FORWARD_SHARE[mod6(exhaustDirection + 3)];

// Mass-weighted centre in ship-local pixels for a given hex size. The ship turns around this point.
export function centerOfMass(ship: Ship, size: number, catalog: PartCatalog = PARTS): Point {
  let total = 0;
  let x = 0;
  let y = 0;
  for (const part of ship.values()) {
    const mass = catalog[part.type].mass;
    const p = hexToPixel(part.hex, size);
    total += mass;
    x += p.x * mass;
    y += p.y * mass;
  }
  return total > 0 ? { x: x / total, y: y / total } : { x: 0, y: 0 };
}

export function shipValue(ship: Ship, catalog: PartCatalog = PARTS): number {
  let total = 0;
  for (const part of ship.values()) total += catalog[part.type].cost;
  return total;
}

export function starterShip(catalog: PartCatalog = PARTS): Ship {
  let ship: Ship = new Map();
  ship = placePart(ship, hex(0, 0), "bridge", 0, catalog);
  ship = placePart(ship, hex(-1, 0), "engine", 3, catalog);
  ship = placePart(ship, hex(1, 0), "laser", 0, catalog);
  ship = placePart(ship, hex(0, 1), "cargo", 0, catalog);
  ship = placePart(ship, hex(0, -1), "fuel", 0, catalog);
  return ship;
}
