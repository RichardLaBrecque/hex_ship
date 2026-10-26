// Enemy ships are built from the same parts the player buys. Rebalance here.
import type { PartId } from "./parts";

export type CorePart = { q: number; r: number; type: PartId; rotation: number };

export type EnemyTier = {
  name: string;
  budget: { min: number; max: number }; // total part cost
  core: readonly CorePart[]; // always fitted first: enough to fly and fight
  extras: readonly PartId[]; // bought at random with what's left, as long as the ship stays spaceworthy
  aimError: number; // degrees either side of a perfect shot; better pilots in higher tiers
};

export const ENEMY_TIERS: readonly EnemyTier[] = [
  {
    // About as strong as the starter ship ($400 of parts), with cannons as its only weapons.
    // tests/balance.test.ts holds every tier-1 build to within 15% of the starter ship's value.
    name: "Raider",
    budget: { min: 360, max: 440 },
    core: [
      { q: 0, r: 0, type: "bridge", rotation: 0 },
      { q: -1, r: 0, type: "engine", rotation: 3 },
      { q: 0, r: -1, type: "fuel", rotation: 0 },
      { q: 1, r: 0, type: "cannon", rotation: 0 },
    ],
    extras: ["armor", "cargo", "fuel", "crew", "cannon", "engine"],
    // Rookie pilots. With perfect aim a raider beat the starter ship in every simulated duel.
    aimError: 10,
  },
  {
    // A cannon and a laser, with a crew module to man them both.
    name: "Gunship",
    budget: { min: 700, max: 900 },
    core: [
      { q: 0, r: 0, type: "bridge", rotation: 0 },
      { q: -1, r: 0, type: "engine", rotation: 3 },
      { q: 0, r: -1, type: "fuel", rotation: 0 },
      { q: 0, r: 1, type: "crew", rotation: 0 },
      { q: 1, r: 0, type: "cannon", rotation: 0 },
      { q: 1, r: -1, type: "laser", rotation: 0 },
    ],
    extras: ["armor", "cargo", "fuel", "crew", "cannon", "laser", "engine"],
    aimError: 7,
  },
  {
    // Twin engines and a shield, and it can buy missiles.
    name: "Warship",
    budget: { min: 1300, max: 1700 },
    core: [
      { q: 0, r: 0, type: "bridge", rotation: 0 },
      { q: -1, r: 0, type: "engine", rotation: 3 },
      { q: -1, r: 1, type: "engine", rotation: 3 },
      { q: 0, r: -1, type: "fuel", rotation: 0 },
      { q: 0, r: 1, type: "crew", rotation: 0 },
      { q: -1, r: -1, type: "shield", rotation: 0 },
      { q: 1, r: 0, type: "cannon", rotation: 0 },
      { q: 1, r: -1, type: "laser", rotation: 0 },
    ],
    extras: ["armor", "fuel", "crew", "cannon", "laser", "missile", "engine"],
    aimError: 5,
  },
];

// The boss on every few trips at top danger. Its budget is set from the player's ship (see bossTier).
export const BOSS: EnemyTier = {
  name: "Flagship",
  budget: { min: 0, max: 0 },
  core: [
    { q: 0, r: 0, type: "bridge", rotation: 0 },
    { q: -1, r: 0, type: "engine", rotation: 3 },
    { q: -1, r: 1, type: "engine", rotation: 3 },
    { q: 0, r: -1, type: "fuel", rotation: 0 },
    { q: 0, r: 1, type: "crew", rotation: 0 },
    { q: -1, r: -1, type: "shield", rotation: 0 },
    { q: 1, r: 0, type: "cannon", rotation: 0 },
    { q: 1, r: -1, type: "laser", rotation: 0 },
    { q: 1, r: 1, type: "missile", rotation: 0 },
  ],
  extras: ["armor", "fuel", "crew", "shield", "cannon", "laser", "missile", "engine"],
  aimError: 3,
};

// One encounter: when it triggers, and the tier (1-based) of each enemy it keeps active, plus the boss if `boss`.
// An enemy destroyed or escaped is replaced after ENCOUNTERS.respawnDelay, so the counts are enemies active at once.
// The boss is never replaced once destroyed, and never escapes.
// `at` is how far out the ship is, as a share of the distance from the planet it left to that planet's nearest neighbour.
export type Encounter = { at: number; enemies: readonly number[]; boss?: boolean };

// Danger tier = the higher of a ship-value tier and a notoriety (kills) tier.
// Each danger tier sets the encounters on every trip. Encounters add up: after the last one triggers,
// every enemy from all of them is active at once.
export const DANGER = {
  valueCheckpoints: [700, 1200, 2000, 3200], // ship value at launch for danger 2, 3, 4 and 5
  dropBuffer: 100, // ship value must fall this far under a checkpoint before danger drops back
  killsPerTier: 8, // every this many kills adds a notoriety tier
  levels: [
    [{ at: 0.4, enemies: [1] }],
    [
      { at: 0.3, enemies: [1] },
      { at: 0.65, enemies: [1, 1] },
    ],
    [
      { at: 0.3, enemies: [2] },
      { at: 0.65, enemies: [1, 2] },
    ],
    [
      { at: 0.25, enemies: [2] },
      { at: 0.5, enemies: [2, 2] },
      { at: 0.75, enemies: [3] },
    ],
    [
      { at: 0.25, enemies: [3] },
      { at: 0.5, enemies: [2, 3] },
      { at: 0.75, enemies: [3, 3] },
    ],
  ] as readonly (readonly Encounter[])[],
  // At top danger every `every`th trip (counting trips that arrived) is a boss trip, flying these encounters instead.
  // A boss trip that arrives without destroying the boss doesn't count, so the next trip is a boss trip too.
  // Every trip carrying the Grand Haul is a boss trip.
  boss: {
    every: 3,
    valueShare: 0.8, // the boss's parts cost this share of the player's ship value
    guardRange: 3000, // carrying the Grand Haul, the boss waits at its destination instead, arriving once the ship is this close
    encounters: [
      { at: 0.3, enemies: [3] },
      { at: 0.7, enemies: [], boss: true },
    ] as readonly Encounter[],
  },
};

// The boss built to fight a player ship worth `shipValue`.
export const bossTier = (shipValue: number, danger: Danger = DANGER): EnemyTier => {
  const budget = shipValue * danger.boss.valueShare;
  return { ...BOSS, budget: { min: budget, max: budget } };
};

export type Danger = typeof DANGER;

export const ENCOUNTERS = {
  spawnDistance: 1100, // pixels ahead of the player
  spawnSpread: 60, // degrees either side of the route
  despawnDistance: 3000, // a fleeing enemy this far away is gone, and pays no bounty
  respawnDelay: 6, // seconds before an enemy destroyed or escaped is replaced
  respawnDistance: 1400, // pixels from the player, in any direction, that a replacement arrives
};

export const AI = {
  engageShare: 0.85, // starts attacking inside this share of its weapon range
  closeShare: 0.4, // backs off inside this share of its weapon range
  orbitOffset: 20, // degrees off a straight line at the target, so it circles while firing
  fleeHull: 0.35, // flees below this share of its starting hull
  steering: 3, // how hard it turns toward its heading
};

export type Ai = typeof AI;
