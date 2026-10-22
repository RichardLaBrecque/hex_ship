import type { PartCatalog, PartDef, PartId } from "../src/data/parts";

// Round, test-only numbers so expected values are easy to work out by hand.
function def(id: PartId, overrides: Partial<PartDef>): PartDef {
  return {
    id,
    name: id.toUpperCase(),
    description: "",
    color: "#000",
    cost: 0,
    mass: 0,
    maxHp: 10,
    crewRequired: 0,
    crewCapacity: 0,
    thrust: 0,
    turn: 0,
    cargo: 0,
    fuelCapacity: 0,
    fuelBurn: 0,
    shield: 0,
    shieldRegen: 0,
    repair: 0,
    weapon: null,
    ...overrides,
  };
}

export const TEST_PARTS: PartCatalog = {
  bridge: def("bridge", { mass: 10, maxHp: 50, crewRequired: 1, crewCapacity: 2 }),
  engine: def("engine", { cost: 100, mass: 10, maxHp: 20, crewRequired: 1, thrust: 40, turn: 20, fuelBurn: 2 }),
  fuel: def("fuel", { cost: 20, mass: 5, fuelCapacity: 30 }),
  crew: def("crew", { cost: 50, mass: 5, crewCapacity: 4, repair: 2 }),
  laser: def("laser", { cost: 100, mass: 5, crewRequired: 1, weapon: { damage: 5, fireRate: 2, range: 100, arc: 45 } }),
  cannon: def("cannon", { mass: 5, crewRequired: 1, weapon: { damage: 10, fireRate: 1, range: 100, arc: 30 } }),
  missile: def("missile", { mass: 5, crewRequired: 1, weapon: { damage: 20, fireRate: 1, range: 100, arc: 90 } }),
  cargo: def("cargo", { cost: 10, mass: 5, cargo: 10 }),
  armor: def("armor", { mass: 20, maxHp: 100 }),
  shield: def("shield", { mass: 5, crewRequired: 1, shield: 40, shieldRegen: 4 }),
};
