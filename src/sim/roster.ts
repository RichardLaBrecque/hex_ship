import { ENCOUNTERS, type Encounter } from "../data/enemies";
import type { Encounters } from "./spawner";

// One enemy the fight keeps active. When its enemy is destroyed or escapes, the slot stands empty for
// `respawnDelay` seconds and then a fresh enemy of the same tier fills it. A destroyed boss is never replaced.
export type Slot = {
  level: number | "boss"; // enemy tier, 1-based, or the boss
  filled: boolean; // an enemy is in the fight for this slot
  wait: number; // seconds until an empty slot fills again
  done: boolean; // the boss was destroyed: the slot stays empty
};

// The slots an encounter adds, already filled: the caller spawns their first enemies as the encounter triggers.
export function encounterSlots(encounter: Encounter): Slot[] {
  const levels: Slot["level"][] = [...encounter.enemies, ...(encounter.boss ? ["boss" as const] : [])];
  return levels.map((level) => ({ level, filled: true, wait: 0, done: false }));
}

// The slot's enemy is gone. `destroyed` is false when it escaped instead.
export function vacate(slot: Slot, destroyed: boolean, enc: Encounters = ENCOUNTERS): Slot {
  if (slot.level === "boss" && destroyed) return { ...slot, filled: false, done: true };
  return { ...slot, filled: false, wait: enc.respawnDelay };
}

// Counts down the empty slots. Returns the new slots and the indexes of those due to fill now, marked filled.
export function fillSlots(slots: readonly Slot[], dt: number): { slots: Slot[]; due: number[] } {
  const due: number[] = [];
  const next = slots.map((slot, i) => {
    if (slot.filled || slot.done) return slot;
    const wait = slot.wait - dt;
    if (wait > 0) return { ...slot, wait };
    due.push(i);
    return { ...slot, filled: true, wait: 0 };
  });
  return { slots: next, due };
}

export const bossDefeated = (slots: readonly Slot[]): boolean => slots.some((s) => s.level === "boss" && s.done);
