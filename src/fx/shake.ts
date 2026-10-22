import type { Point } from "../hex/hex";

// Screen shake from "trauma": hits add trauma (capped at 1), it fades over time, and the shake grows with
// trauma squared, so small knocks barely wobble the camera and big ones jolt it.
export const SHAKE = {
  maxOffset: 14, // pixels at full trauma
  decay: 1.6, // trauma lost per second
};

export const addTrauma = (trauma: number, amount: number): number => Math.min(1, trauma + amount);

export const decayTrauma = (trauma: number, dt: number, shake = SHAKE): number => Math.max(0, trauma - shake.decay * dt);

// This frame's camera offset.
export function shakeOffset(trauma: number, random: () => number, shake = SHAKE): Point {
  const strength = shake.maxOffset * trauma * trauma;
  return { x: (random() * 2 - 1) * strength, y: (random() * 2 - 1) * strength };
}
