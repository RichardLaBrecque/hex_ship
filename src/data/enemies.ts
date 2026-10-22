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
];

export const ENCOUNTERS = {
  at: [0.4], // an enemy appears when the player has flown these shares of the route (one per trip until danger scaling)
  spawnDistance: 1100, // pixels ahead of the player
  spawnSpread: 60, // degrees either side of the route
  despawnDistance: 3000, // a fleeing enemy this far away is gone, and pays no bounty
};

export const AI = {
  engageShare: 0.85, // starts attacking inside this share of its weapon range
  closeShare: 0.4, // backs off inside this share of its weapon range
  orbitOffset: 20, // degrees off a straight line at the target, so it circles while firing
  fleeHull: 0.35, // flees below this share of its starting hull
  steering: 3, // how hard it turns toward its heading
};

export type Ai = typeof AI;
