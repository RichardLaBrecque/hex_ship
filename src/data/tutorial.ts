// The tutorial: two short scripted runs before the first real one. Rewrite the story or retune the ships here.
import type { CorePart, Encounter, EnemyTier } from "./enemies";

// A scripted flight: these encounters and no others, enemies that aren't replaced once gone, and only `to` to dock at.
export type FlightScript = {
  to: number; // index into PLANETS
  encounters: readonly Encounter[];
  tiers: readonly EnemyTier[]; // what the encounters' enemy levels mean, 1-based, in place of ENEMY_TIERS
  hint: { keys: readonly string[]; touch: readonly string[] }; // what to do: short lines at the top of the screen
};

// One run of the tutorial: a demo ship, the cargo it carries, the briefing before launch and the flight itself.
export type TutorialLeg = {
  title: string;
  shipName: string;
  ship: readonly CorePart[];
  from: number; // index into PLANETS
  cargo: { name: string; units: number } | null;
  briefing: readonly string[]; // paragraphs
  flight: FlightScript;
};

const AVALON = 0;
const ERIS = 4; // Avalon's nearest neighbor, and Avalon is Eris's (tests/tutorial.test.ts)

// A real Raider's core with no extras and shakier aim, so a first fight is one a new pilot can win.
const TRAINING_RAIDER: EnemyTier = {
  name: "Raider",
  budget: { min: 0, max: 0 },
  core: [
    { q: 0, r: 0, type: "bridge", rotation: 0 },
    { q: -1, r: 0, type: "engine", rotation: 3 },
    { q: 0, r: -1, type: "fuel", rotation: 0 },
    { q: 1, r: 0, type: "cannon", rotation: 0 },
  ],
  extras: [],
  aimError: 14,
};

export const TUTORIAL: { legs: readonly TutorialLeg[]; finale: { title: string; paragraphs: readonly string[] } } = {
  legs: [
    {
      title: "Cutting your teeth",
      // Built like the starter ship, with a second cargo bay where its laser goes.
      shipName: "the Mule, a demo hauler",
      ship: [
        { q: 0, r: 0, type: "bridge", rotation: 0 },
        { q: -1, r: 0, type: "engine", rotation: 3 },
        { q: 0, r: -1, type: "fuel", rotation: 0 },
        { q: 0, r: 1, type: "cargo", rotation: 0 },
        { q: 1, r: 0, type: "cargo", rotation: 0 },
      ],
      from: AVALON,
      cargo: { name: "Medical supplies", units: 20 },
      briefing: [
        "You're the newest captain in the system: license still warm, and no ship to your name.",
        "The Avalon yard will lend you the Mule for one run. It's a demo hauler with no guns. The lane to Eris is quiet, so you won't need any.",
        "Take 20 units of medical supplies to Eris. Learn how the Mule handles: it drifts, so brake early and come into the dock ring slowly.",
      ],
      flight: {
        to: ERIS,
        encounters: [],
        tiers: [],
        hint: {
          keys: ["Fly to Eris: follow the green arrow", "W thrust · A D turn · S brake", "Slow down inside the ring to dock"],
          touch: ["Fly to Eris: follow the green arrow", "Hold the buttons to thrust, turn and brake", "Slow down inside the ring to dock"],
        },
      },
    },
    {
      title: "The trip home",
      shipName: "the Wasp, a small gunship",
      ship: [
        { q: 0, r: 0, type: "bridge", rotation: 0 },
        { q: -1, r: 0, type: "engine", rotation: 3 },
        { q: 0, r: -1, type: "fuel", rotation: 0 },
        { q: 0, r: 1, type: "crew", rotation: 0 },
        { q: 1, r: 0, type: "cannon", rotation: 0 },
        { q: 1, r: -1, type: "laser", rotation: 0 },
      ],
      from: ERIS,
      cargo: null,
      briefing: [
        "The supplies are in. Eris's yard has finished the Wasp, a small gunship built for the Avalon yard, and someone has to fly it home.",
        "Deliver it to Avalon and the yard will call it a fair trade for a ship of your own.",
        "Raiders have been working the Avalon lane. The Wasp's cannon and laser fire on their own at anything in range ahead, so keep its nose on the target and keep moving.",
      ],
      flight: {
        to: AVALON,
        encounters: [{ at: 0.35, enemies: [1] }],
        tiers: [TRAINING_RAIDER],
        hint: {
          keys: ["Take the Wasp home to Avalon", "Weapons fire on their own at anything ahead", "Point the nose at the raider (red arrow)"],
          touch: ["Take the Wasp home to Avalon", "Weapons fire on their own at anything ahead", "Point the nose at the raider (red arrow)"],
        },
      },
    },
  ],
  finale: {
    title: "A ship of your own",
    paragraphs: [
      "Avalon Shipyards honor the deal: a ship of your very own. It isn't much, but with a little grit, the stars are yours.",
      "Raiders have grown bolder these last few years, preying on the weak. Will you rise to meet them, and bring down the bandit king's Flagship?",
      "Or will you be the first merchant to complete the fabled Grand Haul? It's a contract so rich that only the very best captains are ever offered it.",
    ],
  },
};
