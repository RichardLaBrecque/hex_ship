import { describe, expect, it } from "vitest";
import { COMBAT } from "../src/data/balance";
import { AI } from "../src/data/enemies";
import { hex } from "../src/hex/hex";
import { placePart, type Ship } from "../src/ship/ship";
import { aiControls, aiMode } from "../src/sim/ai";
import type { Body } from "../src/sim/physics";
import { applyHit, keyAtWorld, makeVessel, toLocal, toWorld, type Side, type Vessel } from "../src/sim/vessel";
import { aimPoint, bearingTo, fireWeapons, projectileHit, stepProjectile, weaponRange, type Projectile } from "../src/sim/weapons";
import { TEST_PARTS } from "./catalog";

const SIZE = 10;
const HEX_WIDTH = SIZE * Math.sqrt(3); // pixels between neighbouring hex centres in a row

const build = (...parts: [number, number, Parameters<typeof placePart>[2], number][]): Ship =>
  parts.reduce<Ship>((ship, [q, r, type, rotation]) => placePart(ship, hex(q, r), type, rotation, TEST_PARTS), new Map());

const at = (x: number, y: number, angle = 0): Body => ({ x, y, vx: 0, vy: 0, angle });

const vessel = (side: Side, ship: Ship, body: Body, crew = 9): Vessel => makeVessel(side, ship, body, crew, SIZE, TEST_PARTS);

// One bridge hex: its pivot is its own centre, so world position = body position.
const dot = (side: Side, x: number, y: number): Vessel => vessel(side, build([0, 0, "bridge", 0]), at(x, y));

describe("toWorld / toLocal", () => {
  it("rotates ship-local points around the pivot", () => {
    const v = dot("player", 100, 50);
    v.body = at(100, 50, Math.PI / 2);
    const world = toWorld(v, { x: 10, y: 0 });
    expect(world.x).toBeCloseTo(100);
    expect(world.y).toBeCloseTo(60);
  });

  it("round-trips", () => {
    const v = vessel("player", build([0, 0, "bridge", 0], [1, 0, "armor", 0]), at(30, -20, 1.2));
    const local = toLocal(v, toWorld(v, { x: 7, y: -3 }));
    expect(local.x).toBeCloseTo(7);
    expect(local.y).toBeCloseTo(-3);
  });
});

describe("keyAtWorld", () => {
  it("finds the part under a world point", () => {
    // bridge mass 10, armor mass 20 one hex to the right: the pivot sits 2/3 of the way to the armor
    const v = vessel("enemy", build([0, 0, "bridge", 0], [1, 0, "armor", 0]), at(0, 0));
    expect(keyAtWorld(v, { x: HEX_WIDTH / 3, y: 0 }, SIZE)).toBe("1,0");
    expect(keyAtWorld(v, { x: (-2 * HEX_WIDTH) / 3, y: 0 }, SIZE)).toBe("0,0");
  });

  it("finds nothing in empty space", () => {
    expect(keyAtWorld(dot("enemy", 0, 0), { x: 0, y: 40 }, SIZE)).toBeUndefined();
  });
});

describe("applyHit", () => {
  it("drains the shield before damaging the part", () => {
    // shield generator gives 40 shield
    const v = vessel("player", build([0, 0, "bridge", 0], [1, 0, "shield", 0]), at(0, 0));
    applyHit(v, "0,0", 45, SIZE, TEST_PARTS);
    expect(v.shield).toBe(0);
    expect(v.ship.get("0,0")!.hp).toBe(45);
  });

  it("keeps the remaining hull where it was when parts break off", () => {
    const v = vessel("player", build([0, 0, "bridge", 0], [1, 0, "armor", 0]), at(0, 0));
    const bridgeBefore = toWorld(v, { x: 0, y: 0 });
    const hit = applyHit(v, "1,0", 999, SIZE, TEST_PARTS);
    expect(hit.destroyed?.type).toBe("armor");
    expect(toWorld(v, { x: 0, y: 0 }).x).toBeCloseTo(bridgeBefore.x);
    expect(v.stats.mass).toBe(10);
  });
});

describe("bearingTo", () => {
  const CANNON = TEST_PARTS.cannon.weapon!; // range 100, arc ±30°
  const MOUNT = { x: 0, y: 0, angle: 0 };

  it("fires at a target inside the arc and range", () => {
    expect(bearingTo(MOUNT, CANNON, { x: 50, y: 20 })).toBeCloseTo(Math.atan2(20, 50));
  });

  it("can't fire outside the arc", () => {
    expect(bearingTo(MOUNT, CANNON, { x: 50, y: 50 })).toBeNull();
  });

  it("can't fire out of range", () => {
    expect(bearingTo(MOUNT, CANNON, { x: 101, y: 0 })).toBeNull();
  });
});

describe("aimPoint", () => {
  it("leads a moving target by its travel during the shot's flight", () => {
    // 100 px away at speed 50 = 2 s of flight; target moves 10 px/s down
    const point = aimPoint({ x: 0, y: 0 }, { x: 100, y: 0, vx: 0, vy: 10, angle: 0 }, 50);
    expect(point).toEqual({ x: 100, y: 20 });
  });
});

describe("fireWeapons", () => {
  it("fires a shell from a loaded cannon at a target in its arc", () => {
    const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "cannon", 0]), at(0, 0));
    const volley = fireWeapons(shooter, [dot("enemy", 60, 0)], [], 0.01, SIZE, TEST_PARTS);
    expect(volley.projectiles).toHaveLength(1);
    expect(volley.projectiles[0].vx).toBeCloseTo(100);
    expect(volley.projectiles[0].damage).toBe(10);
  });

  it("misses by up to the shooter's aim error", () => {
    const shooter = vessel("enemy", build([0, 0, "bridge", 0], [1, 0, "cannon", 0]), at(0, 0));
    shooter.aimError = 9;
    // random 1 = the widest miss, clockwise
    const volley = fireWeapons(shooter, [dot("player", 60, 0)], [], 0.01, SIZE, TEST_PARTS, COMBAT, () => 1);
    const shell = volley.projectiles[0];
    expect(Math.atan2(shell.vy, shell.vx)).toBeCloseTo((9 * Math.PI) / 180);
  });

  it("waits for the weapon to reload", () => {
    const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "cannon", 0]), at(0, 0));
    const target = dot("enemy", 60, 0);
    fireWeapons(shooter, [target], [], 0.01, SIZE, TEST_PARTS);
    expect(fireWeapons(shooter, [target], [], 0.5, SIZE, TEST_PARTS).projectiles).toHaveLength(0);
    expect(fireWeapons(shooter, [target], [], 0.5, SIZE, TEST_PARTS).projectiles).toHaveLength(1);
  });

  it("holds fire when nothing is in the arc", () => {
    const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "cannon", 0]), at(0, 0));
    expect(fireWeapons(shooter, [dot("enemy", -60, 0)], [], 0.01, SIZE, TEST_PARTS).projectiles).toHaveLength(0);
  });

  it("hits the first part along a laser beam", () => {
    const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "laser", 0]), at(0, 0));
    // target: armor in front of its bridge, facing the shooter
    const target = vessel("enemy", build([0, 0, "bridge", 0], [-1, 0, "armor", 0]), at(70, 0));
    const volley = fireWeapons(shooter, [target], [], 0.01, SIZE, TEST_PARTS);
    expect(volley.beams[0].key).toBe("-1,0");
    expect(volley.beams[0].damage).toBe(5);
  });

  describe("intercepting missiles", () => {
    const missile = (side: Side, x: number, y: number): Projectile => ({
      kind: "missile",
      side,
      x,
      y,
      vx: -50,
      vy: 0,
      damage: 20,
      life: 1,
      target: dot("player", 0, 0),
    });

    it("shoots down an incoming missile instead of firing at a ship", () => {
      const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "laser", 0]), at(0, 0));
      const incoming = missile("enemy", 60, 0);
      const volley = fireWeapons(shooter, [dot("enemy", 90, 0)], [incoming], 0.01, SIZE, TEST_PARTS);
      expect(volley.intercepts).toHaveLength(1);
      expect(volley.intercepts[0].missile).toBe(incoming);
      expect(volley.intercepts[0].beam.to).toEqual({ x: 60, y: 0 });
      expect(volley.beams).toHaveLength(0);
    });

    it("reloads for 1 / intercept rate afterwards", () => {
      const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "laser", 0]), at(0, 0));
      const target = dot("enemy", 90, 0);
      fireWeapons(shooter, [target], [missile("enemy", 60, 0)], 0.01, SIZE, TEST_PARTS);
      // TEST laser: intercept 0.5/s → 2s, against 0.5s between ordinary shots
      expect(fireWeapons(shooter, [target], [], 1.9, SIZE, TEST_PARTS).beams).toHaveLength(0);
      expect(fireWeapons(shooter, [target], [], 0.2, SIZE, TEST_PARTS).beams).toHaveLength(1);
    });

    it("ignores its own side's missiles", () => {
      const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "laser", 0]), at(0, 0));
      const volley = fireWeapons(shooter, [dot("enemy", 90, 0)], [missile("player", 60, 0)], 0.01, SIZE, TEST_PARTS);
      expect(volley.intercepts).toHaveLength(0);
      expect(volley.beams).toHaveLength(1);
    });

    it("sends each laser after a different missile", () => {
      const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "laser", 0], [1, -1, "laser", 0]), at(0, 0));
      const first = missile("enemy", 60, 0);
      const second = missile("enemy", 60, 9);
      const volley = fireWeapons(shooter, [], [first, second], 0.01, SIZE, TEST_PARTS);
      expect(volley.intercepts.map((i) => i.missile)).toEqual([first, second]);
    });

    it("leaves missiles to weapons that can intercept", () => {
      const shooter = vessel("player", build([0, 0, "bridge", 0], [1, 0, "cannon", 0]), at(0, 0));
      const volley = fireWeapons(shooter, [dot("enemy", 90, 0)], [missile("enemy", 60, 0)], 0.01, SIZE, TEST_PARTS);
      expect(volley.intercepts).toHaveLength(0);
      expect(volley.projectiles).toHaveLength(1);
    });
  });
});

describe("stepProjectile", () => {
  const shot = (kind: Projectile["kind"], target: Vessel): Projectile => ({
    kind,
    side: "player",
    x: 0,
    y: 0,
    vx: 100,
    vy: 0,
    damage: 9,
    life: 1,
    target,
  });

  it("flies a shell straight on", () => {
    const moved = stepProjectile(shot("shell", dot("enemy", 0, 100)), 0.5);
    expect(moved).toMatchObject({ x: 50, y: 0, vx: 100, vy: 0, life: 0.5 });
  });

  it("turns a missile toward its target, no faster than its turn rate", () => {
    const moved = stepProjectile(shot("missile", dot("enemy", 0, 100)), 0.1);
    const turned = Math.atan2(moved.vy, moved.vx);
    expect(turned).toBeCloseTo(COMBAT.missileTurn * 0.1);
    expect(Math.hypot(moved.vx, moved.vy)).toBeCloseTo(100);
  });
});

describe("projectileHit", () => {
  const shell = (side: Side): Projectile => ({ kind: "shell", side, x: 1, y: 1, vx: 0, vy: 0, damage: 9, life: 1, target: dot("enemy", 0, 0) });

  it("hits a ship on the other side", () => {
    const enemy = dot("enemy", 0, 0);
    expect(projectileHit(shell("player"), [enemy], SIZE)).toEqual({ vessel: enemy, key: "0,0" });
  });

  it("passes through its own side", () => {
    expect(projectileHit(shell("enemy"), [dot("enemy", 0, 0)], SIZE)).toBeNull();
  });
});

describe("weaponRange", () => {
  it("is the shortest range, so every weapon aboard can reach", () => {
    // TEST_PARTS: laser and cannon both reach 100, missile too; give the cannon a shorter reach
    const catalog = { ...TEST_PARTS, cannon: { ...TEST_PARTS.cannon, weapon: { ...TEST_PARTS.cannon.weapon!, range: 60 } } };
    const ship = build([0, 0, "bridge", 0], [1, 0, "laser", 0], [1, -1, "cannon", 0]);
    expect(weaponRange(vessel("enemy", ship, at(0, 0)), catalog)).toBe(60);
  });

  it("is 0 for an unarmed ship", () => {
    expect(weaponRange(dot("enemy", 0, 0), TEST_PARTS)).toBe(0);
  });
});

describe("aiMode", () => {
  const pilot = { body: at(0, 0), hull: 100, fullHull: 100, range: 100 };

  it("chases a target out of reach", () => {
    expect(aiMode(pilot, 90)).toBe("chase");
  });

  it("attacks inside its weapon range", () => {
    expect(aiMode(pilot, 80)).toBe("attack");
  });

  it("flees once badly damaged", () => {
    expect(aiMode({ ...pilot, hull: 34 }, 50)).toBe("flee");
  });

  it("flees once its weapons are gone", () => {
    expect(aiMode({ ...pilot, range: 0 }, 50)).toBe("flee");
  });
});

describe("aiControls", () => {
  const pilot = (angle: number, hull = 100) => ({ body: at(0, 0, angle), hull, fullHull: 100, range: 100 });

  it("flies at a far target at full thrust", () => {
    const { controls } = aiControls(pilot(0), at(500, 0));
    expect(controls).toEqual({ thrust: 1, turn: 0 });
  });

  it("circles just off a straight line when attacking", () => {
    // facing the target exactly, it steers clockwise by the orbit offset
    const { controls } = aiControls(pilot(0), at(60, 0));
    expect(controls.turn).toBeCloseTo(Math.min(1, ((AI.orbitOffset * Math.PI) / 180) * AI.steering));
    expect(controls.thrust).toBe(0.5);
  });

  it("brakes when too close", () => {
    expect(aiControls(pilot(0), at(30, 0)).controls.thrust).toBe(-1);
  });

  it("turns away to flee", () => {
    // target dead ahead: wants to face backwards, so turns hard and barely thrusts
    const { mode, controls } = aiControls(pilot(0, 10), at(60, 0));
    expect(mode).toBe("flee");
    expect(Math.abs(controls.turn)).toBe(1);
    expect(controls.thrust).toBe(0.2);
  });
});
