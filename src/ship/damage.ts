import { PARTS, type PartCatalog } from "../data/parts";
import type { PlacedPart, Ship } from "./ship";
import { connectedToBridge } from "./validate";

export type DamageResult = {
  ship: Ship;
  destroyed: PlacedPart | null; // the part that was hit, if it dropped to 0 hp
  detached: PlacedPart[]; // parts cut off from the bridge by its loss
};

// Damages the part in one hex. A part at 0 hp is destroyed, and anything no longer linked
// to the bridge breaks away. Losing the bridge itself breaks the whole ship apart.
export function damagePart(ship: Ship, key: string, amount: number): DamageResult {
  const part = ship.get(key);
  if (!part || amount <= 0) return { ship, destroyed: null, detached: [] };

  const next = new Map(ship);
  if (part.hp > amount) {
    next.set(key, { ...part, hp: part.hp - amount });
    return { ship: next, destroyed: null, detached: [] };
  }

  next.delete(key);
  const connected = connectedToBridge(next);
  const detached: PlacedPart[] = [];
  for (const [k, p] of next) {
    if (connected.has(k)) continue;
    detached.push(p);
    next.delete(k);
  }
  return { ship: next, destroyed: part, detached };
}

// Shields soak up damage first. Returns the shield left and the damage that gets through.
export function absorbWithShield(shield: number, amount: number): { shield: number; leftover: number } {
  const absorbed = Math.min(shield, amount);
  return { shield: shield - absorbed, leftover: amount - absorbed };
}

// Crew repairs are shared evenly across damaged parts, never past full hp.
// Returns the same ship when nothing needs fixing.
export function repairShip(ship: Ship, amount: number, catalog: PartCatalog = PARTS): Ship {
  const damaged = [...ship].filter(([, p]) => p.hp < catalog[p.type].maxHp);
  if (damaged.length === 0 || amount <= 0) return ship;

  const share = amount / damaged.length;
  const next = new Map(ship);
  for (const [key, part] of damaged) {
    next.set(key, { ...part, hp: Math.min(catalog[part.type].maxHp, part.hp + share) });
  }
  return next;
}
