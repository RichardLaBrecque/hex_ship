import { FLIGHT } from "../data/balance";
import type { ShipStats, Thrust } from "../ship/stats";

// spin: radians per second, positive clockwise (right).
export type Body = { x: number; y: number; vx: number; vy: number; angle: number; spin: number };

// thrust: 1 full forward, -1 full brake. turn: -1 left (anticlockwise), 1 right.
export type Controls = { thrust: number; turn: number };

export type FlightTuning = typeof FLIGHT;

// What stepBody needs from a ship's stats.
export type Motion = Pick<ShipStats, "mass" | "inertia" | "turnRate" | "main" | "brake">;

const NO_THRUST: Thrust = { force: { x: 0, y: 0 }, torque: 0, fuelBurn: 0 };

// Which engines a thrust control fires, and how hard: W fires the main engines, S brakes.
export function activeThrust(ship: Pick<ShipStats, "main" | "brake">, thrust: number): { mode: Thrust; power: number } {
  if (thrust > 0) return { mode: ship.main, power: thrust };
  if (thrust < 0) return { mode: ship.brake, power: -thrust };
  return { mode: NO_THRUST, power: 0 };
}

// Engines push the ship from where they sit, so an off-centre engine twists it as well as pushing it.
// The gyro (turnRate) pushes the spin toward the turn the pilot asks for, harder the further off it is,
// up to its strength. Against a steady engine twist it settles at a steady drift-turn (see thrustSpin),
// which the pilot can cancel by steering the other way.
export function stepBody(body: Body, controls: Controls, ship: Motion, dt: number, tuning: FlightTuning = FLIGHT): Body {
  const { mode, power } = activeThrust(ship, controls.thrust);

  const engineTwist = twistOf(ship, mode, tuning) * power;
  const maxTurn = ship.turnRate * tuning.turnScale;
  const wantedSpin = controls.turn * maxTurn;
  // The second term covers spin drag, so with no twist the ship turns at exactly the rate asked for.
  const gyro = clamp(tuning.gyroResponse * (wantedSpin - body.spin) + tuning.spinDrag * wantedSpin, maxTurn * tuning.gyroResponse);
  const spin = body.spin + (engineTwist + gyro - tuning.spinDrag * body.spin) * dt;
  const angle = body.angle + spin * dt;

  // Ship-local force turned into world space.
  const scale = ship.mass > 0 ? (power * tuning.thrustScale) / ship.mass : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ax = (mode.force.x * cos - mode.force.y * sin) * scale;
  const ay = (mode.force.x * sin + mode.force.y * cos) * scale;
  const damping = Math.exp(-tuning.drag * dt);
  const vx = (body.vx + ax * dt) * damping;
  const vy = (body.vy + ay * dt) * damping;
  return { x: body.x + vx * dt, y: body.y + vy * dt, vx, vy, angle, spin };
}

// How fast a ship ends up turning (radians/s, positive right) when it holds this mode at full power
// with no steering: the gyro and spin drag against the engines' twist.
export function thrustSpin(ship: Pick<ShipStats, "inertia" | "turnRate">, mode: Thrust, tuning: FlightTuning = FLIGHT): number {
  const twist = twistOf(ship, mode, tuning);
  const strength = ship.turnRate * tuning.turnScale * tuning.gyroResponse;
  // The gyro pushes back gyroResponse × spin, until it hits its strength; after that only drag slows the spin.
  const held = twist / (tuning.gyroResponse + tuning.spinDrag);
  if (Math.abs(held * tuning.gyroResponse) <= strength) return held;
  return (twist - Math.sign(twist) * strength) / tuning.spinDrag;
}

// Angular acceleration (radians/s²) the engines give the ship in this mode at full power.
const twistOf = (ship: Pick<ShipStats, "inertia">, mode: Thrust, tuning: FlightTuning): number =>
  ship.inertia > 0 ? (mode.torque * tuning.thrustScale * tuning.torqueScale) / ship.inertia : 0;

const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

export const speed = (body: Body): number => Math.hypot(body.vx, body.vy);
