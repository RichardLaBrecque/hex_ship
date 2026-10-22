// Every placeable part and its balance numbers. Rebalancing means editing this file.
//
// A placed part's rotation is a hex direction index (0=E … 5=NE, clockwise).
// Ship-local "forward" is direction 0.
//   - Engines: rotation is the direction the exhaust points; the ship is pushed the opposite way.
//   - Weapons: rotation is the direction the barrel points.
//   - Everything else ignores rotation.

export type PartId = "bridge" | "engine" | "fuel" | "crew" | "laser" | "cannon" | "missile" | "cargo" | "armor" | "shield";

// beam: hits instantly along a line. shell: flies straight. missile: steers toward its target.
export type WeaponKind = "beam" | "shell" | "missile";

export type WeaponStats = {
  kind: WeaponKind;
  damage: number; // per shot
  fireRate: number; // shots per second
  range: number; // pixels
  arc: number; // half-angle of the firing arc, degrees
  speed: number; // projectile pixels per second; 0 for beams
  intercept: number; // incoming missiles it can shoot down per second; 0 if it can't
};

export type PartDef = {
  id: PartId;
  name: string;
  description: string;
  color: string;
  cost: number;
  mass: number;
  maxHp: number;
  crewRequired: number;
  crewCapacity: number;
  thrust: number;
  turn: number;
  cargo: number;
  fuelCapacity: number; // fuel units held
  fuelBurn: number; // fuel units per second at full thrust
  shield: number;
  shieldRegen: number; // per second
  repair: number; // hp per second spread across damaged parts
  weapon: WeaponStats | null;
};

export type PartCatalog = Record<PartId, PartDef>;

const BLANK = {
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
};

export const PARTS: PartCatalog = {
  bridge: {
    ...BLANK,
    id: "bridge",
    name: "Bridge",
    description: "The ship's core. Lose it and the run is over.",
    color: "#c9a227",
    cost: 0,
    mass: 10,
    maxHp: 60,
    crewRequired: 1,
    crewCapacity: 3,
  },
  engine: {
    ...BLANK,
    id: "engine",
    name: "Engine",
    description: "Thrust and turning. Burns fuel while thrusting. Needs an empty hex behind its exhaust.",
    color: "#d9622b",
    cost: 120,
    mass: 6,
    maxHp: 30,
    crewRequired: 1,
    thrust: 60,
    turn: 20,
    fuelBurn: 1,
  },
  fuel: {
    ...BLANK,
    id: "fuel",
    name: "Fuel Tank",
    description: "Stores fuel for the engines. Refuel at any station.",
    color: "#36b5a8",
    cost: 70,
    mass: 4,
    maxHp: 25,
    fuelCapacity: 55, // starter ship can fly 2× the planet gap on one tank (tests/balance.test.ts)
  },
  crew: {
    ...BLANK,
    id: "crew",
    name: "Crew Module",
    description: "Room for 4 crew. Crew slowly repair the ship in flight.",
    color: "#3fa36b",
    cost: 80,
    mass: 4,
    maxHp: 25,
    crewCapacity: 4,
    repair: 1,
  },
  laser: {
    ...BLANK,
    id: "laser",
    name: "Laser Pod",
    description: "Hits instantly and never misses. Short range. Shoots down incoming missiles first: one laser stops every other missile from a pod.",
    color: "#e0457b",
    cost: 150,
    mass: 3,
    maxHp: 20,
    crewRequired: 1,
    // intercept: half a missile pod's fire rate (tests/balance.test.ts)
    weapon: { kind: "beam", damage: 8, fireRate: 2, range: 350, arc: 45, speed: 0, intercept: 0.2 },
  },
  cannon: {
    ...BLANK,
    id: "cannon",
    name: "Cannon Pod",
    description: "Slow heavy shells with a narrow arc.",
    color: "#9a6fd6",
    cost: 130,
    mass: 5,
    maxHp: 25,
    crewRequired: 1,
    weapon: { kind: "shell", damage: 15, fireRate: 1, range: 450, arc: 30, speed: 520, intercept: 0 },
  },
  missile: {
    ...BLANK,
    id: "missile",
    name: "Missile Pod",
    description: "Long-range homing missiles. Slow to reload.",
    color: "#e8c547",
    cost: 220,
    mass: 4,
    maxHp: 20,
    crewRequired: 1,
    weapon: { kind: "missile", damage: 30, fireRate: 0.4, range: 600, arc: 90, speed: 300, intercept: 0 },
  },
  cargo: {
    ...BLANK,
    id: "cargo",
    name: "Cargo Bay",
    description: "Holds 10 units of cargo.",
    color: "#7a8899",
    cost: 60,
    mass: 3,
    maxHp: 25,
    cargo: 10,
  },
  armor: {
    ...BLANK,
    id: "armor",
    name: "Armor Plate",
    description: "Lots of HP. Heavy. Does nothing else.",
    color: "#56606e",
    cost: 40,
    mass: 8,
    maxHp: 80,
  },
  shield: {
    ...BLANK,
    id: "shield",
    name: "Shield Generator",
    description: "Adds a regenerating shield that absorbs hits first.",
    color: "#3d8fd6",
    cost: 250,
    mass: 5,
    maxHp: 20,
    crewRequired: 1,
    shield: 50,
    shieldRegen: 5,
  },
};

// Parts the player can buy and place, in palette order (hotkeys 1-9).
export const BUILDABLE: readonly PartId[] = ["engine", "fuel", "crew", "laser", "cannon", "missile", "cargo", "armor", "shield"];
