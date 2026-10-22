import { ECONOMY, FLIGHT, PLANETS, type Planet } from "../data/balance";
import { cargoUnits } from "../economy/contracts";
import { destination, type Run } from "../economy/run";
import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import type { Point } from "../hex/hex";
import { drawShip } from "../render/drawShip";
import { drawText, THEME } from "../render/ui";
import { centerOfMass } from "../ship/ship";
import { computeShipStats, type ShipStats } from "../ship/stats";
import { burnFuel } from "../sim/fuel";
import { enginePower, speed, stepBody, type Body } from "../sim/physics";

export type FlightOptions = {
  run: Run;
  onArrive: (fuelLeft: number) => void;
  onAbort: (fuelLeft: number) => void; // fuelLeft 0 means a tow is needed
};

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
  private body: Body;
  private stats: ShipStats;
  private pivot: Point;
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
    this.stats = computeShipStats(run.ship, run.crew);
    this.fuel = run.fuel;
    this.pivot = centerOfMass(run.ship, FLIGHT.hexSize);

    const heading = Math.atan2(this.to.y - this.from.y, this.to.x - this.from.x);
    const startDistance = this.from.radius + 80;
    this.body = {
      x: this.from.x + Math.cos(heading) * startDistance,
      y: this.from.y + Math.sin(heading) * startDistance,
      vx: 0,
      vy: 0,
      angle: heading,
    };
    this.camera = { x: this.body.x, y: this.body.y };
  }

  update(dt: number, input: Input): void {
    this.time += dt;
    if (input.wasPressed("Escape")) {
      this.options.onAbort(this.fuel);
      return;
    }

    const forward = input.isDown("KeyW") || input.isDown("ArrowUp");
    const back = input.isDown("KeyS") || input.isDown("ArrowDown");
    const left = input.isDown("KeyA") || input.isDown("ArrowLeft");
    const right = input.isDown("KeyD") || input.isDown("ArrowRight");
    // Turning is free; thrusting and braking need fuel.
    this.thrust = this.fuel > 0 ? (forward ? 1 : 0) - (back ? 1 : 0) : 0;
    const turn = (right ? 1 : 0) - (left ? 1 : 0);

    this.body = stepBody(this.body, { thrust: this.thrust, turn }, this.stats, dt);
    this.fuel = burnFuel(this.fuel, enginePower(this.thrust), this.stats.fuelBurn, dt);

    const follow = 1 - Math.exp(-CAMERA_FOLLOW * dt);
    this.camera = {
      x: this.camera.x + (this.body.x - this.camera.x) * follow,
      y: this.camera.y + (this.body.y - this.camera.y) * follow,
    };

    if (this.inDockZone() && speed(this.body) < FLIGHT.dockSpeed) this.options.onArrive(this.fuel);
  }

  private distanceToDestination(): number {
    return Math.hypot(this.to.x - this.body.x, this.to.y - this.body.y);
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
    drawShip(ctx, this.options.run.ship, {
      origin: { x: this.body.x, y: this.body.y },
      angle: this.body.angle,
      pivot: this.pivot,
      size: FLIGHT.hexSize,
      flames: Math.max(0, this.thrust),
    });
    ctx.restore();

    this.renderDestinationArrow(ctx, width, height);
    this.renderHud(ctx, width, height);
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

  // When the destination is off screen, an arrow at the edge points to it.
  private renderDestinationArrow(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const to = this.to;
    const dx = to.x - this.camera.x;
    const dy = to.y - this.camera.y;
    const margin = 40;
    if (Math.abs(dx) < width / 2 - margin && Math.abs(dy) < height / 2 - margin) return;

    const scale = Math.min((width / 2 - margin) / Math.abs(dx || 1), (height / 2 - margin) / Math.abs(dy || 1));
    const x = width / 2 + dx * scale;
    const y = height / 2 + dy * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = THEME.good;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const s = this.stats;
    drawText(ctx, `Flying to ${this.to.name}`, 20, 26, { size: 16, bold: true });
    drawText(ctx, `Distance ${Math.round(this.distanceToDestination())}`, 20, 50, { color: THEME.muted });
    drawText(ctx, `Speed ${Math.round(speed(this.body))}`, 20, 70, { color: THEME.muted });
    drawText(ctx, `Hull ${Math.round(s.hull)} / ${Math.round(s.maxHull)}`, 20, 90, { color: THEME.muted });
    drawText(ctx, `Cargo ${cargoUnits(this.options.run.cargo)} / ${s.cargoCapacity} units`, 20, 110, { color: THEME.muted });
    this.renderFuelGauge(ctx, 20, 150);
    drawText(ctx, `Day ${this.options.run.day}  ·  $${this.options.run.money}`, 20, 130, { color: THEME.muted });

    if (this.fuel <= 0) {
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
    drawText(ctx, "W / ↑ thrust · S / ↓ brake · A D / ← → turn · Esc turn back", width / 2, height - 24, {
      align: "center",
      color: THEME.muted,
    });
  }

  private renderFuelGauge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const capacity = this.stats.fuelCapacity;
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
    const total = Math.hypot(to.x - from.x, to.y - from.y);
    const progress = Math.min(1, Math.max(0, 1 - this.distanceToDestination() / total));
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
