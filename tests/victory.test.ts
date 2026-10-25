import { describe, expect, it } from "vitest";
import type { Contract } from "../src/economy/contracts";
import type { Run } from "../src/economy/run";
import { deliveredGrandHaul, shareText } from "../src/economy/victory";

const contract = (grand: boolean): Contract => ({ id: "9", cargo: "ORE", units: 9, payPerUnit: 9, tier: 0, from: 0, to: 1, grand });

describe("deliveredGrandHaul", () => {
  it("is true when the Grand Haul is among the delivered contracts", () => {
    expect(deliveredGrandHaul([contract(false), contract(true)])).toBe(true);
    expect(deliveredGrandHaul([contract(false)])).toBe(false);
  });
});

describe("shareText", () => {
  const run = { day: 42, peakShipValue: 5200, cargoEarned: 12300, bountiesEarned: 8400, kills: 63, delivered: 1 } as Run;

  it("says how the run was won, its score columns and where to play", () => {
    expect(shareText(run, "warrior", "https://example.test/")).toBe(
      [
        "Hex Ship: I won as The Warrior on day 42!",
        "Destroyed the Flagship.",
        "Peak ship $5200 · Cargo sold $12300 · Bounties $8400",
        "63 kills · 1 delivery",
        "Play: https://example.test/",
      ].join("\n"),
    );
  });

  it("names the merchant's deed", () => {
    expect(shareText(run, "merchant", "URL").split("\n").slice(0, 2)).toEqual([
      "Hex Ship: I won as The Merchant on day 42!",
      "Delivered the Grand Haul across the system.",
    ]);
  });
});
