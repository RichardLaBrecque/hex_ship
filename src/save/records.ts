import type { Run } from "../economy/run";
import type { Win } from "../economy/victory";
import { browserStore, parseJson, type Store } from "./store";

// The high score: the best of each score column, plus the most recent finished runs.
export const RECORDS_KEY = "hex-ship/records";
export const RECENT_RUNS = 8;

// One finished run's score columns, the day it ended on, and how it was won if it was. Records saved before
// wins existed have no `win`.
export type Score = { day: number; peakShipValue: number; cargoEarned: number; bountiesEarned: number; win?: Win };

export type Records = { best: Score; recent: Score[] }; // recent: newest first

// Which columns a run set a new best in.
export type NewBests = { peakShipValue: boolean; cargoEarned: boolean; bountiesEarned: boolean };

const EMPTY: Records = { best: { day: 0, peakShipValue: 0, cargoEarned: 0, bountiesEarned: 0 }, recent: [] };

export const scoreOf = (run: Run, win?: Win): Score => ({
  day: run.day,
  peakShipValue: run.peakShipValue,
  cargoEarned: run.cargoEarned,
  bountiesEarned: run.bountiesEarned,
  ...(win ? { win } : {}),
});

// Adds a finished run. Each column of `best` keeps its own maximum, so the bests can come from different runs.
export function addScore(records: Records, score: Score, keep: number = RECENT_RUNS): { records: Records; newBests: NewBests } {
  const { best } = records;
  const newBests = {
    peakShipValue: score.peakShipValue > best.peakShipValue,
    cargoEarned: score.cargoEarned > best.cargoEarned,
    bountiesEarned: score.bountiesEarned > best.bountiesEarned,
  };
  return {
    records: {
      best: {
        // The bests mix columns from different runs, so they don't carry a win.
        day: Math.max(best.day, score.day),
        peakShipValue: Math.max(best.peakShipValue, score.peakShipValue),
        cargoEarned: Math.max(best.cargoEarned, score.cargoEarned),
        bountiesEarned: Math.max(best.bountiesEarned, score.bountiesEarned),
      },
      recent: [score, ...records.recent].slice(0, keep),
    },
    newBests,
  };
}

// The saved records, or empty ones if there are none or they can't be read.
export function loadRecords(store: Store = browserStore()): Records {
  const records = parseJson(store.get(RECORDS_KEY)) as Records | null;
  if (!records || !isScore(records.best) || !Array.isArray(records.recent) || !records.recent.every(isScore)) return EMPTY;
  return records;
}

export function saveRecords(records: Records, store: Store = browserStore()): void {
  store.set(RECORDS_KEY, JSON.stringify(records));
}

const isScore = (s: Score): boolean =>
  typeof s === "object" &&
  s !== null &&
  Number.isFinite(s.day) &&
  Number.isFinite(s.peakShipValue) &&
  Number.isFinite(s.cargoEarned) &&
  Number.isFinite(s.bountiesEarned) &&
  (s.win === undefined || s.win === "warrior" || s.win === "merchant");
