import { describe, expect, it } from "vitest";
import { fitView } from "../src/engine/view";

describe("fitView", () => {
  it("leaves screens at least the minimum size alone", () => {
    expect(fitView(1440, 900)).toEqual({ width: 1440, height: 900, scale: 1 });
  });

  it("scales a landscape phone down by its height", () => {
    // 390 / 680 ≈ 0.5735, so 844 css px become ≈ 1471.6 logical px.
    const view = fitView(844, 390);
    expect(view.scale).toBeCloseTo(0.5735, 4);
    expect(view.height).toBeCloseTo(680, 6);
    expect(view.width).toBeCloseTo(1471.6, 1);
  });

  it("scales a narrow screen down by its width", () => {
    // 800 / 1000 = 0.8, so 700 css px become 875 logical px.
    const view = fitView(800, 700);
    expect(view.scale).toBeCloseTo(0.8, 6);
    expect(view.width).toBeCloseTo(1000, 6);
    expect(view.height).toBeCloseTo(875, 6);
  });
});
