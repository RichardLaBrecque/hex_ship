import { COMBAT, FLIGHT } from "../data/balance";
import type { Salvage } from "../economy/salvage";
import type { Point } from "../hex/hex";

// Salvage drifting in space, waiting to be picked up. It slows down like a coasting ship and is lost after salvageLife.
export type Pickup = { salvage: Salvage; x: number; y: number; vx: number; vy: number; angle: number; spin: number; age: number };

export function stepPickups(pickups: readonly Pickup[], dt: number, drag: number = FLIGHT.drag, life: number = COMBAT.salvageLife): Pickup[] {
  const slow = Math.exp(-drag * dt);
  return pickups
    .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vx: p.vx * slow, vy: p.vy * slow, angle: p.angle + p.spin * dt, age: p.age + dt }))
    .filter((p) => p.age < life);
}

// The ship at `at` picks up the salvage within `reach` that fits in the `free` hold space, `units` each.
// `blocked` says salvage was in reach but the hold was full.
export function collectPickups(
  pickups: readonly Pickup[],
  at: Point,
  reach: number,
  free: number,
  units: number,
): { collected: Pickup[]; left: Pickup[]; blocked: boolean } {
  const collected: Pickup[] = [];
  const left: Pickup[] = [];
  let blocked = false;
  let room = free;
  for (const p of pickups) {
    const inReach = Math.hypot(p.x - at.x, p.y - at.y) <= reach;
    if (inReach && room >= units) {
      collected.push(p);
      room -= units;
    } else {
      if (inReach) blocked = true;
      left.push(p);
    }
  }
  return { collected, left, blocked };
}
