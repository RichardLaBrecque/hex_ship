import type { Run } from "../economy/run";
import { shareText, WIN_TITLES, type Win } from "../economy/victory";
import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import { drawButton, drawText, pointInRect, THEME, type Rect } from "../render/ui";
import type { NewBests, Records } from "../save/records";

// The core was lost, the player ended the run at a station, or the run was won.
export type RunEnd = "destroyed" | "ended" | Win;

export type GameOverOptions = {
  run: Run; // the run as it stood at launch, at the station where it was ended, or when it was won
  reason: RunEnd;
  records: Records; // already including this run
  newBests: NewBests;
  onRestart: () => void;
  // Hands a won run's result to the device's share sheet or clipboard, resolving to what to tell the player.
  share: (text: string) => Promise<string>;
  url: string; // where to play, for the shared result
};

const WIN_SUMMARIES: Record<Win, (day: number) => string> = {
  warrior: (day) => `You destroyed the Flagship on day ${day}.`,
  merchant: (day) => `You delivered the Grand Haul on day ${day}.`,
};

const isWin = (reason: RunEnd): reason is Win => reason === "warrior" || reason === "merchant";

export class GameOverScene implements Scene {
  private touch = false; // on a touch screen there's a New run button instead of the Enter hint
  private newRunButton: Rect | null = null; // laid out at the last render, while on touch
  private shareButton: Rect | null = null; // laid out at the last render, for a won run
  private shareNote = ""; // what came of the last share

  constructor(private options: GameOverOptions) {}

  update(_dt: number, input: Input): void {
    this.touch = input.usingTouch;
    const clicked = (r: Rect | null): boolean => r !== null && input.wasClicked(0) && pointInRect(input.mouse, r);
    const { reason } = this.options;
    if (isWin(reason) && (input.wasPressed("KeyC") || clicked(this.shareButton))) {
      const { run, url, share } = this.options;
      share(shareText(run, reason, url)).then((note) => (this.shareNote = note));
      return;
    }
    if (input.wasPressed("Enter") || input.wasPressed("Space") || clicked(this.newRunButton)) this.options.onRestart();
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { run, reason, records, newBests } = this.options;
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);
    const top = height / 2 - 190;
    if (isWin(reason)) {
      drawText(ctx, "VICTORY", width / 2, top - 22, { align: "center", size: 18, bold: true, color: THEME.warn });
      drawText(ctx, WIN_TITLES[reason].toUpperCase(), width / 2, top + 10, { align: "center", size: 40, bold: true, color: THEME.good });
      drawText(ctx, WIN_SUMMARIES[reason](run.day), width / 2, top + 50, { align: "center", size: 16 });
    } else {
      const destroyed = reason === "destroyed";
      drawText(ctx, destroyed ? "GAME OVER" : "RUN ENDED", width / 2, top, { align: "center", size: 40, bold: true, color: destroyed ? THEME.bad : THEME.warn });
      const summary = destroyed ? `Your ship's core was destroyed on day ${run.day}.` : `You ended the run on day ${run.day}.`;
      drawText(ctx, summary, width / 2, top + 46, { align: "center", size: 16 });
    }
    drawText(ctx, `${run.kills} kills · ${run.delivered} deliveries`, width / 2, top + 72, { align: "center", size: 13, color: THEME.muted });

    const columns = [
      { label: "PEAK SHIP VALUE", value: run.peakShipValue, best: records.best.peakShipValue, isNew: newBests.peakShipValue },
      { label: "CARGO SOLD", value: run.cargoEarned, best: records.best.cargoEarned, isNew: newBests.cargoEarned },
      { label: "BOUNTIES COLLECTED", value: run.bountiesEarned, best: records.best.bountiesEarned, isNew: newBests.bountiesEarned },
    ];
    const spacing = Math.min(220, width / 3);
    const columnX = (i: number): number => width / 2 + (i - 1) * spacing;
    columns.forEach((column, i) => {
      const x = columnX(i);
      drawText(ctx, column.label, x, top + 110, { align: "center", size: 12, bold: true, color: THEME.muted });
      drawText(ctx, `$${column.value}`, x, top + 138, { align: "center", size: 26, bold: true, color: THEME.good });
      const best = column.isNew ? "NEW BEST!" : `Best $${column.best}`;
      drawText(ctx, best, x, top + 164, { align: "center", size: 13, bold: column.isNew, color: column.isNew ? THEME.warn : THEME.muted });
    });

    // Recent runs, newest first; the first row is this one. Won runs are tagged with how.
    drawText(ctx, "RECENT RUNS", width / 2, top + 206, { align: "center", size: 12, bold: true, color: THEME.muted });
    records.recent.forEach((score, row) => {
      const y = top + 230 + row * 20;
      const color = row === 0 ? THEME.text : THEME.muted;
      drawText(ctx, `Day ${score.day}`, columnX(0) - spacing / 2 - 20, y, { align: "center", size: 13, color });
      const values = [score.peakShipValue, score.cargoEarned, score.bountiesEarned];
      values.forEach((value, i) => drawText(ctx, `$${value}`, columnX(i), y, { align: "center", size: 13, color }));
      if (score.win) drawText(ctx, WIN_TITLES[score.win], columnX(2) + spacing / 2, y, { size: 12, bold: true, color: THEME.good });
    });

    const bottom = top + 230 + records.recent.length * 20 + 28;
    this.shareButton = null;
    this.newRunButton = null;
    if (this.touch) {
      const buttons = isWin(reason) ? 2 : 1;
      const left = width / 2 - (buttons * 200 + (buttons - 1) * 16) / 2;
      if (isWin(reason)) {
        this.shareButton = { x: left, y: bottom - 22, w: 200, h: 44 };
        drawButton(ctx, this.shareButton, "Share result", { enabled: true, hovered: false });
      }
      this.newRunButton = { x: left + (buttons - 1) * 216, y: bottom - 22, w: 200, h: 44 };
      drawButton(ctx, this.newRunButton, "New run", { enabled: true, hovered: false });
    } else {
      if (isWin(reason)) {
        this.shareButton = { x: width / 2 - 100, y: bottom - 22, w: 200, h: 40 };
        drawButton(ctx, this.shareButton, "Copy result (C)", { enabled: true, hovered: false });
      }
      const hintY = isWin(reason) ? bottom + 40 : bottom;
      drawText(ctx, "Enter: start a new run", width / 2, hintY, { align: "center", size: 15, color: THEME.accent });
    }
    if (this.shareNote) drawText(ctx, this.shareNote, width / 2, bottom + (this.touch ? 40 : 66), { align: "center", size: 13, color: THEME.good });
  }
}
