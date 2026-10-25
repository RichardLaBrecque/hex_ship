import type { Contract } from "./contracts";
import type { Run } from "./run";

// The two ways to win a run: destroy the boss, or deliver the Grand Haul.
export type Win = "warrior" | "merchant";

// How and on which day a run was first won. Play can go on after a win.
export type Won = { readonly win: Win; readonly day: number };

export const WIN_TITLES: Record<Win, string> = { warrior: "The Warrior", merchant: "The Merchant" };

const WIN_DEEDS: Record<Win, string> = {
  warrior: "Destroyed the Flagship.",
  merchant: "Delivered the Grand Haul across the system.",
};

export const deliveredGrandHaul = (delivered: readonly Contract[]): boolean => delivered.some((c) => c.grand);

// A few lines to paste for friends: how the run was won, its score columns, and where to play.
export function shareText(run: Run, win: Win, url: string): string {
  return [
    `Hex Ship: I won as ${WIN_TITLES[win]} on day ${run.won?.day ?? run.day}!`,
    WIN_DEEDS[win],
    `Peak ship $${run.peakShipValue} · Cargo sold $${run.cargoEarned} · Bounties $${run.bountiesEarned}`,
    `${run.kills} kill${run.kills === 1 ? "" : "s"} · ${run.delivered} deliver${run.delivered === 1 ? "y" : "ies"}`,
    `Play: ${url}`,
  ].join("\n");
}
