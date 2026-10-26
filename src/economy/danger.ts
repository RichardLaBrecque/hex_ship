import { DANGER, type Danger } from "../data/enemies";
import { PARTS, type PartCatalog } from "../data/parts";
import { shipValue } from "../ship/ship";
import type { Run } from "./run";
import { carriesGrandHaul } from "./victory";

// The ship-value tier. It rises as soon as a checkpoint is reached, but only drops back once the
// value falls `dropBuffer` under that checkpoint, so selling one part can't flip it back and forth.
export function valueTier(value: number, previous: number, danger: Danger = DANGER): number {
  const reached = 1 + danger.valueCheckpoints.filter((c) => value >= c).length;
  const kept = 1 + danger.valueCheckpoints.filter((c) => value >= c - danger.dropBuffer).length;
  return Math.max(reached, Math.min(previous, kept));
}

export const notorietyTier = (kills: number, danger: Danger = DANGER): number => 1 + Math.floor(kills / danger.killsPerTier);

// The danger tier a launch right now would fly at, capped at the highest defined level.
// Carrying the Grand Haul puts it at the top level.
export function dangerTier(run: Run, catalog: PartCatalog = PARTS, danger: Danger = DANGER): number {
  if (carriesGrandHaul(run)) return danger.levels.length;
  const byValue = valueTier(shipValue(run.ship, catalog), run.valueTier, danger);
  return Math.min(danger.levels.length, Math.max(byValue, notorietyTier(run.kills, danger)));
}

// Trips until the boss at top danger: 1 means the next launch meets it. Trips only count once they arrive.
// The boss meets every trip carrying the Grand Haul.
export const tripsToBoss = (run: Run, danger: Danger = DANGER): number =>
  carriesGrandHaul(run) ? 1 : danger.boss.every - (run.topTrips % danger.boss.every);

// The next launch flies at top danger and meets the boss.
export const isBossTrip = (run: Run, catalog: PartCatalog = PARTS, danger: Danger = DANGER): boolean =>
  dangerTier(run, catalog, danger) === danger.levels.length && tripsToBoss(run, danger) === 1;

export type DangerOutlook = {
  tier: number;
  nextValue: number | null; // ship value that raises danger, if any
  killsToNext: number | null; // more kills that raise danger, if any
  bossIn: number | null; // at top danger, trips until the boss (1 = the next one)
};

// What the station shows: the danger now and what would raise it, or at top danger, when the boss comes.
export function dangerOutlook(run: Run, catalog: PartCatalog = PARTS, danger: Danger = DANGER): DangerOutlook {
  const tier = dangerTier(run, catalog, danger);
  if (tier >= danger.levels.length) return { tier, nextValue: null, killsToNext: null, bossIn: tripsToBoss(run, danger) };
  return {
    tier,
    nextValue: danger.valueCheckpoints[tier - 1] ?? null,
    killsToNext: tier * danger.killsPerTier - run.kills,
    bossIn: null,
  };
}
