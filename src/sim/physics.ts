import { FLIGHT } from "../data/balance";

export type Body = { x: number; y: number; vx: number; vy: number; angle: number };

// thrust: 1 full forward, -1 full brake. turn: -1 left (anticlockwise), 1 right.
export type Controls = { thrust: number; turn: number };

export type FlightTuning = typeof FLIGHT;

export function stepBody(
  body: Body,
  controls: Controls,
  ship: { acceleration: number; turnRate: number },
  dt: number,
  tuning: FlightTuning = FLIGHT,
): Body {
  const angle = body.angle + controls.turn * ship.turnRate * tuning.turnScale * dt;
  const power = enginePower(controls.thrust, tuning);
  const accel = ship.acceleration * tuning.thrustScale * power;
  const damping = Math.exp(-tuning.drag * dt);
  const vx = (body.vx + Math.cos(angle) * accel * dt) * damping;
  const vy = (body.vy + Math.sin(angle) * accel * dt) * damping;
  return { x: body.x + vx * dt, y: body.y + vy * dt, vx, vy, angle };
}

// Braking runs the engines at reduced power.
export const enginePower = (thrust: number, tuning: FlightTuning = FLIGHT): number =>
  thrust >= 0 ? thrust : thrust * tuning.reverseFactor;

export const speed = (body: Body): number => Math.hypot(body.vx, body.vy);
