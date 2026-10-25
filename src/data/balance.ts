// Tunable numbers that aren't per-part. Rebalance here.

export const FLIGHT = {
  hexSize: 12, // pixels per hex when flying
  thrustScale: 30, // ship acceleration stat → pixels/s²
  reverseFactor: 0.25, // braking runs the main engines in reverse at this share; retro engines add full power on top
  turnScale: 1.2, // ship turn-rate stat → radians/s
  gyroResponse: 4, // per second: how hard the gyro corrects spin; higher snaps to the asked-for turn faster and resists engine twist more
  torqueScale: 1, // how strongly off-centre engines twist the ship; 0 turns the effect off
  spinDrag: 1, // per second; slows spin on its own, so a ship that overpowers its gyro spins steadily instead of ever faster
  drag: 0.14, // per second; lower is slidier. A coasting ship halves its speed every ln 2 / drag ≈ 5 s. Top speed ≈ acceleration × thrustScale / drag
  dockSpeed: 80, // must be slower than this (pixels/s) to dock
};

export const COMBAT = {
  missileTurn: 2.5, // radians/s a missile can steer
  missileLifeFactor: 1.5, // missiles fly this many times their range before burning out
  beamFlash: 0.08, // seconds a laser beam stays on screen
  debrisLife: 4, // seconds a broken-off part drifts before fading out
  debrisSpeed: 40, // pixels/s of random drift added to broken-off parts
  wreckDelay: 2, // seconds between losing the core and the Game Over screen
  ramBounce: 0.4, // share of the closing speed ships keep when they bounce apart; 0 sticks together, 1 is fully elastic
  ramSafeSpeed: 60, // pixels/s; ships closing slower than this bump without damage
  ramDamage: 0.12, // damage to each of the two parts that struck, per pixel/s of closing speed above ramSafeSpeed
  shieldReach: 2, // a shield generator covers parts up to this many hexes away
  // Rock/paper/scissors, by what struck the ship. Lasers also shoot down missiles and shells (laser `intercept` in parts.ts).
  // Shield charge drained per point of damage: how fast each hit depletes a shield, not how hard it hits the part.
  // Cannons drain shields twice as fast; missiles drain them at a quarter of the rate.
  shieldDrain: { beam: 1, shell: 2, missile: 0.25, ram: 1 },
  // Damage multiplier against Armor Plate: lasers bounce off it, and missiles crack it.
  armorDamage: { beam: 0.25, shell: 1, missile: 2, ram: 1 },
};

export type Combat = typeof COMBAT;

export type Planet = { name: string; x: number; y: number; radius: number; dockRadius: number; color: string };

// Every planet's nearest neighbour is close enough for the starter ship to reach and come back (tests/balance.test.ts).
export const PLANETS: readonly Planet[] = [
  { name: "Avalon", x: 0, y: 0, radius: 160, dockRadius: 320, color: "#3f8fd0" },
  { name: "Brask", x: 7600, y: -2800, radius: 130, dockRadius: 290, color: "#c8743a" },
  { name: "Cinder", x: -6400, y: 4400, radius: 120, dockRadius: 280, color: "#d0503f" },
  { name: "Dorne", x: 14400, y: 1200, radius: 150, dockRadius: 310, color: "#7fb069" },
  { name: "Eris", x: 2400, y: 7200, radius: 110, dockRadius: 270, color: "#b58ad8" },
  { name: "Fallow", x: -4800, y: -6000, radius: 140, dockRadius: 300, color: "#c9b458" },
  { name: "Gault", x: 20000, y: -4000, radius: 170, dockRadius: 330, color: "#5fb8c2" },
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
  openShare: 0.25, // chance an offer is an open contract: delivered to any other planet, at a low fixed rate
  openPayShare: 0.5, // an open contract pays this share of its tier's pay, however far it goes
  dumpPenaltyShare: 0.1, // dumping a contract short of its destination costs this share of its pay
  dumpReputationLoss: 3, // ...and takes this many deliveries off your reputation
  payDistance: 8000, // pixels, about one hop to a nearest neighbour; a contract this far pays its tier's pay, and farther pays more in proportion
  payBonusPerDelivery: 0.03, // reputation: every contract delivered adds 3% to contract pay
  topTierShare: 0.5, // chance an offer comes from your best unlocked contract tier rather than any unlocked tier
  // Delivering contracts earns reputation ranks, and each rank unlocks a contract tier.
  // Higher tiers pay more per unit but need bigger holds (tests/balance.test.ts).
  contractTiers: [
    { rank: "Unknown", unlockAt: 0, units: { min: 3, max: 10 }, pay: { min: 10, max: 20 } },
    { rank: "Known", unlockAt: 5, units: { min: 12, max: 25 }, pay: { min: 18, max: 30 } },
    { rank: "Trusted", unlockAt: 15, units: { min: 25, max: 45 }, pay: { min: 28, max: 45 } },
    { rank: "Renowned", unlockAt: 30, units: { min: 40, max: 70 }, pay: { min: 40, max: 65 } },
  ],
  // The Grand Haul: a huge contract on the board at each of the two planets farthest apart, bound for the other,
  // once reputation reaches the top rank. It needs so many cargo bays that little room is left for weapons
  // (tests/balance.test.ts shows a ship can carry it), and carrying it puts danger at the top level (see dangerTier).
  grandHaul: { units: 500, basePay: 30 }, // basePay: per unit at payDistance, scaled by distance and reputation like any routed contract
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
