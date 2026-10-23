import { drawText, THEME, type Rect } from "./ui";

// On-screen flight buttons for touch screens: turn with the left thumb, thrust and brake with the right.
const SIZE = 110;
const GAP = 16;
const MARGIN = 24;
const BACK_TOP = 232; // under the flight HUD's text and fuel gauge

export type TouchControls = { left: Rect; right: Rect; thrust: Rect; brake: Rect; back: Rect };

export type HeldControls = { left: boolean; right: boolean; thrust: boolean; brake: boolean };

export function touchControlRects(width: number, height: number): TouchControls {
  const bottom = height - MARGIN - SIZE;
  const rightEdge = width - MARGIN - SIZE;
  return {
    left: { x: MARGIN, y: bottom, w: SIZE, h: SIZE },
    right: { x: MARGIN + SIZE + GAP, y: bottom, w: SIZE, h: SIZE },
    thrust: { x: rightEdge, y: bottom - SIZE - GAP, w: SIZE, h: SIZE },
    brake: { x: rightEdge, y: bottom, w: SIZE, h: SIZE },
    back: { x: MARGIN - 4, y: BACK_TOP, w: 130, h: 40 },
  };
}

export function drawTouchControls(ctx: CanvasRenderingContext2D, controls: TouchControls, held: HeldControls, backLabel: string): void {
  drawHoldButton(ctx, controls.left, "◀", held.left);
  drawHoldButton(ctx, controls.right, "▶", held.right);
  drawHoldButton(ctx, controls.thrust, "THRUST", held.thrust);
  drawHoldButton(ctx, controls.brake, "BRAKE", held.brake);
  drawHoldButton(ctx, controls.back, backLabel, false, 15);
}

// Translucent, so the fight behind them stays visible.
function drawHoldButton(ctx: CanvasRenderingContext2D, r: Rect, label: string, held: boolean, size = 20): void {
  ctx.save();
  ctx.globalAlpha = held ? 0.75 : 0.4;
  ctx.fillStyle = held ? "#2f5ea8" : THEME.panel;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 14);
  ctx.fill();
  ctx.strokeStyle = THEME.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, { align: "center", size, bold: true, color: held ? THEME.text : THEME.muted });
}
