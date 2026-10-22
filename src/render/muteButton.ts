import { THEME, type Rect } from "./ui";

// A speaker icon in the top-right corner of every screen. Clicking it (or pressing M) mutes the game.
const SIZE = 28;
const MARGIN = 30; // from the right edge: clears the station side panel's border and padding

export const muteButtonRect = (width: number): Rect => ({ x: width - MARGIN - SIZE, y: 22, w: SIZE, h: SIZE });

export function drawMuteButton(ctx: CanvasRenderingContext2D, rect: Rect, muted: boolean, hovered: boolean): void {
  const color = hovered ? THEME.text : THEME.muted;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  ctx.save();
  if (hovered) {
    ctx.fillStyle = THEME.panelBorder;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
    ctx.fill();
  }

  // The speaker: a small box with a cone opening to the right.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy - 3);
  ctx.lineTo(cx - 5, cy - 3);
  ctx.lineTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.lineTo(cx - 5, cy + 3);
  ctx.lineTo(cx - 9, cy + 3);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  if (muted) {
    // A red cross where the sound waves would be.
    ctx.strokeStyle = THEME.bad;
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 4);
    ctx.lineTo(cx + 10, cy + 4);
    ctx.moveTo(cx + 10, cy - 4);
    ctx.lineTo(cx + 3, cy + 4);
    ctx.stroke();
  } else {
    // Two sound waves.
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx + 1, cy, 5, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 1, cy, 9, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }
  ctx.restore();
}
