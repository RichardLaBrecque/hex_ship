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
    drawText(ctx, "Your ship's core was destroyed.", width / 2, height / 2 - 24, { align: "center", size: 16 });
    drawText(ctx, `Survived ${run.day} day${run.day === 1 ? "" : "s"}  ·  $${run.money}`, width / 2, height / 2 + 8, {
      align: "center",
      size: 16,
      color: THEME.muted,
    });
    drawText(ctx, "Enter: start a new run", width / 2, height / 2 + 60, { align: "center", size: 15, color: THEME.accent });
  }
}
