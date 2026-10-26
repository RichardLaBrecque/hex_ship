import { FLIGHT } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import { directionAngle, hexToPixel, type Point } from "../hex/hex";
import type { FlightTuning } from "../sim/physics";
import { centerOfMass, isExhaustBlocked, isMainEngine, type Ship } from "./ship";

// What the engines do together in one mode (thrusting or braking), at full power.
export type Thrust = {
  force: Point; // ship-local, in thrust units; +x is forward
  torque: number; // twist about the center of mass, thrust units × pixels; positive turns clockwise (right)
  fuelBurn: number; // fuel units per second
};

export type ShipStats = {
  mass: number;
  thrust: number; // forward thrust after facing, damage and crew efficiency
  acceleration: number;
  turnRate: number; // the gyro: how fast the ship can turn, and how hard it fights unwanted spin
  main: Thrust; // W: the main engines
  brake: Thrust; // S: retro engines at full power, plus the main engines reversed at reverseFactor
  inertia: number; // resistance to spinning: mass × pixels² about the center of mass
  hull: number;
  maxHull: number;
  shieldMax: number;
  shieldRegen: number;
  cargoCapacity: number;
  fuelCapacity: number;
  fuelBurn: number; // fuel units per second at full thrust, from engines that push forward
  crewCapacity: number;
  crewRequired: number;
  crew: number;
  efficiency: number; // 0..1, below 1 when under-crewed
  repair: number;
  dps: number;
  tractorRange: number; // pixels: the longest reach of any tractor beam aboard, 0 without one
  tractorPull: number; // pixels/s, after damage and crew efficiency
};

// Damaged parts work in proportion to their remaining HP.
// `crew` is how many crew are hired; it's capped at crew capacity.
// Engine pushes and twists are worked out at the flight hex size, from where each engine sits.
export function computeShipStats(ship: Ship, crew: number, catalog: PartCatalog = PARTS, tuning: FlightTuning = FLIGHT): ShipStats {
  let mass = 0;
  let crewRequired = 0;
  let crewCapacity = 0;
  for (const part of ship.values()) {
    const def = catalog[part.type];
    mass += def.mass;
    crewRequired += def.crewRequired;
    crewCapacity += def.crewCapacity;
  }

  const crewAboard = Math.min(crew, crewCapacity);
  const efficiency = crewRequired === 0 ? 1 : Math.min(1, crewAboard / crewRequired);

  const center = centerOfMass(ship, tuning.hexSize, catalog);
  const main = { fx: 0, fy: 0, torque: 0, fuelBurn: 0 };
  const retro = { fx: 0, fy: 0, torque: 0, fuelBurn: 0 };
  let inertia = 0;
  let turn = 0;
  let hull = 0;
  let maxHull = 0;
  let shieldMax = 0;
  let shieldRegen = 0;
  let cargoCapacity = 0;
  let fuelCapacity = 0;
  let repair = 0;
  let dps = 0;
  let tractorRange = 0;
  let tractorPull = 0;
  for (const part of ship.values()) {
    const def = catalog[part.type];
    const health = part.hp / def.maxHp;
    const p = hexToPixel(part.hex, tuning.hexSize);
    const arm = { x: p.x - center.x, y: p.y - center.y };
    // Each part spins like a small disc of its own, so even a one-part ship has some inertia.
    inertia += def.mass * (arm.x * arm.x + arm.y * arm.y + (tuning.hexSize * tuning.hexSize) / 2);
    hull += part.hp;
    maxHull += def.maxHp;
    shieldMax += def.shield * health;
    shieldRegen += def.shieldRegen * health * efficiency;
    cargoCapacity += def.cargo;
    fuelCapacity += def.fuelCapacity;
    repair += def.repair * health;
    tractorRange = Math.max(tractorRange, def.tractorRange);
    tractorPull += def.tractorPull * health * efficiency;
    if (def.weapon) dps += def.weapon.damage * def.weapon.fireRate * health * efficiency;
    if (part.type === "engine" && !isExhaustBlocked(ship, part)) {
      turn += def.turn * health * efficiency;
      // The ship is pushed opposite the exhaust, from where the engine sits.
      const push = directionAngle(part.rotation) + Math.PI;
      const strength = def.thrust * health * efficiency;
      const fx = Math.cos(push) * strength;
      const fy = Math.sin(push) * strength;
      const into = isMainEngine(part) ? main : retro;
      into.fx += fx;
      into.fy += fy;
      into.torque += arm.x * fy - arm.y * fx;
      into.fuelBurn += def.fuelBurn;
    }
  }
  const reverse = tuning.reverseFactor;
  const forward: Thrust = { force: { x: main.fx, y: main.fy }, torque: main.torque, fuelBurn: main.fuelBurn };
  const brake: Thrust = {
    force: { x: retro.fx - main.fx * reverse, y: retro.fy - main.fy * reverse },
    torque: retro.torque - main.torque * reverse,
    fuelBurn: retro.fuelBurn + main.fuelBurn * reverse,
  };

  return {
    mass,
    thrust: forward.force.x,
    acceleration: mass > 0 ? forward.force.x / mass : 0,
    turnRate: mass > 0 ? turn / mass : 0,
    main: forward,
    brake,
    inertia,
    hull,
    maxHull,
    shieldMax,
    shieldRegen,
    cargoCapacity,
    fuelCapacity,
    fuelBurn: forward.fuelBurn,
    crewCapacity,
    crewRequired,
    crew: crewAboard,
    efficiency,
    repair,
    dps,
    tractorRange,
    tractorPull,
  };
}
