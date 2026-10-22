import { COMBAT, ECONOMY, FLIGHT, PLANETS, type Planet } from "../data/balance";
import { ENCOUNTERS, ENEMY_TIERS } from "../data/enemies";
import { PARTS } from "../data/parts";
import { cargoUnits } from "../economy/contracts";
import { bountyFor, destination, type TripResult, type Run } from "../economy/run";
import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import { hex, type Point } from "../hex/hex";
import { drawPart, drawShip } from "../render/drawShip";
import { drawText, THEME } from "../render/ui";
import { repairShip } from "../ship/damage";
import type { PlacedPart } from "../ship/ship";
import { computeShipStats } from "../ship/stats";
import { aiControls, type AiMode } from "../sim/ai";
import { burnFuel } from "../sim/fuel";
import { enginePower, speed, stepBody, type Body } from "../sim/physics";
import { buildEnemy, spawnBody } from "../sim/spawner";
import { applyHit, hexWorld, isWrecked, makeVessel, setShip, type Vessel } from "../sim/vessel";
import { fireWeapons, projectileHit, stepProjectile, weaponRange, type Beam, type Projectile } from "../sim/weapons";

export type FlightOptions = {
  run: Run;
  onArrive: (trip: TripResult) => void;
  onAbort: (trip: TripResult) => void; // fuel 0 means a tow is needed
  onDestroyed: () => void; // the core was destroyed
};

type Enemy = { vessel: Vessel; bounty: number; mode: AiMode; thrust: number };

// A part knocked loose, drifting until it fades out.
type Debris = { part: PlacedPart; x: number; y: number; vx: number; vy: number; angle: number; spin: number; age: number };

const STAR_FIELD = 2048; // stars repeat every this many pixels
const STAR_LAYERS = [
  { parallax: 0.15, count: 220, size: 1, color: "#3b4766" },
  { parallax: 0.4, count: 120, size: 1.5, color: "#6b7aa0" },
  { parallax: 0.8, count: 50, size: 2, color: "#a9b6d8" },
];
const CAMERA_FOLLOW = 6; // higher = camera sticks closer to the ship

export class FlightScene implements Scene {
  private from: Planet;
  private to: Planet;
  private player: Vessel;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private beams: Beam[] = [];
  private debris: Debris[] = [];
  private encounters = [...ENCOUNTERS.at];
  private bounty = 0;
  private kills = 0;
  private wreckTimer: number | null = null; // counts down to Game Over once the core is lost
  private camera: Point;
  private thrust = 0;
  private fuel: number;
  private time = 0;
  private stars = STAR_LAYERS.map((layer) =>
    Array.from({ length: layer.count }, () => ({ x: Math.random() * STAR_FIELD, y: Math.random() * STAR_FIELD })),
  );

  constructor(private options: FlightOptions) {
    const { run } = options;
    this.from = PLANETS[run.docked];
    this.to = PLANETS[destination(run)];
    this.fuel = run.fuel;

    const heading = Math.atan2(this.to.y - this.from.y, this.to.x - this.from.x);
    const startDistance = this.from.radius + 80;
    const body = {
      x: this.from.x + Math.cos(heading) * startDistance,
      y: this.from.y + Math.sin(heading) * startDistance,
      vx: 0,
      vy: 0,
      angle: heading,
    };
    this.player = makeVessel("player", run.ship, body, run.crew);
    this.camera = { x: body.x, y: body.y };
  }

  private trip(): TripResult {
    return { fuel: this.fuel, ship: this.player.ship, bounty: this.bounty, kills: this.kills };
  }

  update(dt: number, input: Input): void {
    this.time += dt;

    if (this.wreckTimer !== null) {
      this.wreckTimer -= dt;
      this.thrust = 0;
      this.stepWorld(dt);
      if (this.wreckTimer <= 0) this.options.onDestroyed();
      return;
    }

    if (input.wasPressed("Escape")) {
      this.options.onAbort(this.trip());
      return;
    }

    const forward = input.isDown("KeyW") || input.isDown("ArrowUp");
    const back = input.isDown("KeyS") || input.isDown("ArrowDown");
    const left = input.isDown("KeyA") || input.isDown("ArrowLeft");
    const right = input.isDown("KeyD") || input.isDown("ArrowRight");
    // Turning is free; thrusting and braking need fuel.
    this.thrust = this.fuel > 0 ? (forward ? 1 : 0) - (back ? 1 : 0) : 0;
    const turn = (right ? 1 : 0) - (left ? 1 : 0);

    const player = this.player;
    player.body = stepBody(player.body, { thrust: this.thrust, turn }, player.stats, dt);
    // A destroyed tank takes its fuel with it.
    this.fuel = Math.min(player.stats.fuelCapacity, burnFuel(this.fuel, enginePower(this.thrust), player.stats.fuelBurn, dt));

    if (this.encounters.length > 0 && this.routeProgress() >= this.encounters[0]) {
      this.encounters.shift();
      this.spawnEnemy();
    }

    this.stepWorld(dt);
    if (isWrecked(player)) {
      this.wreckTimer = COMBAT.wreckDelay;
      return;
    }

    const follow = 1 - Math.exp(-CAMERA_FOLLOW * dt);
    this.camera = {
      x: this.camera.x + (player.body.x - this.camera.x) * follow,
      y: this.camera.y + (player.body.y - this.camera.y) * follow,
    };

    if (this.inDockZone() && speed(player.body) < FLIGHT.dockSpeed) this.options.onArrive(this.trip());
  }

  private spawnEnemy(): void {
    const tier = ENEMY_TIERS[0];
    const ship = buildEnemy(tier, Math.random);
    const body = spawnBody(this.player.body, this.to, Math.random);
    const crew = computeShipStats(ship, 0).crewRequired; // enemies are always fully crewed
    const vessel = { ...makeVessel("enemy", ship, body, crew), aimError: tier.aimError };
    this.enemies.push({ vessel, bounty: bountyFor(ship), mode: "chase", thrust: 0 });
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
    this.enemies = this.enemies.filter(
      (e) => e.mode !== "flee" || distance(e.vessel.body, player.body) < ENCOUNTERS.despawnDistance,
    );

    for (const v of [player, ...this.enemies.map((e) => e.vessel)]) this.upkeep(v, dt);

    const enemyVessels = this.enemies.map((e) => e.vessel).sort((a, b) => distance(a.body, player.body) - distance(b.body, player.body));
    const volleys = alive ? [fireWeapons(player, enemyVessels, dt)] : [];
    if (alive) for (const v of enemyVessels) volleys.push(fireWeapons(v, [player], dt));
    for (const volley of volleys) {
      this.projectiles.push(...volley.projectiles);
      for (const shot of volley.beams) {
        this.beams.push(shot.beam);
        if (shot.key) this.hit(shot.target, shot.key, shot.damage);
      }
    }

    const targets = alive ? [player, ...enemyVessels] : enemyVessels;
    const flying: Projectile[] = [];
    for (const p of this.projectiles) {
      const moved = stepProjectile(p, dt);
      const struck = projectileHit(moved, targets);
      if (struck) this.hit(struck.vessel, struck.key, moved.damage);
      else if (moved.life > 0) flying.push(moved);
    }
    this.projectiles = flying;

    for (const enemy of this.enemies) {
      if (!isWrecked(enemy.vessel)) continue;
      this.bounty += enemy.bounty;
      this.kills += 1;
    }
    this.enemies = this.enemies.filter((e) => !isWrecked(e.vessel));

    this.beams = this.beams.map((b) => ({ ...b, age: b.age + dt })).filter((b) => b.age < COMBAT.beamFlash);
    this.debris = this.debris
      .map((d) => ({ ...d, x: d.x + d.vx * dt, y: d.y + d.vy * dt, angle: d.angle + d.spin * dt, age: d.age + dt }))
      .filter((d) => d.age < COMBAT.debrisLife);
  }

  // Shields recharge and crew patch up damaged parts.
  private upkeep(v: Vessel, dt: number): void {
    v.shield = Math.min(v.stats.shieldMax, v.shield + v.stats.shieldRegen * dt);
    const repaired = repairShip(v.ship, v.stats.repair * dt);
    if (repaired !== v.ship) setShip(v, repaired);
  }

  private hit(v: Vessel, key: string, damage: number): void {
    const { detached } = applyHit(v, key, damage);
    for (const part of detached) {
      const p = hexWorld(v, part);
      this.debris.push({
        part,
        x: p.x,
        y: p.y,
        vx: v.body.vx + (Math.random() * 2 - 1) * COMBAT.debrisSpeed,
        vy: v.body.vy + (Math.random() * 2 - 1) * COMBAT.debrisSpeed,
        angle: v.body.angle,
        spin: Math.random() * 2 - 1,
        age: 0,
      });
    }
  }

  private distanceToDestination(): number {
    return Math.hypot(this.to.x - this.player.body.x, this.to.y - this.player.body.y);
  }

  private routeProgress(): number {
    const total = Math.hypot(this.to.x - this.from.x, this.to.y - this.from.y);
    return Math.min(1, Math.max(0, 1 - this.distanceToDestination() / total));
  }

  private inDockZone(): boolean {
    return this.distanceToDestination() < this.to.dockRadius;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);
    this.renderStars(ctx, width, height);

    ctx.save();
    ctx.translate(width / 2 - this.camera.x, height / 2 - this.camera.y);
    this.renderPlanet(ctx, this.from, false);
    this.renderPlanet(ctx, this.to, true);
    this.renderDebris(ctx);
    for (const enemy of this.enemies) {
      this.renderVessel(ctx, enemy.vessel, enemy.thrust, THEME.bad);
      this.renderHullBar(ctx, enemy.vessel);
    }
    this.renderVessel(ctx, this.player, this.thrust);
    this.renderShots(ctx);
    ctx.restore();

    this.renderEdgeArrow(ctx, width, height, this.to, THEME.good);
    for (const enemy of this.enemies) this.renderEdgeArrow(ctx, width, height, enemy.vessel.body, THEME.bad);
    this.renderHud(ctx, width, height);
  }

  private renderVessel(ctx: CanvasRenderingContext2D, v: Vessel, thrust: number, outline?: string): void {
    if (v.ship.size === 0) return;
    drawShip(ctx, v.ship, {
      origin: { x: v.body.x, y: v.body.y },
      angle: v.body.angle,
      pivot: v.pivot,
      size: FLIGHT.hexSize,
      flames: Math.max(0, thrust),
      outline,
    });
    if (v.stats.shieldMax > 0 && v.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.15 + 0.5 * (v.shield / v.stats.shieldMax);
      ctx.strokeStyle = PARTS.shield.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(v.body.x, v.body.y, v.radius + 6, 0, Math.PI * 2);
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

  private renderPlanet(ctx: CanvasRenderingContext2D, planet: Planet, isDestination: boolean): void {
    if (isDestination) {
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.strokeStyle = this.inDockZone() ? THEME.good : "#5fd38d66";
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
    drawText(ctx, planet.name, planet.x, planet.y + planet.radius + 22, { align: "center", bold: true, color: THEME.text });
  }

  // When a point is off screen, an arrow at the edge points to it.
  private renderEdgeArrow(ctx: CanvasRenderingContext2D, width: number, height: number, target: Point, color: string): void {
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
  }

  private renderHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const s = this.player.stats;
    drawText(ctx, `Flying to ${this.to.name}`, 20, 26, { size: 16, bold: true });
    drawText(ctx, `Distance ${Math.round(this.distanceToDestination())}`, 20, 50, { color: THEME.muted });
    drawText(ctx, `Speed ${Math.round(speed(this.player.body))}`, 20, 70, { color: THEME.muted });
    drawText(ctx, `Hull ${Math.round(s.hull)} / ${Math.round(s.maxHull)}`, 20, 90, { color: THEME.muted });
    drawText(ctx, `Shield ${Math.round(this.player.shield)} / ${Math.round(s.shieldMax)}`, 20, 110, { color: THEME.muted });
    drawText(ctx, `Cargo ${cargoUnits(this.options.run.cargo)} / ${s.cargoCapacity} units`, 20, 130, { color: THEME.muted });
    drawText(ctx, `Day ${this.options.run.day}  ·  $${this.options.run.money}`, 20, 150, { color: THEME.muted });
    drawText(ctx, `Bounties $${this.bounty} (${this.kills} kill${this.kills === 1 ? "" : "s"})`, 20, 170, {
      color: this.bounty > 0 ? THEME.good : THEME.muted,
    });
    this.renderFuelGauge(ctx, 20, 192);

    if (this.wreckTimer !== null) {
      drawText(ctx, "CORE DESTROYED", width / 2, height / 2 - 90, { align: "center", size: 28, bold: true, color: THEME.bad });
    } else if (this.fuel <= 0) {
      drawText(ctx, "OUT OF FUEL", width / 2, height / 2 - 90, { align: "center", size: 24, bold: true, color: THEME.bad });
      drawText(ctx, `Esc: call a tow back to ${this.from.name} (−$${ECONOMY.towFee})`, width / 2, height / 2 - 62, {
        align: "center",
        size: 15,
        color: THEME.text,
      });
    }

    this.renderRouteBar(ctx, width);

    if (this.inDockZone()) {
      drawText(ctx, "Slow down to dock", width / 2, height - 70, { align: "center", size: 18, bold: true, color: THEME.warn });
    }
    drawText(ctx, "W / ↑ thrust · S / ↓ brake · A D / ← → turn · weapons fire on their own · Esc turn back", width / 2, height - 24, {
      align: "center",
      color: THEME.muted,
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

  // A progress bar from origin to destination along the top of the screen.
  private renderRouteBar(ctx: CanvasRenderingContext2D, width: number): void {
    const { from, to } = this;
    const progress = this.routeProgress();
    const barWidth = Math.min(420, width - 480);
    const x = (width - barWidth) / 2;
    const y = 26;
    ctx.fillStyle = THEME.panelBorder;
    ctx.fillRect(x, y - 1, barWidth, 2);
    ctx.fillStyle = THEME.good;
    ctx.fillRect(x, y - 1, barWidth * progress, 2);
    drawText(ctx, from.name, x - 10, y, { align: "right", color: THEME.muted, size: 12 });
    drawText(ctx, to.name, x + barWidth + 10, y, { align: "left", color: THEME.muted, size: 12 });
    ctx.fillStyle = THEME.text;
    ctx.beginPath();
    ctx.arc(x + barWidth * progress, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const distance = (a: Body, b: Body): number => Math.hypot(a.x - b.x, a.y - b.y);
