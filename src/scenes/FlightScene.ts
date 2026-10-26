import type { Sound } from "../audio/sound";
import { COMBAT, ECONOMY, FLIGHT, PLANETS, type Planet } from "../data/balance";
import { bossTier, DANGER, ENCOUNTERS, ENEMY_TIERS, type Encounter, type EnemyTier } from "../data/enemies";
import { dangerTier, isBossTrip } from "../economy/danger";
import { PARTS } from "../data/parts";
import { deliverableAt, holdUsed, planetDistance } from "../economy/contracts";
import { pickSalvage, salvageUnits, type Salvage } from "../economy/salvage";
import { bountyFor, type TripResult, type Run } from "../economy/run";
import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import { BURSTS, burst, drawParticles, emitCount, exhaust, stepParticles, type Particle } from "../fx/particles";
import { addTrauma, decayTrauma, shakeOffset } from "../fx/shake";
import { directionAngle, hex, type Point } from "../hex/hex";
import { drawPart, drawShip } from "../render/drawShip";
import { drawTouchControls, touchControlRects, type HeldControls, type TouchControls } from "../render/touchControls";
import { drawText, pointInRect, THEME } from "../render/ui";
import { repairShip } from "../ship/damage";
import { rechargeShields, shieldCapacity, totalShield } from "../ship/shields";
import { engineFlame, shipValue, type PlacedPart } from "../ship/ship";
import { computeShipStats } from "../ship/stats";
import { aiControls, type AiMode } from "../sim/ai";
import { bounce, findContact, ramDamage } from "../sim/collision";
import { burnFuel, fuelRange } from "../sim/fuel";
import { activeThrust, speed, stepBody, type Body } from "../sim/physics";
import { collectPickups, pullPickups, stepPickups, type Pickup } from "../sim/pickups";
import { activeLevels, bossDefeated, fillSlots, retarget, vacate, type Slot, type SlotLevel } from "../sim/roster";
import { buildEnemy, guardBody, respawnBody, spawnBody } from "../sim/spawner";
import { applyHit, hexWorld, isWrecked, makeVessel, setShip, type HitKind, type Vessel } from "../sim/vessel";
import { fireWeapons, projectileHit, stepProjectile, weaponRange, type Beam, type Projectile } from "../sim/weapons";

export type FlightOptions = {
  run: Run;
  onArrive: (trip: TripResult, planet: number) => void; // docked at PLANETS[planet]
  onAbort: (trip: TripResult) => void; // fuel 0 means a tow is needed
  onDestroyed: (trip: TripResult) => void; // the core was destroyed
  onVictory: (trip: TripResult) => void; // the boss was destroyed and the run is won; the flight can carry on after
  sound: Sound;
};

type Enemy = { vessel: Vessel; bounty: number; mode: AiMode; thrust: number; slot: number }; // slot: index into slots

// A part knocked loose, drifting until it fades out.
type Debris = { part: PlacedPart; x: number; y: number; vx: number; vy: number; angle: number; spin: number; age: number };

const STAR_FIELD = 2048; // stars repeat every this many pixels
const STAR_LAYERS = [
  { parallax: 0.15, count: 220, size: 1, color: "#3b4766" },
  { parallax: 0.4, count: 120, size: 1.5, color: "#6b7aa0" },
  { parallax: 0.8, count: 50, size: 2, color: "#a9b6d8" },
];
const CAMERA_FOLLOW = 6; // higher = camera sticks closer to the ship

// Effects. Purely visual and audible: nothing here changes the fight.
const EXHAUST_RATE = 45; // puffs per second per engine at full thrust
const MISSILE_SMOKE_RATE = 40; // puffs per second behind each missile
const MISSILE_SMOKE = "#8a93a8";
const TRAUMA_PER_DAMAGE = 1 / 60; // screen shake added per point of damage to the player's ship
const TRAUMA_PART_LOST = 0.3; // extra shake when the player loses a part
const TRAUMA_KILL = 0.35; // shake from an enemy exploding right next to you; less further away
const DANGER_FLASH_SECONDS = 3; // how long "DANGER RISING" shows
const HALF_RANGE = 0.5; // planets within this share of the fuel range are marked: enough fuel to get there and back
const TRAUMA_KILL_RANGE = 600; // pixels at which an enemy exploding no longer shakes the screen
const HOLD_FULL_SECONDS = 1; // how long "HOLD FULL" shows after touching salvage with no room for it

// Free flight: the ship can dock at any planet except the one it left.
export class FlightScene implements Scene {
  private origin: number; // index into PLANETS of the planet the ship left
  private from: Planet;
  private hop: number; // distance from the origin to its nearest neighbour; encounters trigger along it
  private player: Vessel;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private beams: Beam[] = [];
  private debris: Debris[] = [];
  private pickups: Pickup[] = []; // salvage drifting where enemies were destroyed
  private salvage: Salvage[] = []; // salvage picked up this trip
  private holdFull = 0; // seconds left showing that salvage didn't fit
  private particles: Particle[] = [];
  private trauma = 0; // screen shake, 0..1
  private danger: number; // rises mid-flight as kills raise notoriety, never falls
  private dangerFlash = 0; // seconds left showing that danger rose
  private bossTrip: boolean; // the encounters end with a boss (see isBossTrip)
  private encounters: readonly Encounter[]; // the danger level's encounters, in route order
  private reached = 0; // the farthest progress so far: encounters at or before it have triggered
  private guarded: Planet | null; // the Grand Haul's destination, where the boss waits instead of on the route
  private guardMet = false; // the ship came within guardRange of the guarded planet, so the boss has arrived
  private slots: Slot[] = []; // the enemies triggered encounters keep active (see roster.ts)
  private bounty = 0;
  private kills = 0;
  private wreckTimer: number | null = null; // counts down to Game Over once the core is lost
  private victoryTimer: number | null = null; // counts down to the victory screen once the boss is destroyed
  private celebrated = false; // the victory screen was shown, and the flight carried on
  private camera: Point;
  private thrust = 0;
  private fuel: number;
  private time = 0;
  private touch = false; // the player is on a touch screen, so the flight buttons are shown
  private controls: TouchControls | null = null; // laid out at the last render
  private held: HeldControls = { left: false, right: false, thrust: false, brake: false };
  private stars = STAR_LAYERS.map((layer) =>
    Array.from({ length: layer.count }, () => ({ x: Math.random() * STAR_FIELD, y: Math.random() * STAR_FIELD })),
  );

  constructor(private options: FlightOptions) {
    const { run } = options;
    this.origin = run.docked;
    this.from = PLANETS[run.docked];
    const others = PLANETS.map((_, i) => i).filter((i) => i !== run.docked);
    const byDistance = (a: number, b: number): number => planetDistance(run.docked, a) - planetDistance(run.docked, b);
    this.hop = planetDistance(run.docked, [...others].sort(byDistance)[0]);
    // Launch facing the nearest planet some cargo is bound for, or else the nearest planet.
    const bound = others.filter((i) => run.cargo.some((c) => c.to === i));
    const facing = PLANETS[[...(bound.length > 0 ? bound : others)].sort(byDistance)[0]];
    this.fuel = run.fuel;
    this.danger = dangerTier(run);
    this.bossTrip = isBossTrip(run);
    this.encounters = this.bossTrip ? DANGER.boss.encounters : DANGER.levels[this.danger - 1];
    const grand = run.cargo.find((c) => c.grand);
    this.guarded = grand !== undefined && grand.to !== null ? PLANETS[grand.to] : null;

    const heading = Math.atan2(facing.y - this.from.y, facing.x - this.from.x);
    const startDistance = this.from.radius + 80;
    const body = {
      x: this.from.x + Math.cos(heading) * startDistance,
      y: this.from.y + Math.sin(heading) * startDistance,
      vx: 0,
      vy: 0,
      angle: heading,
      spin: 0,
    };
    this.player = makeVessel("player", run.ship, body, run.crew);
    this.camera = { x: body.x, y: body.y };
  }

  private trip(): TripResult {
    return {
      fuel: this.fuel,
      ship: this.player.ship,
      bounty: this.bounty,
      kills: this.kills,
      salvage: this.salvage,
      danger: this.danger,
      boss: this.bossTrip,
      bossKilled: bossDefeated(this.slots),
    };
  }

  exit(): void {
    this.options.sound.thrust(0);
  }

  update(dt: number, input: Input): void {
    this.time += dt;

    if (this.wreckTimer !== null) {
      this.wreckTimer -= dt;
      this.thrust = 0;
      this.options.sound.thrust(0);
      this.stepWorld(dt);
      if (this.wreckTimer <= 0) this.options.onDestroyed(this.trip());
      return;
    }
    // Once the boss is down the run is won, whatever happens to the ship in the moments before the victory screen.
    if (this.victoryTimer !== null) {
      this.victoryTimer -= dt;
      this.thrust = 0;
      this.options.sound.thrust(0);
      this.stepWorld(dt);
      if (this.victoryTimer <= 0) {
        this.victoryTimer = null;
        this.celebrated = true;
        this.options.onVictory(this.trip());
      }
      return;
    }

    this.touch = input.usingTouch;
    const controls = this.touch ? this.controls : null;
    const tappedBack = controls !== null && input.wasClicked(0) && pointInRect(input.mouse, controls.back);
    if (input.wasPressed("Escape") || tappedBack) {
      this.options.onAbort(this.trip());
      return;
    }

    // A finger held on an on-screen button counts the same as holding its key.
    const touches = input.touches();
    const touching = (r: keyof HeldControls): boolean => controls !== null && touches.some((p) => pointInRect(p, controls[r]));
    this.held = { left: touching("left"), right: touching("right"), thrust: touching("thrust"), brake: touching("brake") };
    const forward = input.isDown("KeyW") || input.isDown("ArrowUp") || this.held.thrust;
    const back = input.isDown("KeyS") || input.isDown("ArrowDown") || this.held.brake;
    const left = input.isDown("KeyA") || input.isDown("ArrowLeft") || this.held.left;
    const right = input.isDown("KeyD") || input.isDown("ArrowRight") || this.held.right;
    // Turning is free; thrusting and braking need fuel.
    this.thrust = this.fuel > 0 ? (forward ? 1 : 0) - (back ? 1 : 0) : 0;
    const turn = (right ? 1 : 0) - (left ? 1 : 0);

    const player = this.player;
    player.body = stepBody(player.body, { thrust: this.thrust, turn }, player.stats, dt);
    // A destroyed tank takes its fuel with it.
    const { mode, power } = activeThrust(player.stats, this.thrust);
    this.fuel = Math.min(player.stats.fuelCapacity, burnFuel(this.fuel, power, mode.fuelBurn, dt));
    this.options.sound.setListener(player.body);
    this.options.sound.thrust(power);

    // Newly triggered enemies arrive ahead of the ship. Once in the fight, each one gone is replaced from any direction.
    this.reached = Math.max(this.reached, this.progress());
    this.dangerFlash = Math.max(0, this.dangerFlash - dt);
    this.raiseDanger();
    if (this.guarded !== null) this.guardMet ||= distance(player.body, this.guarded) < DANGER.boss.guardRange;
    const roster = retarget(this.slots, this.wantedLevels());
    this.slots = roster.slots;
    for (const i of roster.added) this.spawnEnemy(this.slots[i], i, this.arrivalBody(this.slots[i]));
    const refill = fillSlots(this.slots, dt);
    this.slots = refill.slots;
    for (const i of refill.due) this.spawnEnemy(this.slots[i], i, respawnBody(player.body, Math.random));

    this.stepWorld(dt);
    // Only the first win gets a victory screen. A run already won just fights on.
    if (!this.celebrated && this.options.run.won === null && bossDefeated(this.slots)) {
      this.victoryTimer = COMBAT.wreckDelay;
      return;
    }
    if (isWrecked(player)) {
      this.wreckTimer = COMBAT.wreckDelay;
      this.explode(player);
      this.trauma = 1;
      return;
    }

    this.collectSalvage(dt);

    const follow = 1 - Math.exp(-CAMERA_FOLLOW * dt);
    this.camera = {
      x: this.camera.x + (player.body.x - this.camera.x) * follow,
      y: this.camera.y + (player.body.y - this.camera.y) * follow,
    };

    const dock = this.dockZone();
    if (dock !== null && speed(player.body) < FLIGHT.dockSpeed) this.options.onArrive(this.trip(), dock);
  }

  // Kills made this trip count toward notoriety straight away. When they raise danger, the trip switches to that
  // level's encounters from where the ship is now. A boss trip is already at top danger.
  private raiseDanger(): void {
    if (this.bossTrip) return;
    const run = this.options.run;
    const now = dangerTier({ ...run, kills: run.kills + this.kills });
    if (now <= this.danger) return;
    this.danger = now;
    this.encounters = DANGER.levels[now - 1];
    this.dangerFlash = DANGER_FLASH_SECONDS;
  }

  // The enemies the encounters triggered so far keep active. Carrying the Grand Haul, the boss joins only once the
  // ship nears its destination, however far along the route the ship is.
  private wantedLevels(): SlotLevel[] {
    const levels = activeLevels(this.encounters, this.reached);
    if (this.guarded === null) return levels;
    return [...levels.filter((level) => level !== "boss"), ...(this.guardMet ? ["boss" as const] : [])];
  }

  // Where a newly triggered enemy arrives: ahead of the ship, or for a boss guarding the Grand Haul's destination, there.
  private arrivalBody(slot: Slot): Body {
    const player = this.player.body;
    if (slot.level === "boss" && this.guarded !== null) return guardBody(this.guarded, this.guarded.dockRadius, player);
    return spawnBody(player, this.ahead(), Math.random);
  }

  // A tractor beam pulls salvage in, and flying into salvage picks it up, as long as the hold has room for it.
  private collectSalvage(dt: number): void {
    const player = this.player;
    this.pickups = pullPickups(this.pickups, player.body, player.stats.tractorRange, player.stats.tractorPull, dt);
    const free = player.stats.cargoCapacity - holdUsed(this.options.run) - salvageUnits(this.salvage);
    const { collected, left, blocked } = collectPickups(this.pickups, player.body, player.radius + FLIGHT.hexSize, free, ECONOMY.salvageUnits);
    this.pickups = left;
    for (const p of collected) {
      this.salvage.push(p.salvage);
      this.particles.push(...burst(p, BURSTS.salvaged, Math.random, { x: player.body.vx, y: player.body.vy }));
      this.options.sound.pickup();
    }
    this.holdFull = blocked ? HOLD_FULL_SECONDS : Math.max(0, this.holdFull - dt);
  }

  // A fresh enemy for slots[index], at `body`.
  private spawnEnemy(slot: Slot, index: number, body: Body): void {
    const tier: EnemyTier = slot.level === "boss" ? bossTier(shipValue(this.options.run.ship)) : ENEMY_TIERS[slot.level - 1];
    const ship = buildEnemy(tier, Math.random);
    const crew = computeShipStats(ship, 0).crewRequired; // enemies are always fully crewed
    const vessel = { ...makeVessel("enemy", ship, body, crew), aimError: tier.aimError };
    this.enemies.push({ vessel, bounty: bountyFor(ship), mode: "chase", thrust: 0, slot: index });
  }

  // The enemy is out of the fight, so its slot starts counting down to a replacement.
  private vacate(enemy: Enemy, destroyed: boolean): void {
    this.slots[enemy.slot] = vacate(this.slots[enemy.slot], destroyed);
  }

  private isBoss(enemy: Enemy): boolean {
    return this.slots[enemy.slot].level === "boss";
  }

  // Everything except the player's own controls: enemies, weapons, projectiles, upkeep and debris.
  private stepWorld(dt: number): void {
    const player = this.player;
    const alive = !isWrecked(player);

    for (const enemy of this.enemies) {
      const v = enemy.vessel;
      const pilot = { body: v.body, hull: v.stats.hull, fullHull: v.fullHull, range: weaponRange(v) };
      const { mode, controls } = aiControls(pilot, player.body);
      enemy.mode = mode;
      enemy.thrust = controls.thrust;
      v.body = stepBody(v.body, controls, v.stats, dt);
    }
    const enemies = this.enemies.map((e) => e.vessel);
    this.collide(alive ? [player, ...enemies] : enemies);
    // A fleeing enemy far enough away has escaped. The boss never escapes.
    const escaped = this.enemies.filter(
      (e) => e.mode === "flee" && !this.isBoss(e) && distance(e.vessel.body, player.body) >= ENCOUNTERS.despawnDistance,
    );
    for (const enemy of escaped) this.vacate(enemy, false);
    this.enemies = this.enemies.filter((e) => !escaped.includes(e));

    for (const v of [player, ...this.enemies.map((e) => e.vessel)]) this.upkeep(v, dt);

    const enemyVessels = this.enemies.map((e) => e.vessel).sort((a, b) => distance(a.body, player.body) - distance(b.body, player.body));
    // Each volley lands before the next ship fires, so two ships never shoot down the same missile or shell.
    const shooters = alive ? [player, ...enemyVessels] : [];
    for (const v of shooters) {
      const volley = fireWeapons(v, v === player ? enemyVessels : [player], this.projectiles, dt);
      const downed = volley.intercepts.map((i) => i.shot);
      this.projectiles = this.projectiles.filter((p) => !downed.includes(p));
      this.beams.push(...volley.intercepts.map((i) => i.beam));
      for (const { shot } of volley.intercepts) {
        this.particles.push(...burst(shot, BURSTS.intercept, Math.random));
        this.options.sound.intercept(shot);
      }
      this.projectiles.push(...volley.projectiles);
      for (const p of volley.projectiles) {
        if (p.kind === "missile") this.options.sound.missileLaunch(p);
        else this.options.sound.cannon(p);
      }
      for (const shot of volley.beams) {
        this.beams.push(shot.beam);
        this.options.sound.laser(shot.beam.from);
        if (shot.key) this.hit(shot.target, shot.key, shot.damage, "beam", shot.beam.to);
      }
    }

    const targets = alive ? [player, ...enemyVessels] : enemyVessels;
    const flying: Projectile[] = [];
    for (const p of this.projectiles) {
      const moved = stepProjectile(p, dt);
      const struck = projectileHit(moved, targets);
      if (struck) this.hit(struck.vessel, struck.key, moved.damage, moved.kind, moved);
      else if (moved.life > 0) flying.push(moved);
    }
    this.projectiles = flying;

    for (const enemy of this.enemies) {
      if (!isWrecked(enemy.vessel)) continue;
      this.bounty += enemy.bounty;
      this.kills += 1;
      this.vacate(enemy, true);
      this.explode(enemy.vessel);
      const nearby = Math.max(0, 1 - distance(enemy.vessel.body, player.body) / TRAUMA_KILL_RANGE);
      this.trauma = addTrauma(this.trauma, TRAUMA_KILL * nearby);
    }
    this.enemies = this.enemies.filter((e) => !isWrecked(e.vessel));

    this.beams = this.beams.map((b) => ({ ...b, age: b.age + dt })).filter((b) => b.age < COMBAT.beamFlash);
    this.debris = this.debris
      .map((d) => ({ ...d, x: d.x + d.vx * dt, y: d.y + d.vy * dt, angle: d.angle + d.spin * dt, age: d.age + dt }))
      .filter((d) => d.age < COMBAT.debrisLife);
    this.pickups = stepPickups(this.pickups, dt);

    if (alive) this.emitExhaust(player, this.thrust, dt);
    for (const enemy of this.enemies) this.emitExhaust(enemy.vessel, enemy.thrust, dt);
    for (const p of this.projectiles) {
      if (p.kind !== "missile") continue;
      for (let i = emitCount(MISSILE_SMOKE_RATE, dt, Math.random); i > 0; i--) {
        this.particles.push(exhaust(p, Math.atan2(-p.vy, -p.vx), { x: 0, y: 0 }, Math.random, MISSILE_SMOKE));
      }
    }
    this.particles = stepParticles(this.particles, dt);
    this.trauma = decayTrauma(this.trauma, dt);
  }

  // Puffs out of every engine that is firing: main engines on thrust, retro engines on brake.
  private emitExhaust(v: Vessel, thrust: number, dt: number): void {
    for (const part of v.ship.values()) {
      const flame = engineFlame(v.ship, part, thrust);
      if (flame <= 0) continue;
      const angle = v.body.angle + directionAngle(part.rotation);
      const center = hexWorld(v, part);
      const nozzle = { x: center.x + Math.cos(angle) * FLIGHT.hexSize, y: center.y + Math.sin(angle) * FLIGHT.hexSize };
      for (let i = emitCount(EXHAUST_RATE * flame, dt, Math.random); i > 0; i--) {
        this.particles.push(exhaust(nozzle, angle, { x: v.body.vx, y: v.body.vy }, Math.random));
      }
    }
  }

  // A whole ship going up.
  private explode(v: Vessel): void {
    this.particles.push(...burst(v.body, BURSTS.shipDestroyed, Math.random, { x: v.body.vx, y: v.body.vy }));
    this.options.sound.shipDestroyed(v.body);
  }

  // Shields recharge and crew patch up damaged parts.
  private upkeep(v: Vessel, dt: number): void {
    v.shields = rechargeShields(v.shields, v.ship, v.stats.efficiency, dt);
    const repaired = repairShip(v.ship, v.stats.repair * dt);
    if (repaired !== v.ship) setShip(v, repaired);
  }

  // Ships that touch bounce apart, and a hard enough hit damages the part on each side that struck.
  private collide(vessels: readonly Vessel[]): void {
    for (const [i, a] of vessels.entries()) {
      for (const b of vessels.slice(i + 1)) {
        const contact = findContact(a, b);
        if (!contact) continue;
        const damage = ramDamage(bounce(a, b, contact));
        if (damage <= 0) continue;
        this.hit(a, contact.aKey, damage, "ram", contact.point);
        this.hit(b, contact.bKey, damage, "ram", contact.point);
      }
    }
  }

  // `at` is where the shot landed, for sparks and sound.
  private hit(v: Vessel, key: string, damage: number, kind: HitKind, at: Point): void {
    const { throughShield, destroyed, detached } = applyHit(v, key, damage, kind);
    const drift = { x: v.body.vx, y: v.body.vy };
    if (throughShield > 0) {
      this.particles.push(...burst(at, BURSTS.hullHit, Math.random, drift));
      this.options.sound.hullHit(at);
    } else {
      this.particles.push(...burst(at, BURSTS.shieldHit, Math.random, drift));
      this.options.sound.shieldHit(at);
    }
    if (destroyed) {
      this.particles.push(...burst(hexWorld(v, destroyed), BURSTS.partDestroyed, Math.random, drift));
      this.options.sound.partDestroyed(at);
    }
    if (v === this.player) {
      this.trauma = addTrauma(this.trauma, throughShield * TRAUMA_PER_DAMAGE + (destroyed ? TRAUMA_PART_LOST : 0));
    }

    // The hit that destroys an enemy breaks it apart, and a few of its parts survive as salvage.
    const salvaged = v !== this.player && destroyed && isWrecked(v) ? pickSalvage(detached, Math.random) : [];
    for (const part of detached) {
      const p = hexWorld(v, part);
      const drift = {
        x: p.x,
        y: p.y,
        vx: v.body.vx + (Math.random() * 2 - 1) * COMBAT.debrisSpeed,
        vy: v.body.vy + (Math.random() * 2 - 1) * COMBAT.debrisSpeed,
        angle: v.body.angle,
        spin: Math.random() * 2 - 1,
        age: 0,
      };
      if (salvaged.includes(part)) this.pickups.push({ ...drift, salvage: { type: part.type, hp: part.hp } });
      else this.debris.push({ ...drift, part });
    }
    // The Flagship always leaves a tractor beam behind, on top of its salvage.
    const enemy = this.enemies.find((e) => e.vessel === v);
    if (enemy && this.isBoss(enemy) && destroyed && isWrecked(v)) {
      const { x, y, vx, vy } = v.body;
      this.pickups.push({ salvage: { type: "tractor", hp: PARTS.tractor.maxHp }, x, y, vx, vy, angle: 0, spin: 0.5, age: 0 });
    }
  }

  // How far out the ship is, as a share of the hop to the origin's nearest neighbour (see Encounter).
  private progress(): number {
    return Math.min(1, distance(this.player.body, this.from) / this.hop);
  }

  // A point well ahead of the ship: along its course when it's moving, else where it's facing. Enemies spawn that way.
  private ahead(): Point {
    const { body } = this.player;
    const moving = speed(body) > FLIGHT.dockSpeed;
    const angle = moving ? Math.atan2(body.vy, body.vx) : body.angle;
    return { x: body.x + Math.cos(angle) * 1000, y: body.y + Math.sin(angle) * 1000 };
  }

  // The index of the planet whose dock zone the ship is in, or null. The planet it left doesn't count.
  private dockZone(): number | null {
    const i = PLANETS.findIndex((p, i) => i !== this.origin && distance(this.player.body, p) < p.dockRadius);
    return i >= 0 ? i : null;
  }

  // Whether docking at `planet` would deliver any of the cargo aboard, open cargo included.
  private hasCargoFor(planet: number): boolean {
    return this.options.run.cargo.some((c) => deliverableAt(c, planet));
  }

  // Whether some cargo aboard is bound for `planet` in particular. Open cargo alone doesn't count, since it goes anywhere.
  private isBoundFor(planet: number): boolean {
    return this.options.run.cargo.some((c) => c.to === planet);
  }

  // The nearest planet to the ship other than the one it left.
  // Planets other than the one the ship left, within HALF_RANGE of what the fuel aboard flies from here, nearest first.
  // Same straight-line estimate as the station's fuel range.
  private inHalfRange(): number[] {
    const reach = fuelRange(this.player.stats, this.fuel) * HALF_RANGE;
    const near = (i: number): number => distance(this.player.body, PLANETS[i]);
    return PLANETS.map((_, i) => i)
      .filter((i) => i !== this.origin && near(i) <= reach)
      .sort((a, b) => near(a) - near(b));
  }

  private nearestPlanet(): Planet {
    const others = PLANETS.filter((_, i) => i !== this.origin);
    return others.reduce((best, p) => (distance(this.player.body, p) < distance(this.player.body, best) ? p : best));
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);
    this.renderStars(ctx, width, height);

    const shake = shakeOffset(this.trauma, Math.random);
    ctx.save();
    ctx.translate(width / 2 - this.camera.x + shake.x, height / 2 - this.camera.y + shake.y);
    const marked = this.inHalfRange();
    PLANETS.forEach((planet, i) => this.renderPlanet(ctx, i, planet, marked.includes(i)));
    this.renderDebris(ctx);
    this.renderPickups(ctx);
    for (const enemy of this.enemies) {
      this.renderVessel(ctx, enemy.vessel, enemy.thrust, THEME.bad);
      this.renderHullBar(ctx, enemy.vessel);
    }
    this.renderVessel(ctx, this.player, this.thrust);
    this.renderShots(ctx);
    drawParticles(ctx, this.particles);
    ctx.restore();

    // Planets with cargo bound for them are green; the rest grey. The planet the ship left gets no arrow.
    // Each label gives the planet's distance, and planets within half the fuel range get a dot by it.
    const inRange = this.inHalfRange();
    PLANETS.forEach((planet, i) => {
      if (i === this.origin) return;
      const label = `${planet.name} ${Math.round(distance(this.player.body, planet))}`;
      this.renderEdgeArrow(ctx, width, height, planet, this.isBoundFor(i) ? THEME.good : THEME.muted, label, inRange.includes(i));
    });
    for (const enemy of this.enemies) this.renderEdgeArrow(ctx, width, height, enemy.vessel.body, THEME.bad);
    for (const p of this.pickups) this.renderEdgeArrow(ctx, width, height, p, THEME.warn);
    this.renderHud(ctx, width, height);
  }

  private renderVessel(ctx: CanvasRenderingContext2D, v: Vessel, thrust: number, outline?: string): void {
    if (v.ship.size === 0) return;
    drawShip(ctx, v.ship, {
      origin: { x: v.body.x, y: v.body.y },
      angle: v.body.angle,
      pivot: v.pivot,
      size: FLIGHT.hexSize,
      thrust,
      outline,
    });
    // A bubble around each charged generator, as wide as the hexes it covers.
    const bubble = (COMBAT.shieldReach + 0.5) * Math.sqrt(3) * FLIGHT.hexSize;
    for (const [key, max] of shieldCapacity(v.ship)) {
      const charge = v.shields.get(key) ?? 0;
      if (charge <= 0) continue;
      const center = hexWorld(v, v.ship.get(key)!);
      ctx.save();
      ctx.globalAlpha = 0.15 + 0.5 * (charge / max);
      ctx.strokeStyle = PARTS.shield.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, bubble, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderHullBar(ctx: CanvasRenderingContext2D, v: Vessel): void {
    const w = 44;
    const x = v.body.x - w / 2;
    const y = v.body.y - v.radius - 14;
    ctx.fillStyle = THEME.panelBorder;
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = THEME.bad;
    ctx.fillRect(x, y, w * Math.max(0, v.stats.hull / v.fullHull), 4);
  }

  private renderShots(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineCap = "round";
    for (const beam of this.beams) {
      ctx.globalAlpha = 1 - beam.age / COMBAT.beamFlash;
      ctx.strokeStyle = PARTS.laser.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(beam.from.x, beam.from.y);
      ctx.lineTo(beam.to.x, beam.to.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of this.projectiles) {
      if (p.kind === "missile") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = PARTS.missile.color;
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = p.side === "enemy" ? THEME.bad : PARTS.cannon.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private renderDebris(ctx: CanvasRenderingContext2D): void {
    for (const d of this.debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.globalAlpha = 1 - d.age / COMBAT.debrisLife;
      drawPart(ctx, { ...d.part, hex: hex(0, 0) }, FLIGHT.hexSize, false);
      ctx.restore();
    }
  }

  // Salvage glows with a pulsing ring so it stands out from debris, and blinks when it's about to be lost.
  // Salvage a tractor beam is pulling in is tied to the ship by a faint beam.
  private renderPickups(ctx: CanvasRenderingContext2D): void {
    const { tractorRange, tractorPull } = this.player.stats;
    const body = this.player.body;
    if (tractorPull > 0 && !isWrecked(this.player)) {
      ctx.save();
      ctx.strokeStyle = PARTS.tractor.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -this.time * 30;
      ctx.globalAlpha = 0.45;
      for (const p of this.pickups) {
        if (distance(p, body) > tractorRange) continue;
        ctx.beginPath();
        ctx.moveTo(body.x, body.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const p of this.pickups) {
      const blinking = p.age > COMBAT.salvageLife - COMBAT.salvageBlink;
      if (blinking && Math.floor(this.time * 6) % 2 === 0) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 5);
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, FLIGHT.hexSize * 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.rotate(p.angle);
      drawPart(ctx, { hex: hex(0, 0), type: p.salvage.type, rotation: 0, hp: p.salvage.hp }, FLIGHT.hexSize, false);
      ctx.restore();
    }
  }

  private renderStars(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    STAR_LAYERS.forEach((layer, i) => {
      ctx.fillStyle = layer.color;
      for (const star of this.stars[i]) {
        const x = wrap(star.x - this.camera.x * layer.parallax, STAR_FIELD);
        const y = wrap(star.y - this.camera.y * layer.parallax, STAR_FIELD);
        if (x < width && y < height) ctx.fillRect(x, y, layer.size, layer.size);
      }
    });
  }

  // Every planet but the one the ship left shows its dock zone: green with cargo bound there, grey without.
  // `inRange` puts a dot by the name (see inHalfRange).
  private renderPlanet(ctx: CanvasRenderingContext2D, index: number, planet: Planet, inRange: boolean): void {
    if (index !== this.origin) {
      const color = this.isBoundFor(index) ? THEME.good : THEME.muted;
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.strokeStyle = color;
      ctx.globalAlpha = this.dockZone() === index ? 1 : 0.4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.dockRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const gradient = ctx.createRadialGradient(
      planet.x - planet.radius * 0.35,
      planet.y - planet.radius * 0.35,
      planet.radius * 0.1,
      planet.x,
      planet.y,
      planet.radius,
    );
    gradient.addColorStop(0, planet.color);
    gradient.addColorStop(1, "#0b0f1a");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
    ctx.fill();
    const labelY = planet.y + planet.radius + 22;
    drawText(ctx, planet.name, planet.x, labelY, { align: "center", bold: true, color: THEME.text });
    if (inRange) drawRangeDot(ctx, planet.x - ctx.measureText(planet.name).width / 2 - 9, labelY);
  }

  // When a point is off screen, an arrow at the edge points to it, with an optional label beside it,
  // and a dot before the label when `inRange` (see inHalfRange).
  private renderEdgeArrow(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    target: Point,
    color: string,
    label?: string,
    inRange = false,
  ): void {
    const dx = target.x - this.camera.x;
    const dy = target.y - this.camera.y;
    const margin = 40;
    if (Math.abs(dx) < width / 2 - margin && Math.abs(dy) < height / 2 - margin) return;

    const scale = Math.min((width / 2 - margin) / Math.abs(dx || 1), (height / 2 - margin) / Math.abs(dy || 1));
    const x = width / 2 + dx * scale;
    const y = height / 2 + dy * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (label) {
      // Beside an arrow on a side edge, reading away from it; above or below one on the top or bottom edge.
      const style = { size: 12, bold: true, color };
      ctx.font = "600 12px system-ui, sans-serif";
      const textWidth = ctx.measureText(label).width;
      const onRight = x >= width - margin - 1;
      const onLeft = x <= margin + 1;
      const left = onRight ? x - 18 - textWidth : onLeft ? x + 28 : x - textWidth / 2; // room for the dot on the left
      const labelY = onRight || onLeft ? y : y + (y < height / 2 ? 22 : -22);
      drawText(ctx, label, left, labelY, { ...style, align: "left" });
      if (inRange) drawRangeDot(ctx, left - 8, labelY);
    }
  }

  private renderHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const s = this.player.stats;
    const nearest = this.nearestPlanet();
    drawText(ctx, `Left ${this.from.name}`, 20, 26, { size: 16, bold: true });
    drawText(ctx, `Nearest: ${nearest.name} ${Math.round(distance(this.player.body, nearest))}`, 20, 50, { color: THEME.muted });
    drawText(ctx, `Speed ${Math.round(speed(this.player.body))}`, 20, 70, { color: THEME.muted });
    drawText(ctx, `Hull ${Math.round(s.hull)} / ${Math.round(s.maxHull)}`, 20, 90, { color: THEME.muted });
    drawText(ctx, `Shield ${Math.round(totalShield(this.player.shields))} / ${Math.round(s.shieldMax)}`, 20, 110, { color: THEME.muted });
    const hold = holdUsed(this.options.run) + salvageUnits(this.salvage);
    const salvaged = this.salvage.length > 0 ? `  ·  ${this.salvage.length} salvaged` : "";
    drawText(ctx, `Cargo ${hold} / ${s.cargoCapacity} units${salvaged}`, 20, 130, { color: this.holdFull > 0 ? THEME.bad : THEME.muted });
    const boss = this.bossTrip ? "  ·  BOSS" : "";
    drawText(ctx, `Day ${this.options.run.day}  ·  $${this.options.run.money}  ·  Danger ${this.danger}${boss}`, 20, 150, {
      color: this.bossTrip ? THEME.bad : THEME.muted,
    });
    drawText(ctx, `Bounties $${this.bounty} (${this.kills} kill${this.kills === 1 ? "" : "s"})`, 20, 170, {
      color: this.bounty > 0 ? THEME.good : THEME.muted,
    });
    this.renderFuelGauge(ctx, 20, 192);
    this.renderHalfRange(ctx, 20, 230);

    if (this.dangerFlash > 0) {
      drawText(ctx, `DANGER RISING: ${this.danger}`, width / 2, 70, { align: "center", size: 22, bold: true, color: THEME.bad });
    }
    if (this.holdFull > 0) {
      drawText(ctx, "HOLD FULL: no room for salvage", width / 2, 100, { align: "center", size: 18, bold: true, color: THEME.warn });
    }
    if (this.victoryTimer !== null) {
      drawText(ctx, "FLAGSHIP DESTROYED", width / 2, height / 2 - 110, { align: "center", size: 30, bold: true, color: THEME.good });
      drawText(ctx, "VICTORY", width / 2, height / 2 - 76, { align: "center", size: 20, bold: true, color: THEME.warn });
    } else if (this.wreckTimer !== null) {
      drawText(ctx, "CORE DESTROYED", width / 2, height / 2 - 90, { align: "center", size: 28, bold: true, color: THEME.bad });
    } else if (this.fuel <= 0) {
      drawText(ctx, "OUT OF FUEL", width / 2, height / 2 - 90, { align: "center", size: 24, bold: true, color: THEME.bad });
      drawText(ctx, `${this.touch ? "Call tow" : "Esc"}: call a tow back to ${this.from.name} (−$${ECONOMY.towFee})`, width / 2, height / 2 - 62, {
        align: "center",
        size: 15,
        color: THEME.text,
      });
    }

    const dock = this.dockZone();
    if (dock !== null) {
      const cargo = this.hasCargoFor(dock) ? "" : " (no cargo for here)";
      drawText(ctx, `Slow down to dock at ${PLANETS[dock].name}${cargo}`, width / 2, height - 70, { align: "center", size: 18, bold: true, color: THEME.warn });
    }
    this.controls = touchControlRects(width, height);
    if (this.touch) {
      if (this.wreckTimer === null && this.victoryTimer === null) drawTouchControls(ctx, this.controls, this.held, this.fuel > 0 ? "Turn back" : "Call tow");
      return;
    }
    drawText(ctx, `W / ↑ thrust · S / ↓ brake · A D / ← → turn · weapons fire on their own · Esc turn back · M ${this.options.sound.isMuted ? "unmute" : "mute"}`, width / 2, height - 24, {
      align: "center",
      color: THEME.muted,
    });
  }

  // The planets marked with a dot, nearest first, with their distances.
  private renderHalfRange(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const inRange = this.inHalfRange();
    if (inRange.length === 0) {
      drawText(ctx, "No planet within half your fuel range", x, y, { size: 12, color: THEME.warn });
      return;
    }
    drawRangeDot(ctx, x + 4, y);
    drawText(ctx, "Within half your fuel range:", x + 14, y, { size: 12, color: THEME.accent });
    inRange.forEach((i, row) => {
      const planet = PLANETS[i];
      const text = `${planet.name} ${Math.round(distance(this.player.body, planet))}`;
      drawText(ctx, text, x + 14, y + 18 * (row + 1), { size: 12, color: this.isBoundFor(i) ? THEME.good : THEME.text });
    });
  }

  private renderFuelGauge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const capacity = this.player.stats.fuelCapacity;
    const share = capacity > 0 ? this.fuel / capacity : 0;
    const w = 160;
    const color = share > 0.4 ? THEME.good : share > 0.15 ? THEME.warn : THEME.bad;
    drawText(ctx, `Fuel ${Math.ceil(this.fuel)} / ${capacity}`, x, y, { color });
    ctx.fillStyle = THEME.panelBorder;
    ctx.fillRect(x, y + 12, w, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 12, w * share, 6);
  }
}

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

// The marker for a planet within half the fuel range.
function drawRangeDot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = THEME.accent;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
