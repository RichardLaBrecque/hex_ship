import { describe, expect, it } from "vitest";
import { hex } from "../src/hex/hex";
import { placePart, type Ship } from "../src/ship/ship";
import { computeShipStats } from "../src/ship/stats";
import { TEST_PARTS } from "./catalog";

// hex size 10 so engine positions are easy to work out; braking reverses the main engines at half power
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

const build = (...parts: [number, number, Parameters<typeof placePart>[2], number][]): Ship =>
  parts.reduce<Ship>((ship, [q, r, type, rotation]) => placePart(ship, hex(q, r), type, rotation, TEST_PARTS), new Map());

const withHp = (ship: Ship, q: number, r: number, hp: number): Ship => {
  const next = new Map(ship);
  const key = `${q},${r}`;
  next.set(key, { ...next.get(key)!, hp });
  return next;
};

describe("computeShipStats", () => {
  it("sums mass, hull, cargo and crew across parts", () => {
    const ship = build([0, 0, "bridge", 0], [0, 1, "cargo", 0], [1, 0, "crew", 0]);
    const stats = computeShipStats(ship, 9, TEST_PARTS);
    expect(stats.mass).toBe(20);
    expect(stats.maxHull).toBe(70);
    expect(stats.cargoCapacity).toBe(10);
    expect(stats.crewCapacity).toBe(6);
    expect(stats.crewRequired).toBe(1);
  });

  it("gives full thrust to an engine with its exhaust pointing straight back", () => {
    const ship = build([0, 0, "bridge", 0], [-1, 0, "engine", 3]);
    const stats = computeShipStats(ship, 2, TEST_PARTS);
    expect(stats.thrust).toBe(40);
    expect(stats.acceleration).toBe(2);
    expect(stats.turnRate).toBe(1);
  });

  it("sums fuel capacity across tanks", () => {
    const ship = build([0, 0, "bridge", 0], [0, -1, "fuel", 0], [0, 1, "fuel", 0]);
    expect(computeShipStats(ship, 2, TEST_PARTS).fuelCapacity).toBe(60);
  });

  it("burns fuel only in engines that push forward and aren't blocked", () => {
    // rear engine and a 60°-off engine burn; a reversed engine and a blocked one don't
    const ship = build(
      [0, 0, "bridge", 0],
      [-1, 0, "engine", 3],
      [0, -1, "engine", 4],
      [1, 0, "engine", 0],
      [0, 1, "engine", 3],
      [-1, 1, "armor", 0],
    );
    expect(computeShipStats(ship, 9, TEST_PARTS).fuelBurn).toBe(4);
  });

  it("gives half thrust to an engine angled 60° off", () => {
    const ship = build([0, 0, "bridge", 0], [0, -1, "engine", 4]);
    expect(computeShipStats(ship, 2, TEST_PARTS).thrust).toBeCloseTo(20);
  });

  it("gives no forward thrust to an engine pushing backwards", () => {
    const ship = build([0, 0, "bridge", 0], [1, 0, "engine", 0]);
    expect(computeShipStats(ship, 2, TEST_PARTS).thrust).toBe(0);
  });

  it("pushes from where each engine sits, twisting the ship about its centre of mass", () => {
    // engine at (0,-1) is at pixel (-8.66, -15); bridge and engine weigh 10 each, so the centre is halfway
    // and the engine's arm is (-4.33, -7.5). Pushing +x with 40 from above the centre turns the ship clockwise: 7.5 × 40.
    const ship = build([0, 0, "bridge", 0], [0, -1, "engine", 3]);
    const { main } = computeShipStats(ship, 2, TEST_PARTS, TUNING);
    expect(main.force.x).toBeCloseTo(40);
    expect(main.force.y).toBeCloseTo(0);
    expect(main.torque).toBeCloseTo(300);
  });

  it("doesn't twist a ship whose engine pushes through its centre of mass", () => {
    const ship = build([0, 0, "bridge", 0], [-1, 0, "engine", 3]);
    expect(computeShipStats(ship, 2, TEST_PARTS, TUNING).main.torque).toBeCloseTo(0);
  });

  it("pushes sideways from an engine angled 60° off", () => {
    // exhaust 4 (NW... back-left) pushes 60° clockwise of forward: 40 × (cos 60°, sin 60°)
    const ship = build([0, 0, "bridge", 0], [0, -1, "engine", 4]);
    const { force } = computeShipStats(ship, 2, TEST_PARTS, TUNING).main;
    expect(force.x).toBeCloseTo(20);
    expect(force.y).toBeCloseTo(40 * Math.sin(Math.PI / 3));
  });

  it("brakes with retro engines at full power plus the main engines reversed", () => {
    // main engine 40 forward, retro engine 40 backward: brake = -40 - 40 × 0.5; fuel 2 + 2 × 0.5
    const ship = build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [1, 0, "engine", 0], [0, 1, "crew", 0]);
    const stats = computeShipStats(ship, 9, TEST_PARTS, TUNING);
    expect(stats.main.force.x).toBeCloseTo(40);
    expect(stats.main.fuelBurn).toBe(2);
    expect(stats.brake.force.x).toBeCloseTo(-60);
    expect(stats.brake.fuelBurn).toBe(3);
  });

  it("gives a one-part ship the inertia of a small disc", () => {
    // mass 10 × hex size² / 2
    const ship = build([0, 0, "bridge", 0]);
    expect(computeShipStats(ship, 1, TEST_PARTS, TUNING).inertia).toBe(500);
  });

  it("ignores an engine whose exhaust hex is occupied", () => {
    const ship = build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [-2, 0, "armor", 0]);
    const stats = computeShipStats(ship, 2, TEST_PARTS);
    expect(stats.thrust).toBe(0);
    expect(stats.turnRate).toBe(0);
  });

  it("scales crewed systems down when under-crewed", () => {
    // requires 3 crew (bridge, engine, laser), only 1 aboard
    const ship = build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [1, 0, "laser", 0]);
    const stats = computeShipStats(ship, 1, TEST_PARTS);
    expect(stats.efficiency).toBeCloseTo(1 / 3);
    expect(stats.thrust).toBeCloseTo(40 / 3);
    expect(stats.dps).toBeCloseTo(10 / 3);
  });

  it("caps crew aboard at crew capacity", () => {
    const ship = build([0, 0, "bridge", 0]);
    expect(computeShipStats(ship, 99, TEST_PARTS).crew).toBe(2);
  });

  it("scales damaged parts by remaining hp", () => {
    const ship = withHp(
      build([0, 0, "bridge", 0], [-1, 0, "engine", 3], [1, 0, "shield", 0], [0, 1, "crew", 0]),
      1,
      0,
      5,
    );
    const stats = computeShipStats(ship, 3, TEST_PARTS);
    expect(stats.efficiency).toBe(1);
    expect(stats.shieldMax).toBe(20);
    expect(stats.shieldRegen).toBe(2);
    expect(stats.hull).toBe(85);
    expect(stats.maxHull).toBe(90);
  });

  it("has no tractor beam without one", () => {
    const stats = computeShipStats(build([0, 0, "bridge", 0]), 1, TEST_PARTS);
    expect(stats.tractorRange).toBe(0);
    expect(stats.tractorPull).toBe(0);
  });

  it("pulls with a tractor beam's full reach, its pull weakened by damage", () => {
    // tractor: range 100, pull 50, 10 hp; at 5 hp it pulls half as hard but reaches as far
    const ship = withHp(build([0, 0, "bridge", 0], [1, 0, "tractor", 0]), 1, 0, 5);
    const stats = computeShipStats(ship, 2, TEST_PARTS);
    expect(stats.tractorRange).toBe(100);
    expect(stats.tractorPull).toBe(25);
  });
});
