import { PARTS, type PartCatalog } from "../data/parts";
import { directionAngle, hexToPixel, neighbor, type Point } from "../hex/hex";
import { engineFlame, type PlacedPart, type Ship } from "../ship/ship";
import { drawHex } from "./drawHex";
import { drawPartIcon } from "./drawParts";
import { THEME } from "./ui";

export type ShipDrawOptions = {
  origin: Point; // screen position of the ship's (0,0) hex
  size: number; // hex size in pixels
  angle?: number; // ship rotation in radians
  pivot?: Point; // ship-local point placed at `origin` and rotated around (e.g. centre of mass)
  thrust?: number; // the thrust control, -1..1: main engines flame on thrust, retro engines on brake
  alpha?: number;
  flagged?: ReadonlySet<string>; // hexKeys drawn with a red warning outline
  outline?: string; // hex border colour for every part, e.g. to mark enemies
  catalog?: PartCatalog;
};

export function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, options: ShipDrawOptions): void {
  ctx.save();
  ctx.translate(options.origin.x, options.origin.y);
  ctx.rotate(options.angle ?? 0);
  if (options.pivot) ctx.translate(-options.pivot.x, -options.pivot.y);
  ctx.globalAlpha = options.alpha ?? 1;
  if (options.thrust) drawEngineFlames(ctx, ship, options.size, options.thrust);
  for (const [key, part] of ship) {
    drawPart(ctx, part, options.size, options.flagged?.has(key) ?? false, options.catalog ?? PARTS, options.outline);
  }
  ctx.restore();
}

// Flames out of every engine that is firing, drawn under the hull.
function drawEngineFlames(ctx: CanvasRenderingContext2D, ship: Ship, size: number, thrust: number): void {
  for (const part of ship.values()) {
    const strength = engineFlame(ship, part, thrust);
    if (strength <= 0) continue;
    const from = hexToPixel(part.hex, size);
    const to = hexToPixel(neighbor(part.hex, part.rotation), size);
    const length = (0.6 + Math.random() * 0.4) * strength;
    const tip = { x: from.x + (to.x - from.x) * (0.4 + length), y: from.y + (to.y - from.y) * (0.4 + length) };
    const sideX = -(to.y - from.y) * 0.22;
    const sideY = (to.x - from.x) * 0.22;
    const baseX = from.x + (to.x - from.x) * 0.4;
    const baseY = from.y + (to.y - from.y) * 0.4;
    ctx.beginPath();
    ctx.moveTo(baseX + sideX, baseY + sideY);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(baseX - sideX, baseY - sideY);
    ctx.closePath();
    ctx.fillStyle = "#ffb347";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(baseX + sideX * 0.5, baseY + sideY * 0.5);
    ctx.lineTo(baseX + (tip.x - baseX) * 0.6, baseY + (tip.y - baseY) * 0.6);
    ctx.lineTo(baseX - sideX * 0.5, baseY - sideY * 0.5);
    ctx.closePath();
    ctx.fillStyle = "#fff3c4";
    ctx.fill();
  }
}

// Draws one part in ship-local space (the ship's transform is already applied).
export function drawPart(
  ctx: CanvasRenderingContext2D,
  part: PlacedPart,
  size: number,
  flagged: boolean,
  catalog: PartCatalog = PARTS,
  outline?: string,
): void {
  const def = catalog[part.type];
  const p = hexToPixel(part.hex, size);
  const health = part.hp / def.maxHp;
  drawHex(ctx, p, size - 1, {
    fill: flagged ? "#5a1d24" : `${def.color}${health < 1 ? "22" : "40"}`,
    stroke: flagged ? THEME.bad : (outline ?? def.color),
    lineWidth: flagged ? 3 : 1.5,
  });
  ctx.save();
  ctx.translate(p.x, p.y);
  drawPartIcon(ctx, def, part.rotation, size * 0.62);
  ctx.restore();
}

// A faint wedge showing where a weapon can fire.
export function drawFiringArc(ctx: CanvasRenderingContext2D, center: Point, rotation: number, arcDegrees: number, radius: number, color: string): void {
  const facing = directionAngle(rotation);
  const half = (arcDegrees * Math.PI) / 180;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.arc(center.x, center.y, radius, facing - half, facing + half);
  ctx.closePath();
  ctx.fillStyle = `${color}1f`;
  ctx.strokeStyle = `${color}66`;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
