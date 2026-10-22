import type { PartDef } from "../data/parts";
import { directionAngle } from "../hex/hex";

// Draws a part's icon centred on the origin. The caller has already translated/rotated to the hex.
export function drawPartIcon(ctx: CanvasRenderingContext2D, def: PartDef, rotation: number, s: number): void {
  ctx.save();
  ctx.fillStyle = def.color;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = Math.max(1.5, s * 0.08);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (def.id) {
    case "bridge":
      polygon(ctx, [[0, -0.55], [0.45, 0], [0, 0.55], [-0.45, 0]], s);
      ctx.fill();
      ctx.fillStyle = "#0b0f1a";
      circle(ctx, 0, 0, 0.18 * s);
      ctx.fill();
      break;
    case "engine":
      ctx.rotate(directionAngle(rotation));
      polygon(ctx, [[-0.25, -0.28], [0.3, -0.28], [0.78, -0.5], [0.78, 0.5], [0.3, 0.28], [-0.25, 0.28]], s);
      ctx.fill();
      ctx.fillStyle = "#0b0f1a";
      circle(ctx, -0.05 * s, 0, 0.14 * s);
      ctx.fill();
      break;
    case "fuel":
      // a capsule-shaped tank with a fill line
      ctx.beginPath();
      ctx.roundRect(-0.3 * s, -0.55 * s, 0.6 * s, 1.1 * s, 0.3 * s);
      ctx.stroke();
      ctx.fillRect(-0.18 * s, -0.05 * s, 0.36 * s, 0.42 * s);
      break;
    case "crew":
      for (const [x, y] of [[-0.28, 0.12], [0.28, 0.12], [0, -0.28]]) {
        circle(ctx, x * s, y * s, 0.17 * s);
        ctx.fill();
      }
      break;
    case "laser":
      ctx.rotate(directionAngle(rotation));
      line(ctx, 0, 0, 0.9 * s, 0);
      circle(ctx, 0, 0, 0.26 * s);
      ctx.fill();
      break;
    case "cannon":
      ctx.rotate(directionAngle(rotation));
      ctx.fillRect(0, -0.13 * s, 0.85 * s, 0.26 * s);
      circle(ctx, 0, 0, 0.36 * s);
      ctx.fill();
      break;
    case "missile":
      ctx.rotate(directionAngle(rotation));
      for (const y of [-0.24, 0.24]) {
        polygon(ctx, [[-0.35, y - 0.12], [0.55, y], [-0.35, y + 0.12]], s);
        ctx.fill();
      }
      break;
    case "cargo":
      ctx.strokeRect(-0.42 * s, -0.42 * s, 0.84 * s, 0.84 * s);
      line(ctx, -0.42 * s, -0.42 * s, 0.42 * s, 0.42 * s);
      line(ctx, 0.42 * s, -0.42 * s, -0.42 * s, 0.42 * s);
      break;
    case "armor": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        pts.push([0.6 * Math.cos(a), 0.6 * Math.sin(a)]);
      }
      polygon(ctx, pts, s);
      ctx.stroke();
      break;
    }
    case "shield":
      circle(ctx, 0, 0, 0.5 * s);
      ctx.stroke();
      circle(ctx, 0, 0, 0.2 * s);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function polygon(ctx: CanvasRenderingContext2D, points: number[][], s: number): void {
  ctx.beginPath();
  ctx.moveTo(points[0][0] * s, points[0][1] * s);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] * s, points[i][1] * s);
  ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
