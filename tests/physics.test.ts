import { describe, expect, it } from "vitest";
import type { ShipStats } from "../src/ship/stats";
import { activeThrust, speed, stepBody, thrustSpin, type Body, type Motion } from "../src/sim/physics";

const TUNING = {
  hexSize: 10,
  thrustScale: 10,
  reverseFactor: 0.5,
  turnScale: 1,
  gyroResponse: 4,
  torqueScale: 1,
  spinDrag: 1,
  drag: 0.5,
  dockSpeed: 50,
};
// mass 20, main force 40 → 40 / 20 × thrustScale 10 = 20 px/s²; gyro: turn 1 rad/s, correcting at 4/s, up to 4 rad/s²
const SHIP: Motion = {
  mass: 20,
  inertia: 1000,
  turnRate: 1,
  main: { force: { x: 40, y: 0 }, torque: 0, fuelBurn: 2 },
  brake: { force: { x: -20, y: 0 }, torque: 0, fuelBurn: 1 },
};
const AT_REST: Body = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 };

// A ship whose main engines twist it: torque × thrustScale / inertia = rad/s² of twist.
const twisted = (torque: number): Motion => ({ ...SHIP, main: { ...SHIP.main, torque } });

const run = (body: Body, thrust: number, turn: number, steps: number, ship: Motion = SHIP, dt = 1 / 60): Body => {
  let b = body;
  for (let i = 0; i < steps; i++) b = stepBody(b, { thrust, turn }, ship, dt, TUNING);
  return b;
};

describe("stepBody", () => {
  it("accelerates along the facing direction", () => {
    const facingDown = { ...AT_REST, angle: Math.PI / 2 };
    const result = run(facingDown, 1, 0, 30);
    expect(result.vx).toBeCloseTo(0);
    expect(result.vy).toBeGreaterThan(0);
    expect(result.y).toBeGreaterThan(0);
  });

  it("brakes with the brake force", () => {
    // brake force -20 against main force 40
    const forward = run(AT_REST, 1, 0, 1, SHIP, 0.1);
    const backward = run(AT_REST, -1, 0, 1, SHIP, 0.1);
    expect(backward.vx).toBeCloseTo(-forward.vx / 2);
  });

  it("pushes sideways when the engines do", () => {
    const sideways = { ...SHIP, main: { ...SHIP.main, force: { x: 0, y: 40 } } };
    const result = run(AT_REST, 1, 0, 30, sideways);
    expect(result.vx).toBeCloseTo(0);
    expect(result.vy).toBeGreaterThan(0);
  });

  it("spins up to the ship's turn rate", () => {
    expect(run(AT_REST, 0, 1, 15).spin).toBeLessThan(1);
    expect(run(AT_REST, 0, 1, 90).spin).toBeCloseTo(1);
    expect(run(AT_REST, 0, -1, 90).spin).toBeCloseTo(-1);
  });

  it("stops turning when the pilot lets go", () => {
    const turning = { ...AT_REST, spin: 1 };
    expect(run(turning, 0, 0, 90).spin).toBeCloseTo(0);
  });

  it("drift-turns a ship whose engines twist it, in proportion to the twist", () => {
    // twist 200 × 10 / 1000 = 2 rad/s²; the gyro (4/s) and spin drag (1/s) settle at 2 / 5 = 0.4 rad/s
    expect(run(AT_REST, 1, 0, 300, twisted(200)).spin).toBeCloseTo(0.4);
    expect(run(AT_REST, 1, 0, 300, twisted(-200)).spin).toBeCloseTo(-0.4);
  });

  it("flies straight when the pilot steers against the twist", () => {
    // asking for -0.4 rad/s exactly cancels the 0.4 rad/s drift
    expect(run(AT_REST, 1, -0.4, 300, twisted(200)).spin).toBeCloseTo(0);
  });

  it("spins a ship whose engines overpower its gyro, held back only by spin drag", () => {
    // twist 25 rad/s² against the gyro's 4: (25 - 4) / spin drag 1 = 21 rad/s
    expect(run(AT_REST, 1, 0, 600, twisted(2500)).spin).toBeCloseTo(21, 1);
  });

  it("slows a coasting ship down", () => {
    const moving = { ...AT_REST, vx: 100 };
    expect(speed(run(moving, 0, 0, 60))).toBeCloseTo(100 * Math.exp(-0.5));
  });

  it("settles near top speed = acceleration × thrustScale / drag", () => {
    // 40 / 20 × 10 / 0.5 = 40
    expect(speed(run(AT_REST, 1, 0, 60 * 30))).toBeCloseTo(40, 0);
  });
});

describe("activeThrust", () => {
  const ship = { main: SHIP.main, brake: SHIP.brake } satisfies Pick<ShipStats, "main" | "brake">;

  it("fires the main engines on thrust and the brake on brake, at the control's strength", () => {
    expect(activeThrust(ship, 0.5)).toEqual({ mode: SHIP.main, power: 0.5 });
    expect(activeThrust(ship, -1)).toEqual({ mode: SHIP.brake, power: 1 });
  });

  it("fires nothing at rest", () => {
    expect(activeThrust(ship, 0).power).toBe(0);
  });
});

describe("thrustSpin", () => {
  it("is the steady drift-turn under full thrust, matching stepBody", () => {
    // see "drift-turns a ship…" above: 2 / (4 + 1)
    expect(thrustSpin(SHIP, twisted(200).main, TUNING)).toBeCloseTo(0.4);
    expect(thrustSpin(SHIP, twisted(-200).main, TUNING)).toBeCloseTo(-0.4);
    expect(thrustSpin(SHIP, twisted(2500).main, TUNING)).toBeCloseTo(run(AT_REST, 1, 0, 600, twisted(2500)).spin, 1);
  });

  it("is 0 for engines that push through the centre of mass", () => {
    expect(thrustSpin(SHIP, SHIP.main, TUNING)).toBe(0);
  });

  it("leaves only spin drag against the twist when the ship has no gyro", () => {
    // 2 rad/s² / spin drag 1
    expect(thrustSpin({ ...SHIP, turnRate: 0 }, twisted(200).main, TUNING)).toBeCloseTo(2);
  });
});
