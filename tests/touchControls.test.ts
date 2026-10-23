import { describe, expect, it } from "vitest";
import { touchControlRects } from "../src/render/touchControls";
import type { Rect } from "../src/render/ui";

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const onScreen = (r: Rect, width: number, height: number): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;

describe("touchControlRects", () => {
  // The smallest logical view (see fitView), and a phone held sideways (844×390 css px → ≈1472×680 logical).
  for (const [width, height] of [
    [1000, 680],
    [1472, 680],
  ]) {
    it(`keeps every button on screen and apart at ${width}×${height}`, () => {
      const rects = Object.values(touchControlRects(width, height));
      for (const r of rects) expect(onScreen(r, width, height)).toBe(true);
      for (const [i, a] of rects.entries()) {
        for (const b of rects.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
      }
    });
  }

  it("puts turning on the left half and thrust and brake on the right half", () => {
    const rects = touchControlRects(1000, 680);
    expect(rects.right.x + rects.right.w).toBeLessThan(500);
    expect(rects.thrust.x).toBeGreaterThan(500);
    expect(rects.thrust.y).toBeLessThan(rects.brake.y);
  });
});
