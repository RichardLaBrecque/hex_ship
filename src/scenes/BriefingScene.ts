import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import { drawShip } from "../render/drawShip";
import { drawButton, drawPanel, drawText, pointInRect, THEME, wrapText, type Rect } from "../render/ui";
import type { Ship } from "../ship/ship";

export type BriefingOptions = {
  kicker: string; // small line above the title, e.g. "TUTORIAL 1 / 2"
  title: string;
  paragraphs: readonly string[];
  ship?: { name: string; ship: Ship }; // shown beside the text
  note?: string; // why the player is seeing this again, e.g. after losing the ship
  action: string; // what the main button does
  onContinue: () => void;
  onSkip?: () => void; // leaves the tutorial for the game proper
};

const PANEL_WIDTH = 720;
const TEXT_SIZE = 15;
const LINE_HEIGHT = 22;
const SHIP_HEX = 22;

// A story card between tutorial flights: what's happening, the ship to fly, and buttons to go on or skip.
export class BriefingScene implements Scene {
  private touch = false;
  private continueButton: Rect | null = null; // laid out at the last render
  private skipButton: Rect | null = null; // laid out at the last render, when the card can be skipped

  constructor(private options: BriefingOptions) {}

  update(_dt: number, input: Input): void {
    this.touch = input.usingTouch;
    const clicked = (r: Rect | null): boolean => r !== null && input.wasClicked(0) && pointInRect(input.mouse, r);
    const { onContinue, onSkip } = this.options;
    if (onSkip && (input.wasPressed("Escape") || clicked(this.skipButton))) {
      onSkip();
      return;
    }
    if (input.wasPressed("Enter") || input.wasPressed("Space") || clicked(this.continueButton)) onContinue();
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { kicker, title, paragraphs, ship, note, action, onSkip } = this.options;
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);

    const panelWidth = Math.min(PANEL_WIDTH, width - 32);
    const shipWidth = ship ? 200 : 0;
    const textWidth = panelWidth - 48 - shipWidth;
    const lines = paragraphs.map((p) => wrapText(ctx, p, textWidth, TEXT_SIZE));
    const textHeight = lines.reduce((sum, ls) => sum + ls.length * LINE_HEIGHT + 12, 0);
    const panelHeight = 110 + Math.max(textHeight, ship ? 220 : 0) + (note ? 30 : 0) + 76;
    const panel = { x: (width - panelWidth) / 2, y: Math.max(16, (height - panelHeight) / 2), w: panelWidth, h: panelHeight };
    drawPanel(ctx, panel);

    const left = panel.x + 24;
    drawText(ctx, kicker, left, panel.y + 30, { size: 12, bold: true, color: THEME.warn });
    drawText(ctx, title, left, panel.y + 62, { size: 28, bold: true });
    let y = panel.y + 108;
    for (const paragraph of lines) {
      for (const line of paragraph) {
        drawText(ctx, line, left, y, { size: TEXT_SIZE });
        y += LINE_HEIGHT;
      }
      y += 12;
    }

    if (ship) {
      const centerX = panel.x + panel.w - 24 - shipWidth / 2;
      drawShip(ctx, ship.ship, { origin: { x: centerX, y: panel.y + 200 }, size: SHIP_HEX });
      drawText(ctx, ship.name, centerX, panel.y + 300, { align: "center", size: 13, color: THEME.muted });
    }

    const bottom = panel.y + panel.h;
    if (note) drawText(ctx, note, left, bottom - 96, { size: 14, bold: true, color: THEME.bad });

    const buttonY = bottom - 60;
    this.continueButton = { x: panel.x + panel.w - 24 - 200, y: buttonY, w: 200, h: 44 };
    drawButton(ctx, this.continueButton, this.touch ? action : `${action} (Enter)`, { enabled: true, hovered: false });
    this.skipButton = null;
    if (onSkip) {
      this.skipButton = { x: left, y: buttonY, w: 200, h: 44 };
      drawButton(ctx, this.skipButton, this.touch ? "Skip tutorial" : "Skip tutorial (Esc)", { enabled: true, hovered: false });
    }
  }
}
