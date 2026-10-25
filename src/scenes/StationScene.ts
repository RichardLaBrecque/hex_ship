import { COMBAT, ECONOMY, FLIGHT, PLANETS } from "../data/balance";
import { BUILDABLE, PARTS, type PartId } from "../data/parts";
import { cargoUnits, contractPay, loadContract, planetDistance, reputation, unloadContract, type Contract } from "../economy/contracts";
import { fireCrew, hireCrew, hiringFees, wages } from "../economy/crew";
import { dangerOutlook, type DangerOutlook } from "../economy/danger";
import { refuel, refuelCost } from "../economy/fuel";
import { launchCost, launchProblems, payAt, type Outcome, type Run } from "../economy/run";
import { buyPart, repairAll, repairCost, sellPart, sellValue } from "../economy/shop";
import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import { DEFAULT_MIN_VIEW, type Size } from "../engine/view";
import { hexAdd, hexesInRadius, hexKey, hexToPixel, mod6, neighbor, pixelToHex, type Hex, type Point } from "../hex/hex";
import { drawHex } from "../render/drawHex";
import { muteButtonRect } from "../render/muteButton";
import { drawFiringArc, drawPart, drawShip } from "../render/drawShip";
import { STATION_TABS, touchStationLayout, type StationTab } from "../render/stationLayout";
import { drawButton, drawPanel, drawText, fitText, pointInRect, THEME, wrapText, type Rect, type TextStyle } from "../render/ui";
import { partAt, rotatePart, shipValue, type PlacedPart } from "../ship/ship";
import { computeShipStats, type ShipStats } from "../ship/stats";
import { validateShip, type Validation } from "../ship/validate";
import { fuelRange } from "../sim/fuel";
import { thrustSpin } from "../sim/physics";

const MAX_HEX_SIZE = 28;
const GRID_RADIUS = 5;
const PALETTE_WIDTH = 230;
const SIDE_WIDTH = 280;
const ROW_HEIGHT = 44;
const TOP_BAR = 64;
const BOARD_HEIGHT = 128;
const ACTION_BAR = 36; // under the grid: rotate, sell and done buttons for players without a keyboard
const ACTION_WIDTH = 84;
const END_RUN_WIDTH = 72;
const MESSAGE_SECONDS = 2.5;
const REPORT_SECONDS = 6;

const HOTKEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"];

const NO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

// On a touch screen the station has its own layout (see touchStationLayout), drawn full size down to this.
const TOUCH_MIN_VIEW: Size = { width: 640, height: 360 };

const TAB_LABELS: Record<StationTab, string> = { parts: "Parts", ship: "Ship", supplies: "Supplies", trip: "Trip", cargo: "Cargo" };

export type StationOptions = {
  run: Run;
  report?: string; // shown on arrival, e.g. what the last trip earned
  onLaunch: (run: Run) => void;
  onChange: (run: Run) => void; // after every purchase, sale, hire, contract or rotation
  onEndRun: (run: Run) => void; // the player gave up on this run to start a new one
};

// Docked at a planet: build and trade parts, manage crew, repair, pick contracts, launch.
export class StationScene implements Scene {
  private run: Run;
  private stats: ShipStats;
  private validation: Validation;
  private problems: string[];
  private launchCost: number;
  private range: number; // how far the fuel aboard flies the ship (see fuelRange)

  private grid = new Set(hexesInRadius(GRID_RADIUS).map(hexKey));
  // The part type being built with, or null for inspect mode (click a placed part to select it).
  private tool: PartId | null = null;
  private inspected: Hex | null = null;
  // On touch, building takes two taps: the first puts a ghost of the part here, the second buys it.
  private pending: Hex | null = null;
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
  private touch = false; // the player is on a touch screen, so the station uses its touch layout
  private tab: StationTab = "parts"; // the touch layout's open tab
  private confirmingEnd = false; // End run was pressed once; pressing it again ends the run

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
  private rotateLeftButton = NO_RECT;
  private rotateRightButton = NO_RECT;
  private sellButton = NO_RECT;
  private placeButton = NO_RECT;
  private doneButton = NO_RECT;
  private endRunButton = NO_RECT;
  private tabButtons: Rect[] = [];

  constructor(private options: StationOptions) {
    this.run = options.run;
    this.stats = computeShipStats(this.run.ship, this.run.crew);
    this.validation = validateShip(this.run.ship);
    this.problems = launchProblems(this.run);
    this.launchCost = launchCost(this.run);
    this.range = fuelRange(this.stats, this.run.fuel);
    if (options.report) this.flash(options.report, THEME.good, REPORT_SECONDS);
  }

  minView(touch: boolean): Size {
    return touch ? TOUCH_MIN_VIEW : DEFAULT_MIN_VIEW;
  }

  // The touch layout keeps a slot for the mute button at the end of its status line.
  muteButton(width: number, height: number): Rect | undefined {
    return this.touch ? touchStationLayout(width, height).mute : undefined;
  }

  update(dt: number, input: Input): void {
    this.mouse = input.mouse;
    this.touch = input.usingTouch;
    this.messageTimer = Math.max(0, this.messageTimer - dt);

    BUILDABLE.forEach((id, i) => {
      if (input.wasPressed(HOTKEYS[i])) this.pickTool(id);
    });
    if (input.wasPressed("Escape")) {
      this.deselect();
      this.confirmingEnd = false;
    }
    if (input.wasPressed("KeyR")) this.rotate(input.isDown("ShiftLeft") || input.isDown("ShiftRight") ? -1 : 1);
    if (input.wasPressed("Delete") || input.wasPressed("Backspace")) this.sellInspected();

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
    this.pending = null;
  }

  // Puts the tool away, or lets go of the selected part.
  private deselect(): void {
    this.tool = null;
    this.inspected = null;
    this.pending = null;
  }

  private buyAt(h: Hex): void {
    if (!this.tool) return;
    this.apply(buyPart(this.run, h, this.tool, this.rotations[this.tool]));
    this.pending = null;
  }

  // Turns the tool's next part, or the selected part, one step clockwise (step 1) or anticlockwise (step -1).
  private rotate(step: number): void {
    if (this.tool) {
      this.rotations[this.tool] = mod6(this.rotations[this.tool] + step);
    } else if (this.inspected) {
      this.rotateInspected(step);
    }
  }

  private sellInspected(): void {
    if (this.inspected) this.handleSell(this.inspected);
  }

  private handleLeftClick(): void {
    // Ending a run takes two presses; a click anywhere else calls it off.
    if (pointInRect(this.mouse, this.endRunButton)) {
      if (this.confirmingEnd) {
        this.options.onEndRun(this.run);
      } else {
        this.confirmingEnd = true;
        this.flash(`${this.touch ? "Tap End" : "Press End run"} again to give up this run and start a new one. Your score is recorded.`, THEME.warn, REPORT_SECONDS);
      }
      return;
    }
    if (this.confirmingEnd) {
      this.confirmingEnd = false;
      this.messageTimer = 0;
    }
    const tab = this.tabButtons.findIndex((r) => pointInRect(this.mouse, r));
    if (tab >= 0) {
      this.tab = STATION_TABS[tab];
      return;
    }
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
    if (pointInRect(this.mouse, this.rotateLeftButton)) {
      this.rotate(-1);
      return;
    }
    if (pointInRect(this.mouse, this.rotateRightButton)) {
      this.rotate(1);
      return;
    }
    if (pointInRect(this.mouse, this.sellButton)) {
      this.sellInspected();
      return;
    }
    if (pointInRect(this.mouse, this.placeButton)) {
      if (this.pending) this.buyAt(this.pending);
      return;
    }
    if (pointInRect(this.mouse, this.doneButton)) {
      this.deselect();
      return;
    }
    if (!this.tool) {
      this.inspected = this.hovered && partAt(this.run.ship, this.hovered) ? this.hovered : null;
      if (this.inspected) this.tab = "parts";
      return;
    }
    if (!this.hovered) return;
    if (!this.touch) {
      this.buyAt(this.hovered);
    } else if (this.pending && hexKey(this.pending) === hexKey(this.hovered)) {
      this.buyAt(this.pending);
    } else {
      this.pending = this.hovered;
    }
  }

  // Turning a part is free.
  private rotateInspected(step: number): void {
    const part = this.inspectedPart();
    if (!part) return;
    if (!usesRotation(part.type)) {
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
    this.range = fuelRange(this.stats, run.fuel);
    this.options.onChange(run);
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

    // Only what this render draws can be clicked.
    this.paletteRows = [];
    this.contractCards = [];
    this.tabButtons = [];
    this.hireButton = this.fireButton = this.repairButton = this.refuelButton = this.launchButton = NO_RECT;
    this.rotateLeftButton = this.rotateRightButton = this.sellButton = this.placeButton = this.doneButton = NO_RECT;
    this.endRunButton = NO_RECT;

    if (this.touch) {
      this.renderTouch(ctx, width, height);
      return;
    }

    const centerLeft = PALETTE_WIDTH + 32;
    const centerRight = width - SIDE_WIDTH - 32;
    const gridTop = TOP_BAR;
    const gridBottom = height - BOARD_HEIGHT - 44 - ACTION_BAR;
    this.hexSize = Math.min(MAX_HEX_SIZE, (gridBottom - gridTop) / 17, (centerRight - centerLeft) / 19);
    this.gridCenter = { x: (centerLeft + centerRight) / 2, y: (gridTop + gridBottom) / 2 };

    this.renderTopBar(ctx);
    this.renderGrid(ctx);
    const actionWidth = ACTION_WIDTH * 4 + 8 * 3;
    this.renderActionBar(ctx, { x: this.gridCenter.x - actionWidth / 2, y: gridBottom + ACTION_BAR / 2 - 13, w: actionWidth, h: 26 });
    this.renderPalette(ctx, height);
    this.renderSidePanel(ctx, width, height);
    this.renderContractBoard(ctx, { x: centerLeft, y: height - BOARD_HEIGHT - 36, w: centerRight - centerLeft, h: BOARD_HEIGHT });

    const help = this.tool
      ? "Left-click buy & place · Right-click sell · R / Shift+R rotate · Esc or click part again to stop building"
      : "Click a part to select it · R / Shift+R rotate · Del sell · 1-8 pick a part to build";
    drawText(ctx, help, this.gridCenter.x, height - 18, { align: "center", color: THEME.muted, size: 12 });
  }

  // The grid on the left at full height; one tab of the side panel at a time on the right.
  private renderTouch(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const layout = touchStationLayout(width, height);
    const { grid, body } = layout;
    this.hexSize = layout.hexSize;
    this.gridCenter = { x: grid.x + grid.w / 2, y: grid.y + grid.h / 2 };
    this.renderGrid(ctx);
    if (this.messageTimer > 0) {
      let y = grid.y + 10;
      for (const lineText of wrapText(ctx, this.message, grid.w, 14)) {
        drawText(ctx, lineText, this.gridCenter.x, y, { align: "center", size: 14, bold: true, color: this.messageColor });
        y += 18;
      }
    }

    const planet = PLANETS[this.run.docked];
    const statusY = layout.status.y + layout.status.h / 2;
    drawText(ctx, planet.name, layout.status.x, statusY, { size: 15, bold: true, color: planet.color });
    const nameWidth = ctx.measureText(planet.name).width;
    drawText(ctx, `  ·  Day ${this.run.day}  ·  $${this.run.money}`, layout.status.x + nameWidth, statusY, { size: 15, bold: true });

    this.tabButtons = layout.tabs;
    STATION_TABS.forEach((tab, i) => {
      const r = layout.tabs[i];
      const open = tab === this.tab;
      ctx.fillStyle = open ? "#1e2c48" : THEME.panel;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (open) {
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
      }
      drawText(ctx, TAB_LABELS[tab], r.x + r.w / 2, r.y + r.h / 2, { align: "center", size: 12, bold: open, color: open ? THEME.text : THEME.muted });
    });

    drawPanel(ctx, body);
    const column = { left: body.x + 10, right: body.x + body.w - 10 };
    const top = body.y + 12;
    const bottom = body.y + body.h - 8;
    switch (this.tab) {
      case "parts":
        this.renderTouchParts(ctx, body);
        break;
      case "ship":
        this.renderShipSection(ctx, column, top, false);
        break;
      case "supplies":
        this.renderSuppliesSection(ctx, column, top);
        break;
      case "trip": {
        let y = top;
        for (const lineText of wrapText(ctx, dangerText(dangerOutlook(this.run)), column.right - column.left, 13)) {
          drawText(ctx, lineText, column.left, y, { bold: true, color: THEME.warn });
          y += 17;
        }
        this.renderTripSection(ctx, column, y + 10, bottom);
        break;
      }
      case "cargo":
        this.renderTouchCargo(ctx, body);
        break;
    }

    this.endRunButton = layout.endRun;
    this.renderEndRunButton(ctx, "End");
    this.launchButton = layout.launch;
    this.renderLaunchButton(ctx);
  }

  // Part tiles to build with; while building or with a part selected, its details and what you can do with it.
  private renderTouchParts(ctx: CanvasRenderingContext2D, body: Rect): void {
    const pad = 6;
    if (this.tool || this.inspectedPart()) {
      const actions = { x: body.x + pad, y: body.y + body.h - pad - 30, w: body.w - 2 * pad, h: 30 };
      this.renderPartInfo(ctx, body.x + 10, body.y + 12, body.w - 20, actions.y - 8);
      this.renderActionBar(ctx, actions);
      return;
    }

    const columns = 3;
    const rows = Math.ceil(BUILDABLE.length / columns);
    const tileWidth = (body.w - pad * (columns + 1)) / columns;
    const tileHeight = (body.h - pad * (rows + 1)) / rows;
    this.paletteRows = BUILDABLE.map((_, i) => ({
      x: body.x + pad + (i % columns) * (tileWidth + pad),
      y: body.y + pad + Math.floor(i / columns) * (tileHeight + pad),
      w: tileWidth,
      h: tileHeight,
    }));
    BUILDABLE.forEach((id, i) => {
      const r = this.paletteRows[i];
      const def = PARTS[id];
      ctx.fillStyle = "#182238";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const iconSize = Math.min(14, r.h / 5);
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + 6 + iconSize);
      drawPart(ctx, { hex: { q: 0, r: 0 }, type: id, rotation: id === "engine" ? 3 : 0, hp: def.maxHp }, iconSize, false);
      ctx.restore();
      const nameLines = wrapText(ctx, def.name, r.w - 6, 11);
      let y = r.y + 10 + iconSize * 2;
      for (const lineText of nameLines.slice(0, 2)) {
        drawText(ctx, lineText, r.x + r.w / 2, y, { align: "center", size: 11 });
        y += 12;
      }
      // The price sits at the bottom of the tile, or under the name when it wraps onto two lines.
      const affordable = this.run.money >= def.cost;
      const priceY = Math.max(y, r.y + r.h - 9);
      drawText(ctx, `$${def.cost}`, r.x + r.w / 2, priceY, { align: "center", size: 11, bold: true, color: affordable ? THEME.muted : THEME.bad });
    });
  }

  // How full the hold is, the reputation it's earning, and the contracts as a two-column grid of cards.
  private renderTouchCargo(ctx: CanvasRenderingContext2D, body: Rect): void {
    const loaded = cargoUnits(this.run.cargo);
    const capacity = this.stats.cargoCapacity;
    const left = body.x + 10;
    drawText(ctx, `Hold ${loaded} / ${capacity} units`, left, body.y + 12, {
      bold: true,
      color: loaded > capacity ? THEME.bad : THEME.text,
    });
    const rep = reputation(this.run.delivered);
    drawText(ctx, `${rep.rank} · +${Math.round(rep.payBonus * 100)}% pay${rep.next ? ` · ${rep.next.rank} at ${rep.next.at}` : ""}`, left, body.y + 30, {
      color: THEME.accent,
      size: 12,
    });
    this.renderContractCards(ctx, { x: body.x + 6, y: body.y + 42, w: body.w - 12, h: body.h - 48 }, 2);
  }

  private renderTopBar(ctx: CanvasRenderingContext2D): void {
    const planet = PLANETS[this.run.docked];
    drawText(ctx, `Docked at ${planet.name}`, this.gridCenter.x, 28, { align: "center", size: 18, bold: true, color: planet.color });
    drawText(ctx, `Day ${this.run.day}  ·  $${this.run.money}  ·  ${dangerText(dangerOutlook(this.run))}`, this.gridCenter.x, 50, {
      align: "center",
      size: 15,
      bold: true,
    });
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
      const ghost = this.touch ? this.pending : this.hovered;
      if (ghost) this.renderGhost(ctx, this.tool, ghost);
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

  // Firing arc for weapons, the exhaust hex for engines, and the hexes a shield covers.
  private renderPartGuides(ctx: CanvasRenderingContext2D, type: PartId, h: Hex, rotation: number): void {
    const def = PARTS[type];
    if (def.shield > 0) {
      for (const offset of hexesInRadius(COMBAT.shieldReach)) {
        drawHex(ctx, this.toScreen(hexAdd(h, offset)), this.hexSize - 4, { stroke: def.color, lineWidth: 1 });
      }
    }
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

    this.renderPartInfo(ctx, panel.x + 14, panel.y + 40 + BUILDABLE.length * ROW_HEIGHT + 16, panel.w - 28, panel.y + panel.h - 8);
  }

  // Building: describe the tool. Inspecting: describe the selected part, else the hovered one.
  // Lines that would pass `bottom` aren't drawn.
  private renderPartInfo(ctx: CanvasRenderingContext2D, x: number, top: number, textWidth: number, bottom: number): void {
    let y = top;
    const line = (text: string, style: TextStyle, height: number): void => {
      if (y <= bottom) drawText(ctx, text, x, y, style);
      y += height;
    };
    const shown = this.inspectedPart() ?? (this.hovered ? partAt(this.run.ship, this.hovered) : undefined);
    const type = this.tool ?? shown?.type;
    if (!type) {
      line("Nothing selected", { bold: true, color: THEME.muted }, 20);
      for (const lineText of wrapText(ctx, "Click a part on the ship to select it, or pick one above to build.", textWidth)) {
        line(lineText, { color: THEME.muted }, 17);
      }
      return;
    }

    const def = PARTS[type];
    const title = this.tool ? `Building: ${def.name}` : this.inspected ? `Selected: ${def.name}` : def.name;
    line(title, { bold: true, color: def.color }, 20);
    for (const lineText of wrapText(ctx, def.description, textWidth)) {
      line(lineText, { color: THEME.muted }, 17);
    }
    y += 6;
    if (!this.tool && shown) {
      line(`HP ${shown.hp} / ${def.maxHp}`, { size: 12, color: shown.hp < def.maxHp ? THEME.warn : THEME.text }, 16);
      if (usesRotation(shown.type)) {
        const label = shown.type === "engine" ? "Exhaust points" : "Facing";
        line(`${label} ${FACING_NAMES[shown.rotation]}`, { size: 12 }, 16);
      }
      if (shown.type !== "bridge") line(`Sells for $${sellValue(shown)}`, { size: 12 }, 16);
    }
    for (const lineText of partDetails(type)) {
      line(lineText, { size: 12 }, 16);
    }
    if (this.inspected && shown && shown.type !== "bridge" && !this.touch) {
      y += 8;
      line(usesRotation(shown.type) ? "R rotate · Del sell · Esc deselect" : "Del sell · Esc deselect", { size: 12, color: THEME.accent }, 16);
    }
  }

  private renderSidePanel(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const panel = { x: width - SIDE_WIDTH - 16, y: 16, w: SIDE_WIDTH, h: height - 32 };
    const column = { left: panel.x + 14, right: panel.x + panel.w - 14 };
    drawPanel(ctx, panel);

    this.launchButton = { x: column.left, y: panel.y + panel.h - 58, w: column.right - column.left, h: 44 };
    // Next to the mute button, which sits in this panel's top-right corner.
    const mute = muteButtonRect(width);
    this.endRunButton = { x: mute.x - 8 - END_RUN_WIDTH, y: mute.y + 2, w: END_RUN_WIDTH, h: mute.h - 4 };
    this.renderEndRunButton(ctx, "End run");
    const shipBottom = this.renderShipSection(ctx, column, panel.y + 22);
    const suppliesBottom = this.renderSuppliesSection(ctx, column, shipBottom + 14);
    this.renderTripSection(ctx, column, suppliesBottom + 16, this.launchButton.y - 12);
    this.renderLaunchButton(ctx);
  }

  // A label on the left of the column and its value on the right.
  private statRow(ctx: CanvasRenderingContext2D, column: Column, label: string, value: string, y: number, color: string = THEME.text): void {
    drawText(ctx, label, column.left, y, { color: THEME.muted });
    drawText(ctx, value, column.right, y, { align: "right", color });
  }

  // Ship stats, hull and the repair button, starting at `top`. Returns the y below it.
  private renderShipSection(ctx: CanvasRenderingContext2D, column: Column, top: number, heading = true): number {
    const { left, right } = column;
    const s = this.stats;
    let y = top;
    if (heading) {
      drawText(ctx, "SHIP", left, y, { bold: true, color: THEME.muted });
      y += 24;
    }
    const thrustDrift = thrustSpin(s, s.main);
    const brakeDrift = thrustSpin(s, s.brake);
    const maxTurn = s.turnRate * FLIGHT.turnScale;
    const rows: [string, string, string?][] = [
      ["Value", `$${shipValue(this.run.ship)}`],
      ["Mass", fmt(s.mass)],
      ["Acceleration", fmt(s.acceleration, 2)],
      ["Turn rate", fmt(s.turnRate, 2)],
      ["Thrust drift", driftText(thrustDrift), driftColor(thrustDrift, maxTurn)],
      ["Brake drift", driftText(brakeDrift), driftColor(brakeDrift, maxTurn)],
      ["Shield", s.shieldMax > 0 ? `${fmt(s.shieldMax)} (+${fmt(s.shieldRegen, 1)}/s)` : "none"],
      ["Firepower", `${fmt(s.dps, 1)} dps`],
      ["Cargo hold", `${s.cargoCapacity} units`],
    ];
    for (const [label, value, color] of rows) {
      this.statRow(ctx, column, label, value, y, color);
      y += 20;
    }

    // Hull and repairs
    const repair = repairCost(this.run.ship);
    this.statRow(ctx, column, "Hull", `${fmt(s.hull)} / ${fmt(s.maxHull)}`, y, repair > 0 ? THEME.warn : THEME.text);
    y += 14;
    this.repairButton = repair > 0 ? { x: left, y, w: right - left, h: 26 } : NO_RECT;
    if (repair > 0) {
      this.smallButton(ctx, this.repairButton, `Repair all  $${repair}`, this.run.money >= repair);
      y += 32;
    } else {
      y += 6;
    }
    return y;
  }

  // Fuel, the refuel button and crew, starting at `top`. Returns the y below it.
  private renderSuppliesSection(ctx: CanvasRenderingContext2D, column: Column, top: number): number {
    const { left, right } = column;
    const s = this.stats;
    let y = top;

    // Fuel
    drawText(ctx, "FUEL", left, y, { bold: true, color: THEME.muted });
    y += 24;
    const reachable = this.reachable().length;
    const lowFuel = reachable === 0;
    this.statRow(ctx, column, "Tanks", `${Math.floor(this.run.fuel)} / ${s.fuelCapacity} units`, y, lowFuel ? THEME.warn : THEME.text);
    y += 20;
    this.statRow(ctx, column, "Burn at full thrust", `${fmt(s.fuelBurn, 1)} / s`, y);
    y += 20;
    this.statRow(ctx, column, "Reaches (est.)", `${reachable} of ${PLANETS.length - 1} planets`, y, lowFuel ? THEME.warn : THEME.text);
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
    return y;
  }

  // Planets other than this one that the fuel aboard reaches, by the same estimate as the refuel advice.
  private reachable(): number[] {
    return PLANETS.map((_, i) => i).filter((i) => i !== this.run.docked && planetDistance(this.run.docked, i) <= this.range);
  }

  // Launch costs, a map of where the cargo is bound, and what stops a launch, starting at `top` and stopping before `bottom`.
  // Returns the y below it.
  private renderTripSection(ctx: CanvasRenderingContext2D, column: Column, top: number, bottom: number): number {
    const { left, right } = column;
    let y = top;
    drawText(ctx, "TRIP", left, y, { bold: true, color: THEME.muted });
    y += 24;
    this.statRow(ctx, column, "Crew wages", `−$${wages(this.run.crew)}`, y);
    y += 20;
    const fees = hiringFees(this.run);
    if (fees > 0) {
      this.statRow(ctx, column, `Hiring ${this.run.crew - this.run.crewSigned} new crew`, `−$${fees}`, y);
      y += 20;
    }
    const aboard = this.run.cargo.reduce((sum, c) => sum + contractPay(c), 0);
    this.statRow(ctx, column, "Cargo aboard", `$${aboard}`, y, aboard > 0 ? THEME.good : THEME.text);
    y += 14;
    const mapHeight = Math.min(150, bottom - y - (this.problems.length > 0 ? 40 : 24));
    if (mapHeight > 60) {
      this.renderStarMap(ctx, { x: left, y, w: right - left, h: mapHeight });
      y += mapHeight + 16;
    } else {
      y += 10;
    }

    if (this.problems.length === 0) {
      drawText(ctx, "✓ Ready to launch", left, y, { color: THEME.good, bold: true });
      y += 18;
    } else {
      for (const problem of this.problems) {
        for (const lineText of wrapText(ctx, `• ${problem}`, right - left, 12)) {
          if (y > bottom) break;
          drawText(ctx, lineText, left, y, { color: THEME.bad, size: 12 });
          y += 16;
        }
        y += 2;
      }
    }
    return y;
  }

  // Every planet, stretched to fill `area`. This one is ringed in white, planets the fuel reaches sit inside the dashed
  // range ellipse (the range circle, stretched the same way), and planets with cargo bound for them are ringed in green with what docking there pays
  // (open cargo included). Open cargo alone doesn't ring a planet, since it goes anywhere.
  private renderStarMap(ctx: CanvasRenderingContext2D, area: Rect): void {
    ctx.fillStyle = "#0b1120";
    ctx.fillRect(area.x, area.y, area.w, area.h);
    const pad = { x: 34, y: 14 }; // room for names either side of the planets at the edges
    const xs = PLANETS.map((p) => p.x);
    const ys = PLANETS.map((p) => p.y);
    const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
    const scaleX = (area.w - 2 * pad.x) / (Math.max(...xs) - minX);
    const scaleY = (area.h - 2 * pad.y - 10) / (Math.max(...ys) - minY);
    const at = (p: Point): Point => ({ x: area.x + pad.x + (p.x - minX) * scaleX, y: area.y + pad.y + (p.y - minY) * scaleY });

    const here = PLANETS[this.run.docked];
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    if (Number.isFinite(this.range) && this.range > 0) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(at(here).x, at(here).y, this.range * scaleX, this.range * scaleY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    PLANETS.forEach((planet, i) => {
      const p = at(planet);
      const bound = this.run.cargo.some((c) => c.to === i);
      const pay = bound ? payAt(this.run, i) : 0;
      const ring = i === this.run.docked ? THEME.text : bound ? THEME.good : null;
      if (ring) {
        ctx.strokeStyle = ring;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = planet.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      // A short map has room for one line under each planet, so the pay goes beside the name.
      const style: TextStyle = { align: "center", size: 11, bold: bound, color: bound ? THEME.good : THEME.muted };
      if (area.h < 110) {
        drawText(ctx, bound ? `${planet.name} $${pay}` : planet.name, p.x, p.y + 13, style);
      } else {
        drawText(ctx, planet.name, p.x, p.y + 15, style);
        if (bound) drawText(ctx, `$${pay}`, p.x, p.y + 27, style);
      }
    });
    ctx.restore();
  }

  private renderLaunchButton(ctx: CanvasRenderingContext2D): void {
    drawButton(ctx, this.launchButton, `LAUNCH  (−$${this.launchCost})`, {
      enabled: this.problems.length === 0,
      hovered: pointInRect(this.mouse, this.launchButton),
    });
  }

  // Turns red and asks to be pressed again once it has been pressed once.
  private renderEndRunButton(ctx: CanvasRenderingContext2D, label: string): void {
    const r = this.endRunButton;
    const hovered = pointInRect(this.mouse, r);
    ctx.fillStyle = this.confirmingEnd ? "#4a1c22" : hovered ? "#1e2c48" : THEME.panel;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = this.confirmingEnd ? THEME.bad : THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    const text = this.confirmingEnd ? "Sure?" : label;
    drawText(ctx, text, r.x + r.w / 2, r.y + r.h / 2, { align: "center", size: 12, bold: this.confirmingEnd, color: this.confirmingEnd ? THEME.bad : THEME.muted });
  }

  // The keyboard's R, Shift+R, Del and Esc as four buttons across `row`, shown while building or with a part selected.
  private renderActionBar(ctx: CanvasRenderingContext2D, row: Rect): void {
    const inspected = this.inspectedPart();
    const active = this.tool ?? inspected?.type;
    if (!active) return;
    const gap = 8;
    const width = (row.w - gap * 3) / 4;
    const at = (i: number): Rect => ({ x: row.x + i * (width + gap), y: row.y, w: width, h: row.h });
    [this.rotateLeftButton, this.rotateRightButton, this.doneButton] = [at(0), at(1), at(3)];
    const canRotate = usesRotation(active);
    const roomy = width >= ACTION_WIDTH;
    this.smallButton(ctx, this.rotateLeftButton, roomy ? "↺ Rotate" : "↺", canRotate);
    this.smallButton(ctx, this.rotateRightButton, roomy ? "Rotate ↻" : "↻", canRotate);
    // Building on touch buys at the ghost; otherwise the third button sells the selected part.
    if (this.tool && this.touch) {
      this.placeButton = at(2);
      this.smallButton(ctx, this.placeButton, `Place $${PARTS[this.tool].cost}`, this.pending !== null);
    } else {
      this.sellButton = at(2);
      const canSell = !this.tool && inspected !== undefined && inspected.type !== "bridge";
      this.smallButton(ctx, this.sellButton, inspected && canSell ? `Sell $${sellValue(inspected)}` : "Sell", canSell);
    }
    this.smallButton(ctx, this.doneButton, "Done", true);
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
    drawText(ctx, "CONTRACTS", area.x, area.y, {
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

    // One row of up to five cards; more wrap onto a second row of short cards.
    const count = this.run.cargo.length + this.run.offers.length;
    this.renderContractCards(ctx, { x: area.x, y: area.y + 16, w: area.w, h: area.h - 16 }, count > 5 ? Math.ceil(count / 2) : Math.max(1, count));
  }

  // Loaded contracts first, then the rest of the board, in rows of `columns` cards filling `area`.
  private renderContractCards(ctx: CanvasRenderingContext2D, area: Rect, columns: number): void {
    const loaded = cargoUnits(this.run.cargo);
    const capacity = this.stats.cargoCapacity;
    const cards = [
      ...this.run.cargo.map((contract) => ({ contract, loaded: true })),
      ...this.run.offers.map((contract) => ({ contract, loaded: false })),
    ];
    if (cards.length === 0) {
      drawText(ctx, "No contracts on the board.", area.x, area.y + 30, { color: THEME.muted });
      return;
    }

    const gap = this.touch ? 6 : 10;
    const rows = Math.ceil(cards.length / columns);
    const cardWidth = (area.w - gap * (columns - 1)) / columns;
    const cardHeight = (area.h - gap * (rows - 1)) / rows;
    this.contractCards = cards.map((card, i) => ({
      ...card,
      rect: { x: area.x + (i % columns) * (cardWidth + gap), y: area.y + Math.floor(i / columns) * (cardHeight + gap), w: cardWidth, h: cardHeight },
    }));

    for (const { rect, contract, loaded: isLoaded } of this.contractCards) {
      const fits = isLoaded || contract.units <= capacity - loaded;
      const hovered = pointInRect(this.mouse, rect);
      ctx.fillStyle = isLoaded ? "#16301f" : hovered && fits ? "#1b2740" : THEME.panel;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = isLoaded ? THEME.good : hovered ? THEME.accent : THEME.panelBorder;
      ctx.lineWidth = isLoaded ? 2 : 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

      const tap = this.touch ? "tap" : "click";
      // Cargo loaded at another planet can't come off until it reaches where it's bound.
      const [footer, status] = !isLoaded
        ? fits
          ? [`${this.touch ? "Tap" : "Click"} to load`, ""]
          : ["Not enough hold space", "NO ROOM"]
        : contract.from === this.run.docked
          ? [`LOADED · ${tap} to unload`, "LOADED"]
          : [`ABOARD · from ${PLANETS[contract.from].name}`, "ABOARD"];
      this.renderContractCard(ctx, rect, contract, {
        footer,
        status,
        footerColor: isLoaded ? THEME.good : fits ? THEME.muted : THEME.bad,
        textColor: fits ? THEME.text : THEME.muted,
        payColor: fits ? THEME.good : THEME.muted,
      });
    }
  }

  // One contract's name, tier, route, pay and `footer`, laid out tighter on short cards. The shortest cards drop
  // the tier and show `status` in place of the footer. Text is cut to fit the card.
  private renderContractCard(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    contract: Contract,
    colors: { footer: string; status: string; footerColor: string; textColor: string; payColor: string },
  ): void {
    const x = rect.x + 10;
    const inner = rect.w - 20;
    const bound = contract.to === null ? "any planet" : PLANETS[contract.to].name;
    const route = `${contract.units} × $${contract.payPerUnit} → ${bound}`;
    const pay = `$${contractPay(contract)}`;
    const tier = `T${contract.tier + 1}`;
    const tierStyle: TextStyle = { align: "right", bold: true, size: 12, color: THEME.accent };
    const nameStyle: TextStyle = { bold: true, color: colors.textColor };
    const routeStyle: TextStyle = { color: THEME.muted, size: 12 };
    const footerStyle: TextStyle = { size: 11, color: colors.footerColor };
    const right = rect.x + rect.w - 10;

    if (rect.h < 50) {
      // Two lines: name and pay, then route and status.
      const payStyle: TextStyle = { align: "right", bold: true, color: colors.payColor };
      const statusStyle: TextStyle = { ...footerStyle, align: "right", bold: true };
      const top = rect.y + 12;
      const bottom = rect.y + rect.h - 11;
      drawText(ctx, pay, right, top, payStyle);
      ctx.font = "600 13px system-ui, sans-serif";
      drawText(ctx, fitText(ctx, contract.cargo, inner - ctx.measureText(pay).width - 6, nameStyle), x, top, nameStyle);
      drawText(ctx, colors.status, right, bottom, statusStyle);
      ctx.font = "600 11px system-ui, sans-serif";
      const statusWidth = colors.status ? ctx.measureText(colors.status).width + 6 : 0;
      // Destination first, so a narrow card cuts the numbers rather than where it's going.
      const shortRoute = `→ ${bound} · ${contract.units} × $${contract.payPerUnit}`;
      drawText(ctx, fitText(ctx, shortRoute, inner - statusWidth, routeStyle), x, bottom, routeStyle);
      return;
    }
    drawText(ctx, tier, right, rect.y + 14, tierStyle);
    ctx.font = "600 12px system-ui, sans-serif";
    const nameWidth = inner - ctx.measureText(tier).width - 6;

    if (rect.h < 80) {
      // Short card: route and pay share a line.
      const payStyle: TextStyle = { align: "right", bold: true, color: colors.payColor };
      drawText(ctx, fitText(ctx, contract.cargo, nameWidth, nameStyle), x, rect.y + 14, nameStyle);
      drawText(ctx, pay, rect.x + rect.w - 10, rect.y + 31, payStyle);
      ctx.font = "600 13px system-ui, sans-serif";
      const routeWidth = inner - ctx.measureText(pay).width - 6;
      drawText(ctx, fitText(ctx, route, routeWidth, routeStyle), x, rect.y + 31, routeStyle);
      drawText(ctx, fitText(ctx, colors.footer, inner, footerStyle), x, rect.y + rect.h - 9, footerStyle);
      return;
    }
    const [routeY, payY, paySize] = this.touch ? [34, 56, 18] : [40, 66, 20];
    drawText(ctx, fitText(ctx, contract.cargo, nameWidth, nameStyle), x, rect.y + 14, nameStyle);
    drawText(ctx, fitText(ctx, route, inner, routeStyle), x, rect.y + routeY, routeStyle);
    drawText(ctx, pay, x, rect.y + payY, { size: paySize, bold: true, color: colors.payColor });
    drawText(ctx, fitText(ctx, colors.footer, inner, footerStyle), x, rect.y + rect.h - (this.touch ? 10 : 14), footerStyle);
  }

  private toScreen(h: Hex): Point {
    const p = hexToPixel(h, this.hexSize);
    return { x: this.gridCenter.x + p.x, y: this.gridCenter.y + p.y };
  }
}

// The left and right edges of a panel's text.
type Column = { left: number; right: number };

// Engines and weapons care which way they face; nothing else does.
const usesRotation = (type: PartId): boolean => type === "engine" || PARTS[type].weapon !== null;

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
  if (def.shield > 0) lines.push(`Shield ${def.shield} · Regen ${def.shieldRegen}/s`, `Covers parts within ${COMBAT.shieldReach} hexes`);
  if (def.repair > 0) lines.push(`Repairs ${def.repair} hp/s`);
  if (def.weapon) {
    const w = def.weapon;
    lines.push(`Damage ${w.damage} × ${w.fireRate}/s`);
    lines.push(`Range ${w.range} · Arc ±${w.arc}°`);
    lines.push(`Shield drain ×${COMBAT.shieldDrain[w.kind]} · Vs armor ×${COMBAT.armorDamage[w.kind]}`);
    if (w.intercept > 0) lines.push(`Shoots down 1 missile or shell every ${fmt(1 / w.intercept)}s`);
  }
  return lines;
}

const fmt = (n: number, digits = 0): string => n.toFixed(digits);

// How off-centre engines turn the ship under full thrust or braking, if nobody steers (see thrustSpin).
const STRAIGHT = (1 * Math.PI) / 180; // a drift under 1°/s isn't worth mentioning

function driftText(spin: number): string {
  if (Math.abs(spin) < STRAIGHT) return "straight";
  return `turns ${spin > 0 ? "right" : "left"} ${fmt((Math.abs(spin) * 180) / Math.PI)}°/s`;
}

// Amber while easy to steer against; red once it drifts at half the ship's turn rate or more.
const driftColor = (spin: number, maxTurn: number): string =>
  Math.abs(spin) < STRAIGHT ? THEME.text : Math.abs(spin) < maxTurn / 2 ? THEME.warn : THEME.bad;

// e.g. "Danger 2 (next at $1200 ship value or 13 more kills)", or at the top "Danger 5 (max, boss in 2 trips)"
function dangerText(outlook: DangerOutlook): string {
  if (outlook.bossIn !== null) {
    const boss = outlook.bossIn === 1 ? "BOSS on this trip" : `boss in ${outlook.bossIn} trips`;
    return `Danger ${outlook.tier} (max, ${boss})`;
  }
  const next = [
    outlook.nextValue !== null ? `$${outlook.nextValue} ship value` : null,
    outlook.killsToNext !== null ? `${outlook.killsToNext} more kill${outlook.killsToNext === 1 ? "" : "s"}` : null,
  ].filter((part) => part !== null);
  return next.length > 0 ? `Danger ${outlook.tier} (next at ${next.join(" or ")})` : `Danger ${outlook.tier} (max)`;
}
