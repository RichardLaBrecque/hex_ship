import { hexCorners, type Point } from "../hex/hex";

export type HexStyle = { fill?: string; stroke?: string; lineWidth?: number };

export function drawHex(ctx: CanvasRenderingContext2D, center: Point, size: number, style: HexStyle): void {
  const corners = hexCorners(center, size);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fill();
  }
  if (style.stroke) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth ?? 1;
    ctx.stroke();
  }
}
