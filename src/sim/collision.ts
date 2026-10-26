import { COMBAT, FLIGHT, type Combat } from "../data/balance";
import type { Point } from "../hex/hex";
import { hexWorld, type Vessel } from "./vessel";

// Where two ships touch: the pair of parts that overlap the most.
export type Contact = {
  aKey: string;
  bKey: string;
  point: Point; // halfway between the two parts' centers
  normal: Point; // unit vector from a's part toward b's
  depth: number; // pixels the parts overlap
};

// Parts count as touching once their centers are closer than neighboring hexes on one ship (√3 sizes).
export function findContact(a: Vessel, b: Vessel, size: number = FLIGHT.hexSize): Contact | null {
  if (a.ship.size === 0 || b.ship.size === 0) return null;
  if (Math.hypot(b.body.x - a.body.x, b.body.y - a.body.y) > a.radius + b.radius) return null;
  const reach = Math.sqrt(3) * size;
  const bParts = [...b.ship].map(([key, part]) => ({ key, at: hexWorld(b, part, size) }));
  let best: Contact | null = null;
  for (const [aKey, part] of a.ship) {
    const pa = hexWorld(a, part, size);
    for (const { key: bKey, at: pb } of bParts) {
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const gap = Math.hypot(dx, dy);
      const depth = reach - gap;
      if (depth <= 0 || (best && depth <= best.depth)) continue;
      // Parts sitting exactly on top of each other push apart along the line between the ships.
      const normal = gap > 0 ? { x: dx / gap, y: dy / gap } : directionBetween(a, b);
      best = { aKey, bKey, point: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, normal, depth };
    }
  }
  return best;
}

// Pushes two touching ships apart and trades momentum along the contact, the lighter ship moving more.
// Returns how fast they were closing in pixels/s, or 0 if they were already moving apart.
export function bounce(a: Vessel, b: Vessel, contact: Contact, tuning: Combat = COMBAT): number {
  const { normal: n, depth } = contact;
  const inverseA = 1 / a.stats.mass;
  const inverseB = 1 / b.stats.mass;
  const shareA = inverseA / (inverseA + inverseB);
  a.body = { ...a.body, x: a.body.x - n.x * depth * shareA, y: a.body.y - n.y * depth * shareA };
  b.body = { ...b.body, x: b.body.x + n.x * depth * (1 - shareA), y: b.body.y + n.y * depth * (1 - shareA) };

  const closing = (a.body.vx - b.body.vx) * n.x + (a.body.vy - b.body.vy) * n.y;
  if (closing <= 0) return 0;
  const impulse = ((1 + tuning.ramBounce) * closing) / (inverseA + inverseB);
  a.body = { ...a.body, vx: a.body.vx - impulse * inverseA * n.x, vy: a.body.vy - impulse * inverseA * n.y };
  b.body = { ...b.body, vx: b.body.vx + impulse * inverseB * n.x, vy: b.body.vy + impulse * inverseB * n.y };
  return closing;
}

// Damage each of the two parts that struck takes from a collision at this closing speed.
export const ramDamage = (closing: number, tuning: Combat = COMBAT): number => Math.max(0, closing - tuning.ramSafeSpeed) * tuning.ramDamage;

function directionBetween(a: Vessel, b: Vessel): Point {
  const dx = b.body.x - a.body.x;
  const dy = b.body.y - a.body.y;
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
}
