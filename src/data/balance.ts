// Tunable numbers that aren't per-part. Rebalance here.

export const FLIGHT = {
  hexSize: 12, // pixels per hex when flying
  thrustScale: 30, // ship acceleration stat → pixels/s²
  reverseFactor: 0.25, // braking runs the main engines in reverse at this share; retro engines add full power on top
  turnScale: 1.2, // ship turn-rate stat → radians/s
  gyroResponse: 4, // per second: how hard the gyro corrects spin; higher snaps to the asked-for turn faster and resists engine twist more
  torqueScale: 1, // how strongly off-centre engines twist the ship; 0 turns the effect off
  spinDrag: 1, // per second; slows spin on its own, so a ship that overpowers its gyro spins steadily instead of ever faster
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
