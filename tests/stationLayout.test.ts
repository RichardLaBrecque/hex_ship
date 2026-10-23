import { describe, expect, it } from "vitest";
import { STATION_TABS, touchStationLayout } from "../src/render/stationLayout";
import type { Rect } from "../src/render/ui";

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const onScreen = (r: Rect, width: number, height: number): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;

describe("touchStationLayout", () => {
  // The smallest touch station (see StationScene.minView), an iPhone SE and an iPhone 14 held sideways.
  for (const [width, height] of [
    [640, 360],
    [667, 375],
    [844, 390],
  ]) {
    it(`keeps every area on screen and apart at ${width}×${height}`, () => {
      const layout = touchStationLayout(width, height);
      const rects = [layout.grid, layout.status, layout.mute, ...layout.tabs, layout.body, layout.launch];
      for (const r of rects) expect(onScreen(r, width, height)).toBe(true);
      for (const [i, a] of rects.entries()) {
        for (const b of rects.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
      }
    });
  }

  it("leaves room for the tallest tab, the ship stats, on the smallest screen", () => {
    // The first row sits 10px down, then nine 20px rows, then the hull row 14px above the 26px repair button.
    expect(touchStationLayout(640, 360).body.h).toBeGreaterThanOrEqual(10 + 180 + 14 + 26);
  });

  it("makes hexes about 38px across on an iPhone 14", () => {
    // 390px tall minus two 8px margins, over 17 hex sizes, is 22; a pointy-top hex is √3 sizes across its flats.
    const { hexSize } = touchStationLayout(844, 390);
    expect(hexSize).toBeCloseTo(22, 6);
    expect(hexSize * Math.sqrt(3)).toBeCloseTo(38.1, 1);
  });

  it("shrinks the grid on narrow screens to keep the panel wide enough for its tabs", () => {
    // (640 − 3 × 8 − 300) / 19 ≈ 16.6, which is less than the height allows.
    const layout = touchStationLayout(640, 360);
    expect(layout.hexSize).toBeCloseTo(16.63, 2);
    expect(layout.panel.w).toBeCloseTo(300, 6);
    expect(layout.tabs).toHaveLength(STATION_TABS.length);
  });
});
