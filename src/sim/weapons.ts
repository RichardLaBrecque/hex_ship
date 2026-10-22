import { COMBAT, FLIGHT, type Combat } from "../data/balance";
import { PARTS, type PartCatalog, type WeaponStats } from "../data/parts";
import { directionAngle, type Point } from "../hex/hex";
import type { PlacedPart } from "../ship/ship";
import type { Body } from "./physics";
import { hexWorld, keyAtWorld, type Side, type Vessel } from "./vessel";

export type Mount = { x: number; y: number; angle: number }; // world position and barrel direction

export type Projectile = {
  kind: "shell" | "missile";
  side: Side; // who fired it; it only hits the other side
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number; // seconds left before it burns out
  target: Vessel; // missiles steer toward this
};

export type Beam = { from: Point; to: Point; age: number };

// A beam that hit something reports what it hit so the caller can apply damage.
export type BeamShot = { beam: Beam; target: Vessel; key: string | undefined; damage: number };

export function mountOf(v: Vessel, part: PlacedPart, size: number = FLIGHT.hexSize): Mount {
  const p = hexWorld(v, part, size);
  return { x: p.x, y: p.y, angle: v.body.angle + directionAngle(part.rotation) };
}

// Wraps an angle difference into -π..π.
export const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// The direction to fire so a projectile meets a target moving in a straight line.
// One step of lead is plenty at these speeds; beams need none.
export function aimPoint(from: Point, target: Body, speed: number): Point {
  if (speed <= 0) return { x: target.x, y: target.y };
  const time = Math.hypot(target.x - from.x, target.y - from.y) / speed;
  return { x: target.x + target.vx * time, y: target.y + target.vy * time };
}

// The bearing to fire along, or null when the point is out of range or outside the firing arc.
export function bearingTo(mount: Mount, weapon: WeaponStats, point: Point): number | null {
  const dx = point.x - mount.x;
  const dy = point.y - mount.y;
  if (Math.hypot(dx, dy) > weapon.range) return null;
  const bearing = Math.atan2(dy, dx);
  return Math.abs(angleDiff(bearing, mount.angle)) <= (weapon.arc * Math.PI) / 180 ? bearing : null;
}

// Shots per second after damage and crew shortages.
export const fireRate = (v: Vessel, part: PlacedPart, catalog: PartCatalog = PARTS): number => {
  const def = catalog[part.type];
  return (def.weapon?.fireRate ?? 0) * (part.hp / def.maxHp) * v.stats.efficiency;
};

// The range at which every weapon aboard can reach: the shortest weapon range, or 0 for an unarmed ship.
export function weaponRange(v: Vessel, catalog: PartCatalog = PARTS): number {
  let range = Infinity;
  for (const part of v.ship.values()) range = Math.min(range, catalog[part.type].weapon?.range ?? Infinity);
  return range === Infinity ? 0 : range;
}

export type Volley = { projectiles: Projectile[]; beams: BeamShot[] };

// Counts down reloads and fires every loaded weapon that can bear on a target.
// Each weapon shoots at the first target in `targets` it can reach.
export function fireWeapons(
  v: Vessel,
  targets: readonly Vessel[],
  dt: number,
  size: number = FLIGHT.hexSize,
  catalog: PartCatalog = PARTS,
  tuning: Combat = COMBAT,
  random: () => number = Math.random,
): Volley {
  const volley: Volley = { projectiles: [], beams: [] };
  for (const [key, part] of v.ship) {
    const weapon = catalog[part.type].weapon;
    if (!weapon) continue;
    const reload = (v.reload.get(key) ?? 0) - dt;
    v.reload.set(key, Math.max(0, reload));
    const rate = fireRate(v, part, catalog);
    if (reload > 0 || rate <= 0) continue;

    const mount = mountOf(v, part, size);
    for (const target of targets) {
      const aimed = bearingTo(mount, weapon, aimPoint(mount, target.body, weapon.speed));
      if (aimed === null) continue;
      const bearing = aimed + (random() * 2 - 1) * ((v.aimError * Math.PI) / 180);
      if (weapon.kind === "beam") {
        volley.beams.push(traceBeam(mount, bearing, weapon, target, size));
      } else {
        const life = weapon.kind === "missile" ? (weapon.range / weapon.speed) * tuning.missileLifeFactor : weapon.range / weapon.speed;
        volley.projectiles.push({
          kind: weapon.kind,
          side: v.side,
          x: mount.x,
          y: mount.y,
          vx: Math.cos(bearing) * weapon.speed,
          vy: Math.sin(bearing) * weapon.speed,
          damage: weapon.damage,
          life,
          target,
        });
      }
      v.reload.set(key, 1 / rate);
      break;
    }
  }
  return volley;
}

// Walks along the beam and stops at the first part of the target it crosses.
function traceBeam(mount: Mount, bearing: number, weapon: WeaponStats, target: Vessel, size: number): BeamShot {
  const step = size / 3;
  const dx = Math.cos(bearing);
  const dy = Math.sin(bearing);
  for (let d = 0; d <= weapon.range; d += step) {
    const point = { x: mount.x + dx * d, y: mount.y + dy * d };
    const key = keyAtWorld(target, point, size);
    if (key) return { beam: { from: mount, to: point, age: 0 }, target, key, damage: weapon.damage };
  }
  const end = { x: mount.x + dx * weapon.range, y: mount.y + dy * weapon.range };
  return { beam: { from: mount, to: end, age: 0 }, target, key: undefined, damage: 0 };
}

// Moves a projectile one step. Missiles turn toward their target, a little each step.
export function stepProjectile(p: Projectile, dt: number, tuning: Combat = COMBAT): Projectile {
  let { vx, vy } = p;
  if (p.kind === "missile" && p.target.ship.size > 0) {
    const heading = Math.atan2(vy, vx);
    const wanted = Math.atan2(p.target.body.y - p.y, p.target.body.x - p.x);
    const maxTurn = tuning.missileTurn * dt;
    const turned = heading + Math.max(-maxTurn, Math.min(maxTurn, angleDiff(wanted, heading)));
    const speed = Math.hypot(vx, vy);
    vx = Math.cos(turned) * speed;
    vy = Math.sin(turned) * speed;
  }
  return { ...p, x: p.x + vx * dt, y: p.y + vy * dt, vx, vy, life: p.life - dt };
}

// The vessel and hexKey a projectile has struck, if any.
export function projectileHit(p: Projectile, vessels: readonly Vessel[], size: number = FLIGHT.hexSize): { vessel: Vessel; key: string } | null {
  for (const vessel of vessels) {
    if (vessel.side === p.side) continue;
    const key = keyAtWorld(vessel, p, size);
    if (key) return { vessel, key };
  }
  return null;
}
