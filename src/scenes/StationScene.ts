import { ECONOMY, PLANETS } from "../data/balance";
import { BUILDABLE, PARTS, type PartId } from "../data/parts";
import { cargoUnits, contractPay, loadContract, reputation, unloadContract, type Contract } from "../economy/contracts";
import { fireCrew, hireCrew, hiringFees, wages } from "../economy/crew";
import { refuel, refuelCost } from "../economy/fuel";
import { destination, expectedPay, launchCost, launchProblems, tripDistance, type Outcome, type Run } from "../economy/run";
import { buyPart, repairAll, repairCost, sellPart, sellValue } from "../economy/shop";
import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import { hexesInRadius, hexKey, hexToPixel, mod6, neighbor, pixelToHex, type Hex, type Point } from "../hex/hex";
import { drawHex } from "../render/drawHex";
import { drawFiringArc, drawPart, drawShip } from "../render/drawShip";
import { drawButton, drawPanel, drawText, pointInRect, THEME, wrapText, type Rect } from "../render/ui";
import { partAt, rotatePart, shipValue, type PlacedPart } from "../ship/ship";
import { computeShipStats, type ShipStats } from "../ship/stats";
import { validateShip, type Validation } from "../ship/validate";
import { tripFuelEstimate } from "../sim/fuel";

const MAX_HEX_SIZE = 28;
const GRID_RADIUS = 5;
const PALETTE_WIDTH = 230;
const SIDE_WIDTH = 280;
const ROW_HEIGHT = 44;
const TOP_BAR = 64;
const BOARD_HEIGHT = 128;
const MESSAGE_SECONDS = 2.5;
const REPORT_SECONDS = 6;

const HOTKEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"];

const NO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

export type StationOptions = {
  run: Run;
  report?: string; // shown on arrival, e.g. what the last trip earned
  onLaunch: (run: Run) => void;
};

// Docked at a planet: build and trade parts, manage crew, repair, pick contracts, launch.
export class StationScene implements Scene {
  private run: Run;
  private stats: ShipStats;
  private validation: Validation;
  private problems: string[];
  private launchCost: number;
  private tripFuel: number;

  private grid = new Set(hexesInRadius(GRID_RADIUS).map(hexKey));
  // The part type being built with, or null for inspect mode (click a placed part to select it).
  private tool: PartId | null = null;
  private inspected: Hex | null = null;
  private rotations: Record<PartId, number> = {
    bridge: 0,
    engine: 3,
    fuel: 0,
    crew: 0,
    laser: 0,
    cannon: 0,
    missile: 0,
    cargo: 0,
    armor: 0,
    shield: 0,
  };
  private hovered: Hex | null = null;
  private mouse: Point = { x: 0, y: 0 };
  private message = "";
  private messageColor: string = THEME.warn;
  private messageTimer = 0;

  // Layout, recalculated every render from the canvas size.
  private hexSize = MAX_HEX_SIZE;
  private gridCenter: Point = { x: 0, y: 0 };
  private paletteRows: Rect[] = [];
  private contractCards: { rect: Rect; contract: Contract; loaded: boolean }[] = [];
  private hireButton = NO_RECT;
  private fireButton = NO_RECT;
  private repairButton = NO_RECT;
  private refuelButton = NO_RECT;
  private launchButton = NO_RECT;

  constructor(private options: StationOptions) {
    this.run = options.run;
    this.stats = computeShipStats(this.run.ship, this.run.crew);
    this.validation = validateShip(this.run.ship);
    this.problems = launchProblems(this.run);
    this.launchCost = launchCost(this.run);
    this.tripFuel = tripFuelEstimate(this.stats, tripDistance(this.run));
    if (options.report) this.flash(options.report, THEME.good, REPORT_SECONDS);
  }

  update(dt: number, input: Input): void {
    this.mouse = input.mouse;
    this.messageTimer = Math.max(0, this.messageTimer - dt);

    BUILDABLE.forEach((id, i) => {
      if (input.wasPressed(HOTKEYS[i])) this.pickTool(id);
    });
    if (input.wasPressed("Escape")) {
      this.tool = null;
      this.inspected = null;
    }
    if (input.wasPressed("KeyR")) {
      const step = input.isDown("ShiftLeft") || input.isDown("ShiftRight") ? -1 : 1;
      if (this.tool) {
        this.rotations[this.tool] = mod6(this.rotations[this.tool] + step);
      } else if (this.inspected) {
        this.rotateInspected(step);
      }
    }
    if ((input.wasPressed("Delete") || input.wasPressed("Backspace")) && this.inspected) {
      this.handleSell(this.inspected);
    }

    const local = { x: this.mouse.x - this.gridCenter.x, y: this.mouse.y - this.gridCenter.y };
    const h = pixelToHex(local, this.hexSize);
    this.hovered = this.grid.has(hexKey(h)) ? h : null;

    if (input.wasClicked(0)) this.handleLeftClick();
    if (input.wasClicked(2) && this.hovered) this.handleSell(this.hovered);
  }

  // Picking the active tool again puts it away.
  private pickTool(id: PartId): void {
    this.tool = this.tool === id ? null : id;
    this.inspected = null;
  }

  private handleLeftClick(): void {
    const row = this.paletteRows.findIndex((r) => pointInRect(this.mouse, r));
    if (row >= 0) {
      this.pickTool(BUILDABLE[row]);
      return;
    }
    const card = this.contractCards.find((c) => pointInRect(this.mouse, c.rect));
    if (card) {
      this.apply(card.loaded ? unloadContract(this.run, card.contract.id) : loadContract(this.run, card.contract.id));
      return;
    }
    if (pointInRect(this.mouse, this.hireButton)) {
      this.apply(hireCrew(this.run));
      return;
    }
    if (pointInRect(this.mouse, this.fireButton)) {
      this.apply(fireCrew(this.run));
      return;
    }
    if (pointInRect(this.mouse, this.repairButton)) {
      this.apply(repairAll(this.run));
      return;
    }
    if (pointInRect(this.mouse, this.refuelButton)) {
      this.apply(refuel(this.run));
      return;
    }
    if (pointInRect(this.mouse, this.launchButton)) {
      if (this.problems.length === 0) this.options.onLaunch(this.run);
      return;
    }
    if (!this.tool) {
      this.inspected = this.hovered && partAt(this.run.ship, this.hovered) ? this.hovered : null;
      return;
    }
    if (this.hovered) this.apply(buyPart(this.run, this.hovered, this.tool, this.rotations[this.tool]));
  }

  // Turning a part is free.
  private rotateInspected(step: number): void {
    const part = this.inspectedPart();
    if (!part) return;
    if (!usesRotation(part)) {
      this.flash(`${PARTS[part.type].name} doesn't need rotating.`);
      return;
    }
    this.setRun({ ...this.run, ship: rotatePart(this.run.ship, part.hex, step) });
  }

  private handleSell(h: Hex): void {
    if (!partAt(this.run.ship, h)) return;
    this.apply(sellPart(this.run, h));
    if (this.inspected && !partAt(this.run.ship, this.inspected)) this.inspected = null;
  }

  private apply(outcome: Outcome): void {
    if (outcome.ok) {
      this.setRun(outcome.run);
    } else {
      this.flash(outcome.reason);
    }
  }

  private setRun(run: Run): void {
    this.run = run;
    this.stats = computeShipStats(run.ship, run.crew);
    this.validation = validateShip(run.ship);
    this.problems = launchProblems(run);
    this.launchCost = launchCost(run);
    this.tripFuel = tripFuelEstimate(this.stats, tripDistance(run));
  }

  private inspectedPart(): PlacedPart | undefined {
    return this.inspected ? partAt(this.run.ship, this.inspected) : undefined;
  }

  private flash(message: string, color: string = THEME.warn, seconds = MESSAGE_SECONDS): void {
    this.message = message;
    this.messageColor = color;
    this.messageTimer = seconds;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);

    const centerLeft = PALETTE_WIDTH + 32;
    const centerRight = width - SIDE_WIDTH - 32;
    const gridTop = TOP_BAR;
    const gridBottom = height - BOARD_HEIGHT - 44;
    this.hexSize = Math.min(MAX_HEX_SIZE, (gridBottom - gridTop) / 17, (centerRight - centerLeft) / 19);
    this.gridCenter = { x: (centerLeft + centerRight) / 2, y: (gridTop + gridBottom) / 2 };

    this.renderTopBar(ctx);
    this.renderGrid(ctx);
    this.renderPalette(ctx, height);
    this.renderSidePanel(ctx, width, height);
    this.renderContractBoard(ctx, { x: centerLeft, y: height - BOARD_HEIGHT - 36, w: centerRight - centerLeft, h: BOARD_HEIGHT });

    const help = this.tool
      ? "Left-click buy & place · Right-click sell · R / Shift+R rotate · Esc or click part again to stop building"
      : "Click a part to select it · R / Shift+R rotate · Del sell · 1-8 pick a part to build";
    drawText(ctx, help, this.gridCenter.x, height - 18, { align: "center", color: THEME.muted, size: 12 });
  }

  private renderTopBar(ctx: CanvasRenderingContext2D): void {
    const planet = PLANETS[this.run.docked];
    drawText(ctx, `Docked at ${planet.name}`, this.gridCenter.x, 28, { align: "center", size: 18, bold: true, color: planet.color });
    drawText(ctx, `Day ${this.run.day}  ·  $${this.run.money}`, this.gridCenter.x, 50, { align: "center", size: 15, bold: true });
    if (this.messageTimer > 0) {
      drawText(ctx, this.message, this.gridCenter.x, TOP_BAR + 8, { align: "center", size: 15, bold: true, color: this.messageColor });
    }
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    const size = this.hexSize;
    for (const h of hexesInRadius(GRID_RADIUS)) {
      drawHex(ctx, this.toScreen(h), size - 1, { fill: THEME.gridFill, stroke: THEME.gridStroke });
    }

    const flagged = new Set([...this.validation.disconnected, ...this.validation.blockedEngines]);
    drawShip(ctx, this.run.ship, { origin: this.gridCenter, size, flagged });

    // Red markers on exhaust hexes that are blocked.
    for (const key of this.validation.blockedEngines) {
      const engine = this.run.ship.get(key)!;
      this.drawBlockedMarker(ctx, this.toScreen(neighbor(engine.hex, engine.rotation)));
    }

    if (this.tool) {
      if (this.hovered) this.renderGhost(ctx, this.tool, this.hovered);
      return;
    }
    const hoveredPart = this.hovered ? partAt(this.run.ship, this.hovered) : undefined;
    const inspected = this.inspectedPart();
    if (hoveredPart && hoveredPart !== inspected) {
      drawHex(ctx, this.toScreen(hoveredPart.hex), size - 1, { stroke: THEME.text, lineWidth: 1.5 });
    }
    if (inspected) {
      this.renderPartGuides(ctx, inspected.type, inspected.hex, inspected.rotation);
      drawHex(ctx, this.toScreen(inspected.hex), size - 1, { stroke: THEME.accent, lineWidth: 3 });
    }
  }

  // Firing arc for weapons and the exhaust hex for engines.
  private renderPartGuides(ctx: CanvasRenderingContext2D, type: PartId, h: Hex, rotation: number): void {
    const def = PARTS[type];
    if (def.weapon) drawFiringArc(ctx, this.toScreen(h), rotation, def.weapon.arc, this.hexSize * 4, def.color);
    if (type === "engine") {
      const exhaust = neighbor(h, rotation);
      const blocked = this.run.ship.has(hexKey(exhaust));
      drawHex(ctx, this.toScreen(exhaust), this.hexSize - 6, { stroke: blocked ? THEME.bad : THEME.warn, lineWidth: 1.5 });
    }
  }

  private renderGhost(ctx: CanvasRenderingContext2D, tool: PartId, h: Hex): void {
    const existing = partAt(this.run.ship, h);
    const p = this.toScreen(h);
    if (existing?.type === "bridge") {
      drawHex(ctx, p, this.hexSize - 1, { stroke: THEME.bad, lineWidth: 2 });
      return;
    }
    const def = PARTS[tool];
    const rotation = this.rotations[tool];
    this.renderPartGuides(ctx, tool, h, rotation);

    ctx.save();
    ctx.translate(this.gridCenter.x, this.gridCenter.y);
    ctx.globalAlpha = 0.6;
    drawPart(ctx, { hex: h, type: tool, rotation, hp: def.maxHp }, this.hexSize, false);
    ctx.restore();
    const affordable = this.run.money + (existing ? sellValue(existing) : 0) >= def.cost || existing?.type === tool;
    drawHex(ctx, p, this.hexSize - 1, { stroke: affordable ? THEME.accent : THEME.bad, lineWidth: 2 });
  }

  private drawBlockedMarker(ctx: CanvasRenderingContext2D, p: Point): void {
    const d = this.hexSize * 0.3;
    ctx.save();
    ctx.strokeStyle = THEME.bad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x - d, p.y - d);
    ctx.lineTo(p.x + d, p.y + d);
    ctx.moveTo(p.x + d, p.y - d);
    ctx.lineTo(p.x - d, p.y + d);
    ctx.stroke();
    ctx.restore();
  }

  private renderPalette(ctx: CanvasRenderingContext2D, height: number): void {
    const panel = { x: 16, y: 16, w: PALETTE_WIDTH, h: height - 32 };
    drawPanel(ctx, panel);
    drawText(ctx, "PARTS", panel.x + 14, panel.y + 22, { bold: true, color: THEME.muted });

    this.paletteRows = BUILDABLE.map((_, i) => ({ x: panel.x + 6, y: panel.y + 40 + i * ROW_HEIGHT, w: panel.w - 12, h: ROW_HEIGHT - 4 }));
    BUILDABLE.forEach((id, i) => {
      const r = this.paletteRows[i];
      const def = PARTS[id];
      const isSelected = id === this.tool;
      if (isSelected || pointInRect(this.mouse, r)) {
        ctx.fillStyle = isSelected ? "#1e2c48" : "#182238";
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      if (isSelected) {
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(r.x, r.y, 3, r.h);
      }
      ctx.save();
      ctx.translate(r.x + 26, r.y + r.h / 2);
      drawPart(ctx, { hex: { q: 0, r: 0 }, type: id, rotation: id === "engine" ? 3 : 0, hp: def.maxHp }, 16, false);
      ctx.restore();
      drawText(ctx, def.name, r.x + 52, r.y + 14, { bold: isSelected });
      const affordable = this.run.money >= def.cost;
      drawText(ctx, `$${def.cost}`, r.x + 52, r.y + 29, { size: 12, color: affordable ? THEME.muted : THEME.bad });
      drawText(ctx, String(i + 1), r.x + r.w - 10, r.y + r.h / 2, { align: "right", color: THEME.muted });
    });

    let y = panel.y + 40 + BUILDABLE.length * ROW_HEIGHT + 16;
    const x = panel.x + 14;
    const textWidth = panel.w - 28;

    // Building: describe the tool. Inspecting: describe the selected part, else the hovered one.
    const shown = this.inspectedPart() ?? (this.hovered ? partAt(this.run.ship, this.hovered) : undefined);
    const type = this.tool ?? shown?.type;
    if (!type) {
      drawText(ctx, "Nothing selected", x, y, { bold: true, color: THEME.muted });
      y += 20;
      for (const lineText of wrapText(ctx, "Click a part on the ship to select it, or pick one above to build.", textWidth)) {
        drawText(ctx, lineText, x, y, { color: THEME.muted });
        y += 17;
      }
      return;
    }

    const def = PARTS[type];
    const title = this.tool ? `Building: ${def.name}` : this.inspected ? `Selected: ${def.name}` : def.name;
    drawText(ctx, title, x, y, { bold: true, color: def.color });
    y += 20;
    for (const lineText of wrapText(ctx, def.description, textWidth)) {
      drawText(ctx, lineText, x, y, { color: THEME.muted });
      y += 17;
    }
    y += 6;
    if (!this.tool && shown) {
      drawText(ctx, `HP ${shown.hp} / ${def.maxHp}`, x, y, { size: 12, color: shown.hp < def.maxHp ? THEME.warn : THEME.text });
      y += 16;
      if (usesRotation(shown)) {
        const label = shown.type === "engine" ? "Exhaust points" : "Facing";
        drawText(ctx, `${label} ${FACING_NAMES[shown.rotation]}`, x, y, { size: 12 });
        y += 16;
      }
      if (shown.type !== "bridge") {
        drawText(ctx, `Sells for $${sellValue(shown)}`, x, y, { size: 12 });
        y += 16;
      }
    }
    for (const lineText of partDetails(type)) {
      drawText(ctx, lineText, x, y, { size: 12 });
      y += 16;
    }
    if (this.inspected && shown && shown.type !== "bridge") {
      y += 8;
      const actions = usesRotation(shown) ? "R rotate · Del sell · Esc deselect" : "Del sell · Esc deselect";
      drawText(ctx, actions, x, y, { size: 12, color: THEME.accent });
    }
  }

  private renderSidePanel(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const panel = { x: width - SIDE_WIDTH - 16, y: 16, w: SIDE_WIDTH, h: height - 32 };
    const left = panel.x + 14;
    const right = panel.x + panel.w - 14;
    drawPanel(ctx, panel);

    const row = (label: string, value: string, y: number, color: string = THEME.text) => {
      drawText(ctx, label, left, y, { color: THEME.muted });
      drawText(ctx, value, right, y, { align: "right", color });
    };

    // Ship
    const s = this.stats;
    let y = panel.y + 22;
    drawText(ctx, "SHIP", left, y, { bold: true, color: THEME.muted });
    y += 24;
    const rows: [string, string][] = [
      ["Value", `$${shipValue(this.run.ship)}`],
      ["Mass", fmt(s.mass)],
      ["Acceleration", fmt(s.acceleration, 2)],
      ["Turn rate", fmt(s.turnRate, 2)],
      ["Shield", s.shieldMax > 0 ? `${fmt(s.shieldMax)} (+${fmt(s.shieldRegen, 1)}/s)` : "none"],
      ["Firepower", `${fmt(s.dps, 1)} dps`],
      ["Cargo hold", `${s.cargoCapacity} units`],
    ];
    for (const [label, value] of rows) {
      row(label, value, y);
      y += 20;
    }

    // Hull and repairs
    const repair = repairCost(this.run.ship);
    row("Hull", `${fmt(s.hull)} / ${fmt(s.maxHull)}`, y, repair > 0 ? THEME.warn : THEME.text);
    y += 14;
    this.repairButton = repair > 0 ? { x: left, y, w: right - left, h: 26 } : NO_RECT;
    if (repair > 0) {
      this.smallButton(ctx, this.repairButton, `Repair all  $${repair}`, this.run.money >= repair);
      y += 32;
    } else {
      y += 6;
    }

    // Fuel
    y += 14;
    drawText(ctx, "FUEL", left, y, { bold: true, color: THEME.muted });
    y += 24;
    const lowFuel = this.run.fuel < this.tripFuel;
    row("Tanks", `${Math.floor(this.run.fuel)} / ${s.fuelCapacity} units`, y, lowFuel ? THEME.warn : THEME.text);
    y += 20;
    row("Burn at full thrust", `${fmt(s.fuelBurn, 1)} / s`, y);
    y += 20;
    const estimate = Number.isFinite(this.tripFuel) ? `~${this.tripFuel} units` : "—";
    row("Trip needs (est.)", estimate, y, lowFuel ? THEME.warn : THEME.text);
    y += 14;
    const refuelPrice = refuelCost(this.run);
    this.refuelButton = refuelPrice > 0 ? { x: left, y, w: right - left, h: 26 } : NO_RECT;
    if (refuelPrice > 0) {
      const label = this.run.money >= refuelPrice ? `Refuel  $${refuelPrice}` : `Refuel what you can afford`;
      this.smallButton(ctx, this.refuelButton, label, this.run.money >= ECONOMY.fuelPrice);
      y += 32;
    } else {
      y += 6;
    }

    // Crew
    y += 14;
    drawText(ctx, "CREW", left, y, { bold: true, color: THEME.muted });
    y += 24;
    const crewColor = this.run.crew < s.crewRequired || this.run.crew > s.crewCapacity ? THEME.warn : THEME.text;
    drawText(ctx, `${this.run.crew} aboard`, left, y, { bold: true, color: crewColor });
    this.fireButton = { x: right - 62, y: y - 12, w: 28, h: 24 };
    this.hireButton = { x: right - 28, y: y - 12, w: 28, h: 24 };
    this.smallButton(ctx, this.fireButton, "−", this.run.crew > 0);
    this.smallButton(ctx, this.hireButton, "+", this.run.crew < s.crewCapacity);
    y += 22;
    drawText(ctx, `${s.crewRequired} needed · ${s.crewCapacity} berths`, left, y, { color: THEME.muted, size: 12 });
    y += 18;
    drawText(ctx, `Hire $${ECONOMY.crewHireCost} · Wage $${ECONOMY.crewWage}/trip · paid at launch`, left, y, { color: THEME.muted, size: 12 });
    y += 18;
    if (s.efficiency < 1) {
      drawText(ctx, `Under-crewed: systems at ${Math.round(s.efficiency * 100)}%`, left, y, { color: THEME.warn, size: 12 });
      y += 18;
    }

    // Launch
    y += 16;
    drawText(ctx, `TRIP TO ${PLANETS[destination(this.run)].name.toUpperCase()}`, left, y, { bold: true, color: THEME.muted });
    y += 24;
    const pay = expectedPay(this.run);
    const fuelCost = Number.isFinite(this.tripFuel) ? Math.ceil(this.tripFuel * ECONOMY.fuelPrice) : 0;
    row("Crew wages", `−$${wages(this.run.crew)}`, y);
    y += 20;
    const fees = hiringFees(this.run);
    if (fees > 0) {
      row(`Hiring ${this.run.crew - this.run.crewSigned} new crew`, `−$${fees}`, y);
      y += 20;
    }
    row("Fuel used (est.)", `−$${fuelCost}`, y);
    y += 20;
    row("Cargo pay", `+$${pay}`, y, THEME.good);
    y += 20;
    const profit = pay - this.launchCost - fuelCost;
    row("Trip profit", `${profit >= 0 ? "+" : "−"}$${Math.abs(profit)}`, y, profit >= 0 ? THEME.good : THEME.bad);
    y += 24;

    this.launchButton = { x: left, y: panel.y + panel.h - 58, w: right - left, h: 44 };
    if (this.problems.length === 0) {
      drawText(ctx, "✓ Ready to launch", left, y, { color: THEME.good, bold: true });
    } else {
      for (const problem of this.problems) {
        for (const lineText of wrapText(ctx, `• ${problem}`, right - left, 12)) {
          if (y > this.launchButton.y - 12) break;
          drawText(ctx, lineText, left, y, { color: THEME.bad, size: 12 });
          y += 16;
        }
        y += 2;
      }
    }

    drawButton(ctx, this.launchButton, `LAUNCH  (−$${this.launchCost})`, {
      enabled: this.problems.length === 0,
      hovered: pointInRect(this.mouse, this.launchButton),
    });
  }

  private smallButton(ctx: CanvasRenderingContext2D, r: Rect, label: string, enabled: boolean): void {
    const hovered = enabled && pointInRect(this.mouse, r);
    ctx.fillStyle = !enabled ? "#1a2233" : hovered ? "#2f5ea8" : "#1e2c48";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = enabled ? THEME.accent : THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, { align: "center", bold: true, color: enabled ? THEME.text : THEME.muted });
  }

  // Loaded contracts first, then the rest of the board. Click a card to load or unload it.
  private renderContractBoard(ctx: CanvasRenderingContext2D, area: Rect): void {
    const loaded = cargoUnits(this.run.cargo);
    const capacity = this.stats.cargoCapacity;
    drawText(ctx, `CONTRACTS TO ${PLANETS[destination(this.run)].name.toUpperCase()}`, area.x, area.y, {
      bold: true,
      color: THEME.muted,
    });
    const rep = reputation(this.run.delivered);
    const next = rep.next ? `  ·  ${rep.next.rank} at ${rep.next.at} delivered` : "";
    drawText(ctx, `${rep.rank} (${this.run.delivered} delivered, +${Math.round(rep.payBonus * 100)}% pay)${next}`, area.x + area.w / 2, area.y, {
      align: "center",
      color: THEME.accent,
      size: 12,
    });
    drawText(ctx, `Hold ${loaded} / ${capacity} units`, area.x + area.w, area.y, {
      align: "right",
      bold: true,
      color: loaded > capacity ? THEME.bad : THEME.text,
    });

    const cards = [
      ...this.run.cargo.map((contract) => ({ contract, loaded: true })),
      ...this.run.offers.map((contract) => ({ contract, loaded: false })),
    ];
    const gap = 10;
    const cardWidth = cards.length > 0 ? (area.w - gap * (cards.length - 1)) / cards.length : 0;
    const top = area.y + 16;
    const cardHeight = area.h - 16;
    this.contractCards = cards.map((card, i) => ({ ...card, rect: { x: area.x + i * (cardWidth + gap), y: top, w: cardWidth, h: cardHeight } }));

    if (cards.length === 0) {
      drawText(ctx, "No contracts on the board.", area.x, top + 30, { color: THEME.muted });
      return;
    }

    for (const { rect, contract, loaded: isLoaded } of this.contractCards) {
      const fits = isLoaded || contract.units <= capacity - loaded;
      const hovered = pointInRect(this.mouse, rect);
      ctx.fillStyle = isLoaded ? "#16301f" : hovered && fits ? "#1b2740" : THEME.panel;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = isLoaded ? THEME.good : hovered ? THEME.accent : THEME.panelBorder;
      ctx.lineWidth = isLoaded ? 2 : 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

      const x = rect.x + 12;
      const faded = fits ? THEME.text : THEME.muted;
      drawText(ctx, contract.cargo, x, rect.y + 20, { bold: true, color: faded });
      drawText(ctx, `T${contract.tier + 1}`, rect.x + rect.w - 12, rect.y + 20, { align: "right", bold: true, size: 12, color: THEME.accent });
      drawText(ctx, `${contract.units} units × $${contract.payPerUnit}`, x, rect.y + 44, { color: THEME.muted, size: 12 });
      drawText(ctx, `$${contractPay(contract)}`, x, rect.y + 72, { size: 20, bold: true, color: fits ? THEME.good : THEME.muted });
      const footer = isLoaded ? "LOADED · click to unload" : fits ? "Click to load" : "Not enough hold space";
      drawText(ctx, footer, x, rect.y + rect.h - 14, { size: 11, color: isLoaded ? THEME.good : fits ? THEME.muted : THEME.bad });
    }
  }

  private toScreen(h: Hex): Point {
    const p = hexToPixel(h, this.hexSize);
    return { x: this.gridCenter.x + p.x, y: this.gridCenter.y + p.y };
  }
}

// Engines and weapons care which way they face; nothing else does.
const usesRotation = (part: PlacedPart): boolean => part.type === "engine" || PARTS[part.type].weapon !== null;

const FACING_NAMES = ["forward", "forward-right", "back-right", "back", "back-left", "forward-left"];

function partDetails(id: PartId): string[] {
  const def = PARTS[id];
  const lines = [`Mass ${def.mass} · HP ${def.maxHp}`];
  if (def.crewRequired > 0) lines.push(`Needs ${def.crewRequired} crew`);
  if (def.crewCapacity > 0) lines.push(`Berths for ${def.crewCapacity} crew`);
  if (def.thrust > 0) lines.push(`Thrust ${def.thrust} · Turn ${def.turn}`);
  if (def.cargo > 0) lines.push(`Cargo ${def.cargo}`);
  if (def.fuelCapacity > 0) lines.push(`Fuel ${def.fuelCapacity} units`);
  if (def.fuelBurn > 0) lines.push(`Burns ${def.fuelBurn} fuel/s at full thrust`);
  if (def.shield > 0) lines.push(`Shield ${def.shield} · Regen ${def.shieldRegen}/s`);
  if (def.repair > 0) lines.push(`Repairs ${def.repair} hp/s`);
  if (def.weapon) {
    const w = def.weapon;
    lines.push(`Damage ${w.damage} × ${w.fireRate}/s`);
    lines.push(`Range ${w.range} · Arc ±${w.arc}°`);  }
  return lines;
}

const fmt = (n: number, digits = 0): string => n.toFixed(digits);
