import { AI, type Ai } from "../data/enemies";
import type { Body, Controls } from "./physics";
import { angleDiff } from "./weapons";

export type AiMode = "chase" | "attack" | "flee";

export type Pilot = {
  body: Body;
  hull: number;
  fullHull: number; // hull at launch
  range: number; // longest weapon range; 0 when every weapon is gone
};

export function aiMode(pilot: Pilot, distance: number, ai: Ai = AI): AiMode {
  if (pilot.range <= 0 || pilot.hull < pilot.fullHull * ai.fleeHull) return "flee";
  return distance > pilot.range * ai.engageShare ? "chase" : "attack";
}

// Chase: fly straight at the target. Attack: circle just off a straight line at it so the
// guns keep bearing, holding range. Flee: turn tail and run.
export function aiControls(pilot: Pilot, target: Body, ai: Ai = AI): { mode: AiMode; controls: Controls } {
  const dx = target.x - pilot.body.x;
  const dy = target.y - pilot.body.y;
  const distance = Math.hypot(dx, dy);
  const bearing = Math.atan2(dy, dx);
  const mode = aiMode(pilot, distance, ai);

  let heading = bearing;
  let thrust = 1;
  if (mode === "flee") {
    heading = bearing + Math.PI;
  } else if (mode === "attack") {
    heading = bearing + (ai.orbitOffset * Math.PI) / 180;
    thrust = distance < pilot.range * ai.closeShare ? -1 : 0.5;
  }

  const off = angleDiff(heading, pilot.body.angle);
  // Don't burn sideways: only push hard once roughly facing the way it wants to go.
  if (thrust > 0 && Math.abs(off) > Math.PI / 3) thrust = 0.2;
  return { mode, controls: { thrust, turn: Math.max(-1, Math.min(1, off * ai.steering)) } };
}
