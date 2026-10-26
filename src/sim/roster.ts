import { ENCOUNTERS, type Encounter } from "../data/enemies";
import type { Encounters } from "./spawner";

// One enemy the fight keeps active. When its enemy is destroyed or escapes, the slot stands empty for
// `respawnDelay` seconds and then a fresh enemy of the same tier fills it. A destroyed boss is never replaced.
export type Slot = {
  level: SlotLevel;
  filled: boolean; // an enemy is in the fight for this slot
  wait: number; // seconds until an empty slot fills again
  done: boolean; // its enemy is gone for good, like a destroyed boss: the slot stays empty
  retired: boolean; // the danger level no longer wants this slot: its enemy fights on, but isn't replaced
};

export type SlotLevel = number | "boss"; // enemy tier, 1-based, or the boss

// The enemies the encounters triggered so far keep active: those at or before `reached` (see Encounter).
export const activeLevels = (encounters: readonly Encounter[], reached: number): SlotLevel[] =>
  encounters.filter((e) => e.at <= reached).flatMap((e) => [...e.enemies, ...(e.boss ? ["boss" as const] : [])]);

// Matches the slots to the levels wanted, keeping each slot at its index so enemies can point at theirs.
// A slot still wanted is kept as it is, empty or filled. Slots no longer wanted are retired. Each wanted level
// left over gets a new filled slot: the caller spawns an enemy for each index in `added`.
export function retarget(slots: readonly Slot[], wanted: readonly SlotLevel[]): { slots: Slot[]; added: number[] } {
  const next = [...slots];
  const matched = new Set<number>();
  const missing: SlotLevel[] = [];
  for (const level of wanted) {
    const i = next.findIndex((s, j) => s.level === level && !s.retired && !matched.has(j));
    if (i >= 0) matched.add(i);
    else missing.push(level);
  }
  next.forEach((s, i) => {
    if (!s.retired && !matched.has(i)) next[i] = { ...s, retired: true };
  });
  const added = missing.map((level) => next.push({ level, filled: true, wait: 0, done: false, retired: false }) - 1);
  return { slots: next, added };
}

// The slot's enemy is gone. `destroyed` is false when it escaped instead.
export function vacate(slot: Slot, destroyed: boolean, enc: Encounters = ENCOUNTERS): Slot {
  if (slot.level === "boss" && destroyed) return clear(slot);
  return { ...slot, filled: false, wait: enc.respawnDelay };
}

// The slot's enemy is gone and won't be replaced.
export const clear = (slot: Slot): Slot => ({ ...slot, filled: false, done: true });

// Counts down the empty slots. Returns the new slots and the indexes of those due to fill now, marked filled.
// Retired and cleared slots never fill.
export function fillSlots(slots: readonly Slot[], dt: number): { slots: Slot[]; due: number[] } {
  const due: number[] = [];
  const next = slots.map((slot, i) => {
    if (slot.filled || slot.done || slot.retired) return slot;
    const wait = slot.wait - dt;
    if (wait > 0) return { ...slot, wait };
    due.push(i);
    return { ...slot, filled: true, wait: 0 };
  });
  return { slots: next, due };
}

export const bossDefeated = (slots: readonly Slot[]): boolean => slots.some((s) => s.level === "boss" && s.done);
