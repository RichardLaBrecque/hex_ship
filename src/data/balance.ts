// Tunable numbers that aren't per-part. Rebalance here.

export const FLIGHT = {
  hexSize: 12, // pixels per hex when flying
  thrustScale: 30, // ship acceleration stat → pixels/s²
  reverseFactor: 0.5, // braking strength as a share of forward thrust
  turnScale: 1.2, // ship turn-rate stat → radians/s
  drag: 0.3, // per second; lower is slidier. Top speed ≈ acceleration × thrustScale / drag
  dockSpeed: 80, // must be slower than this (pixels/s) to dock
};

export const COMBAT = {
  missileTurn: 2.5, // radians/s a missile can steer
  missileLifeFactor: 1.5, // missiles fly this many times their range before burning out
  beamFlash: 0.08, // seconds a laser beam stays on screen
  debrisLife: 4, // seconds a broken-off part drifts before fading out
  debrisSpeed: 40, // pixels/s of random drift added to broken-off parts
  wreckDelay: 2, // seconds between losing the core and the Game Over screen
};

export type Combat = typeof COMBAT;

export type Planet = { name: string; x: number; y: number; radius: number; dockRadius: number; color: string };

export const PLANETS: readonly [Planet, Planet] = [
  { name: "Avalon", x: 0, y: 0, radius: 160, dockRadius: 320, color: "#3f8fd0" },
  { name: "Brask", x: 3800, y: -1400, radius: 130, dockRadius: 290, color: "#c8743a" },
];

export const ECONOMY = {
  startingMoney: 600,
  startingCrew: 3,
  repairShare: 0.5, // repairing costs this share of the value the damage took off a part (must stay below 1)
  bridgeRepairPerHp: 2, // the bridge has no price, so it's repaired at a flat rate
  crewHireCost: 40, // one-off signing fee per crew member
  crewWage: 15, // per crew member, paid at every launch
  fuelPrice: 2, // per fuel unit when refuelling at a station
  towFee: 150, // charged for a tow back when you run dry mid-flight
  offersPerStation: 4,
  contractUnitsMin: 3,
  contractUnitsMax: 18,
  payPerUnitMin: 10,
  payPerUnitMax: 20,
  payGrowthPerDay: 0.03, // contract prices rise 3% a day
  bountyShare: 0.75, // a kill pays this share of the enemy ship's part value
};

export type Economy = typeof ECONOMY;

export const CARGO_NAMES: readonly string[] = [
  "Medical supplies",
  "Ore",
  "Machine parts",
  "Grain",
  "Luxury goods",
  "Water ice",
  "Electronics",
  "Colonist luggage",
];
