import { PARTS, type PartCatalog } from "../data/parts";
import { forwardFactor, isExhaustBlocked, type Ship } from "./ship";

export type ShipStats = {
  mass: number;
  thrust: number; // forward thrust after facing, damage and crew efficiency
  acceleration: number;
  turnRate: number;
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
};

// Damaged parts work in proportion to their remaining HP.
// `crew` is how many crew are hired; it's capped at crew capacity.
export function computeShipStats(ship: Ship, crew: number, catalog: PartCatalog = PARTS): ShipStats {
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

  let thrust = 0;
  let turn = 0;
  let hull = 0;
  let maxHull = 0;
  let shieldMax = 0;
  let shieldRegen = 0;
  let cargoCapacity = 0;
  let fuelCapacity = 0;
  let fuelBurn = 0;
  let repair = 0;
  let dps = 0;
  for (const part of ship.values()) {
    const def = catalog[part.type];
    const health = part.hp / def.maxHp;
    hull += part.hp;
    maxHull += def.maxHp;
    shieldMax += def.shield * health;
    shieldRegen += def.shieldRegen * health * efficiency;
    cargoCapacity += def.cargo;
    fuelCapacity += def.fuelCapacity;
    repair += def.repair * health;
    if (def.weapon) dps += def.weapon.damage * def.weapon.fireRate * health * efficiency;
    if (part.type === "engine" && !isExhaustBlocked(ship, part)) {
      thrust += def.thrust * forwardFactor(part.rotation) * health * efficiency;
      turn += def.turn * health * efficiency;
      if (forwardFactor(part.rotation) > 0) fuelBurn += def.fuelBurn;
    }
  }

  return {
    mass,
    thrust,
    acceleration: mass > 0 ? thrust / mass : 0,
    turnRate: mass > 0 ? turn / mass : 0,
    hull,
    maxHull,
    shieldMax,
    shieldRegen,
    cargoCapacity,
    fuelCapacity,
    fuelBurn,
    crewCapacity,
    crewRequired,
    crew: crewAboard,
    efficiency,
    repair,
    dps,
  };
}
