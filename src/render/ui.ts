import type { Point } from "../hex/hex";

export const THEME = {
  background: "#0b0f1a",
  panel: "#121a2b",
  panelBorder: "#24304a",
  text: "#c8d3ea",
  muted: "#7f8aa3",
  accent: "#7fb2ff",
  good: "#5fd38d",
  bad: "#ff5c5c",
  warn: "#ffb347",
  gridFill: "#141b2d",
  gridStroke: "#1f2a40",
};

export type Rect = { x: number; y: number; w: number; h: number };

export const pointInRect = (p: Point, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export function drawPanel(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.fillStyle = THEME.panel;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

export type TextStyle = { size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean };

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle = {}): void {
  ctx.font = `${style.bold ? "600 " : ""}${style.size ?? 13}px system-ui, sans-serif`;
  ctx.fillStyle = style.color ?? THEME.text;
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

// Breaks text into lines that fit `maxWidth` at the current font.
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size = 13): string[] {
  ctx.font = `${size}px system-ui, sans-serif`;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  state: { enabled: boolean; hovered: boolean },
): void {
  ctx.fillStyle = !state.enabled ? "#1a2233" : state.hovered ? "#2f5ea8" : "#244a85";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = state.enabled ? THEME.accent : THEME.panelBorder;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, {
    size: 15,
    bold: true,
    align: "center",
    color: state.enabled ? THEME.text : THEME.muted,
  });
}
