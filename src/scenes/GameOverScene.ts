import type { Run } from "../economy/run";
import type { Input } from "../engine/input";
import type { Scene } from "../engine/scene";
import { drawText, THEME } from "../render/ui";

export type GameOverOptions = {
  run: Run; // the run as it stood at launch
  onRestart: () => void;
};

export class GameOverScene implements Scene {
  constructor(private options: GameOverOptions) {}

  update(_dt: number, input: Input): void {
    if (input.wasPressed("Enter") || input.wasPressed("Space")) this.options.onRestart();
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { run } = this.options;
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, width, height);
    drawText(ctx, "GAME OVER", width / 2, height / 2 - 70, { align: "center", size: 40, bold: true, color: THEME.bad });
    drawText(ctx, `Your ship's core was destroyed on day ${run.day}.`, width / 2, height / 2 - 24, { align: "center", size: 16 });

    const columns = [
      { label: "PEAK SHIP VALUE", value: run.peakShipValue },
      { label: "CARGO SOLD", value: run.cargoEarned },
      { label: "BOUNTIES COLLECTED", value: run.bountiesEarned },
    ];
    const spacing = Math.min(220, width / 3);
    columns.forEach((column, i) => {
      const x = width / 2 + (i - 1) * spacing;
      drawText(ctx, column.label, x, height / 2 + 20, { align: "center", size: 12, bold: true, color: THEME.muted });
      drawText(ctx, `$${column.value}`, x, height / 2 + 48, { align: "center", size: 26, bold: true, color: THEME.good });
    });

    drawText(ctx, "Enter: start a new run", width / 2, height / 2 + 110, { align: "center", size: 15, color: THEME.accent });
  }
}
