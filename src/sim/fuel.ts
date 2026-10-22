import { FLIGHT } from "../data/balance";
import type { FlightTuning } from "./physics";

// Engines burn in proportion to how hard they push; braking (half power) burns half.
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
