import type { Run } from "../economy/run";
import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import { drawButton, drawText, pointInRect, THEME, type Rect } from "../render/ui";
import type { NewBests, Records } from "../save/records";

export type RunEnd = "destroyed" | "ended"; // the core was lost, or the player ended the run at a station

export type GameOverOptions = {
  run: Run; // the run as it stood at launch, or at the station where it was ended
  reason: RunEnd;
  records: Records; // already including this run
  newBests: NewBests;
  onRestart: () => void;
};

export class GameOverScene implements Scene {
  private touch = false; // on a touch screen there's a New run button instead of the Enter hint
  private newRunButton: Rect | null = null; // laid out at the last render, while on touch

  constructor(private options: GameOverOptions) {}

  update(_dt: number, input: Input): void {
    this.touch = input.usingTouch;
    const tapped = this.newRunButton !== null && input.wasClicked(0) && pointInRect(input.mouse, this.newRunButton);
    if (input.wasPressed("Enter") || input.wasPressed("Space") || tapped) this.options.onRestart();
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { run, reason, records, newBests } = this.options;
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);
    const top = height / 2 - 170;
    const destroyed = reason === "destroyed";
    drawText(ctx, destroyed ? "GAME OVER" : "RUN ENDED", width / 2, top, { align: "center", size: 40, bold: true, color: destroyed ? THEME.bad : THEME.warn });
    const summary = destroyed ? `Your ship's core was destroyed on day ${run.day}.` : `You ended the run on day ${run.day}.`;
    drawText(ctx, summary, width / 2, top + 46, { align: "center", size: 16 });

    const columns = [
      { label: "PEAK SHIP VALUE", value: run.peakShipValue, best: records.best.peakShipValue, isNew: newBests.peakShipValue },
      { label: "CARGO SOLD", value: run.cargoEarned, best: records.best.cargoEarned, isNew: newBests.cargoEarned },
      { label: "BOUNTIES COLLECTED", value: run.bountiesEarned, best: records.best.bountiesEarned, isNew: newBests.bountiesEarned },
    ];
    const spacing = Math.min(220, width / 3);
    const columnX = (i: number): number => width / 2 + (i - 1) * spacing;
    columns.forEach((column, i) => {
      const x = columnX(i);
      drawText(ctx, column.label, x, top + 90, { align: "center", size: 12, bold: true, color: THEME.muted });
      drawText(ctx, `$${column.value}`, x, top + 118, { align: "center", size: 26, bold: true, color: THEME.good });
      const best = column.isNew ? "NEW BEST!" : `Best $${column.best}`;
      drawText(ctx, best, x, top + 144, { align: "center", size: 13, bold: column.isNew, color: column.isNew ? THEME.warn : THEME.muted });
    });

    // Recent runs, newest first; the first row is this one.
    drawText(ctx, "RECENT RUNS", width / 2, top + 192, { align: "center", size: 12, bold: true, color: THEME.muted });
    records.recent.forEach((score, row) => {
      const y = top + 216 + row * 20;
      const color = row === 0 ? THEME.text : THEME.muted;
      drawText(ctx, `Day ${score.day}`, columnX(0) - spacing / 2 - 20, y, { align: "center", size: 13, color });
      const values = [score.peakShipValue, score.cargoEarned, score.bountiesEarned];
      values.forEach((value, i) => drawText(ctx, `$${value}`, columnX(i), y, { align: "center", size: 13, color }));
    });

    const bottom = top + 216 + records.recent.length * 20 + 24;
    if (this.touch) {
      this.newRunButton = { x: width / 2 - 100, y: bottom - 22, w: 200, h: 44 };
      drawButton(ctx, this.newRunButton, "New run", { enabled: true, hovered: false });
    } else {
      this.newRunButton = null;
      drawText(ctx, "Enter: start a new run", width / 2, bottom, { align: "center", size: 15, color: THEME.accent });
    }
  }
}
