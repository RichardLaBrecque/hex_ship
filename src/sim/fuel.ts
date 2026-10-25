import { FLIGHT } from "../data/balance";
import type { FlightTuning } from "./physics";

// Engines burn in proportion to how hard they push. `burnRate` is for the engines firing (see activeThrust).
export function burnFuel(fuel: number, power: number, burnRate: number, dt: number): number {
  return Math.max(0, fuel - burnRate * Math.abs(power) * dt);
}

// Fuel for a trip flown in a straight line at full thrust.
// With drag the ship approaches top speed exponentially, which costs about 1/drag extra seconds.
export function tripFuelEstimate(
  ship: { acceleration: number; fuelBurn: number },
  distance: number,
  tuning: FlightTuning = FLIGHT,
): number {
  const topSpeed = (ship.acceleration * tuning.thrustScale) / tuning.drag;
  if (topSpeed <= 0) return Infinity;
  return Math.ceil((distance / topSpeed + 1 / tuning.drag) * ship.fuelBurn);
}

// How far `fuel` flies the ship by the same estimate: the farthest trip tripFuelEstimate says it covers.
export function fuelRange(ship: { acceleration: number; fuelBurn: number }, fuel: number, tuning: FlightTuning = FLIGHT): number {
  const topSpeed = (ship.acceleration * tuning.thrustScale) / tuning.drag;
  if (topSpeed <= 0) return 0;
  if (ship.fuelBurn <= 0) return Infinity;
  return Math.max(0, (Math.floor(fuel) / ship.fuelBurn - 1 / tuning.drag) * topSpeed);
}
