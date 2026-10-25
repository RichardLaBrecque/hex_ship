import { COMBAT } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { fromKey, hexDistance } from "../hex/hex";
import type { Ship } from "./ship";

// The charge held by each shield generator, by its hexKey.
export type Shields = Map<string, number>;

// The charge each generator can hold. Damaged generators hold less.
export function shieldCapacity(ship: Ship, catalog: PartCatalog = PARTS): Shields {
  const capacity: Shields = new Map();
  for (const [key, part] of ship) {
    const def = catalog[part.type];
    if (def.shield > 0) capacity.set(key, def.shield * (part.hp / def.maxHp));
  }
  return capacity;
}

// Generators whose bubble reaches the part at `key`: those within `reach` hexes of it.
export function coveringShields(ship: Ship, key: string, reach: number = COMBAT.shieldReach, catalog: PartCatalog = PARTS): string[] {
  const struck = fromKey(key);
  const covering: string[] = [];
  for (const [k, part] of ship) {
    if (catalog[part.type].shield > 0 && hexDistance(part.hex, struck) <= reach) covering.push(k);
  }
  return covering;
}

// The covering generators soak up the hit, fullest first. Each point of damage drains `cost` charge,
// so a cost below 1 makes the shield stronger against that hit. Returns the new charges and the damage that gets through.
export function absorbWithShields(shields: Shields, covering: readonly string[], amount: number, cost: number): { shields: Shields; leftover: number } {
  const next = new Map(shields);
  let leftover = amount;
  const fullestFirst = [...covering].sort((a, b) => (next.get(b) ?? 0) - (next.get(a) ?? 0));
  for (const key of fullestFirst) {
    if (leftover <= 0) break;
    const charge = next.get(key) ?? 0;
    const drain = Math.min(charge, leftover * cost);
    next.set(key, charge - drain);
    leftover = drain === charge ? leftover - drain / cost : 0;
  }
  return { shields: next, leftover };
}

// Each generator recharges at its own rate, scaled by its health and the crew, up to what it can hold.
// Generators that are gone lose their charge.
export function rechargeShields(shields: Shields, ship: Ship, efficiency: number, dt: number, catalog: PartCatalog = PARTS): Shields {
  const next: Shields = new Map();
  for (const [key, max] of shieldCapacity(ship, catalog)) {
    const part = ship.get(key)!;
    const def = catalog[part.type];
    const regen = def.shieldRegen * (part.hp / def.maxHp) * efficiency;
    next.set(key, Math.min(max, (shields.get(key) ?? 0) + regen * dt));
  }
  return next;
}

// Keeps each generator's charge within what it can hold now, dropping generators that are gone.
export function clampShields(shields: Shields, ship: Ship, catalog: PartCatalog = PARTS): Shields {
  return rechargeShields(shields, ship, 0, 0, catalog);
}

export const totalShield = (shields: Shields): number => [...shields.values()].reduce((sum, charge) => sum + charge, 0);
