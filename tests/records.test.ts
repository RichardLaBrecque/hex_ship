import { describe, expect, it } from "vitest";
import { addScore, loadRecords, RECORDS_KEY, saveRecords, type Records, type Score } from "../src/save/records";
import { memoryStore } from "../src/save/store";

const score = (day: number, peakShipValue: number, cargoEarned: number, bountiesEarned: number): Score => ({
  day,
  peakShipValue,
  cargoEarned,
  bountiesEarned,
});

describe("addScore", () => {
  const records: Records = { best: score(9, 500, 900, 90), recent: [score(9, 500, 900, 90)] };

  it("keeps the best of each column, even from different runs", () => {
    const { records: next } = addScore(records, score(4, 990, 100, 99));
    expect(next.best).toEqual(score(9, 990, 900, 99));
  });

  it("flags only the columns that beat the old best", () => {
    const { newBests } = addScore(records, score(4, 990, 100, 90));
    expect(newBests).toEqual({ peakShipValue: true, cargoEarned: false, bountiesEarned: false });
  });

  it("puts the newest run first and drops the oldest past the limit", () => {
    const older = { best: records.best, recent: [score(3, 3, 3, 3), score(2, 2, 2, 2)] };
    const { records: next } = addScore(older, score(4, 4, 4, 4), 2);
    expect(next.recent).toEqual([score(4, 4, 4, 4), score(3, 3, 3, 3)]);
  });
});

describe("saveRecords / loadRecords", () => {
  it("loads back the records that were saved", () => {
    const store = memoryStore();
    const records = { best: score(9, 500, 900, 90), recent: [score(9, 500, 900, 90)] };
    saveRecords(records, store);
    expect(loadRecords(store)).toEqual(records);
  });

  it("starts empty when there are none", () => {
    expect(loadRecords(memoryStore())).toEqual({ best: score(0, 0, 0, 0), recent: [] });
  });

  it("starts empty when they can't be read", () => {
    const store = memoryStore();
    store.set(RECORDS_KEY, JSON.stringify({ best: "lots", recent: [] }));
    expect(loadRecords(store)).toEqual({ best: score(0, 0, 0, 0), recent: [] });
  });
});
