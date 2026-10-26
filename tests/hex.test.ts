import { describe, expect, it } from "vitest";
import {
  DIRECTIONS,
  fromKey,
  hex,
  hexDistance,
  hexesInRadius,
  hexKey,
  hexRotate,
  hexToPixel,
  neighbor,
  neighbors,
  pixelToHex,
} from "../src/hex/hex";

describe("hexKey / fromKey", () => {
  it("round-trips", () => {
    expect(fromKey(hexKey(hex(-3, 7)))).toEqual(hex(-3, 7));
  });
});

describe("neighbors", () => {
  it("returns six hexes all at distance 1", () => {
    const result = neighbors(hex(2, -1));
    expect(result).toHaveLength(6);
    for (const n of result) expect(hexDistance(n, hex(2, -1))).toBe(1);
  });

  it("wraps direction indexes", () => {
    expect(neighbor(hex(0, 0), 7)).toEqual(neighbor(hex(0, 0), 1));
    expect(neighbor(hex(0, 0), -1)).toEqual(neighbor(hex(0, 0), 5));
  });
});

describe("hexDistance", () => {
  it("counts steps between hexes", () => {
    expect(hexDistance(hex(0, 0), hex(3, -1))).toBe(3);
    expect(hexDistance(hex(-2, 2), hex(2, -2))).toBe(4);
  });
});

describe("hexRotate", () => {
  it("turns each direction into the next one clockwise", () => {
    DIRECTIONS.forEach((d, i) => {
      expect(hexRotate(d, 1)).toEqual(DIRECTIONS[(i + 1) % 6]);
    });
  });

  it("returns to the start after six steps", () => {
    expect(hexRotate(hex(2, -3), 6)).toEqual(hex(2, -3));
  });

  it("handles negative steps", () => {
    expect(hexRotate(hex(1, 0), -1)).toEqual(hex(1, -1));
  });
});

describe("hexesInRadius", () => {
  it("has 1 + 3r(r+1) hexes", () => {
    expect(hexesInRadius(0)).toHaveLength(1);
    expect(hexesInRadius(1)).toHaveLength(7);
    expect(hexesInRadius(3)).toHaveLength(37);
  });
});

describe("hexToPixel / pixelToHex", () => {
  it("round-trips every hex in a radius", () => {
    for (const h of hexesInRadius(5)) {
      expect(pixelToHex(hexToPixel(h, 24), 24)).toEqual(h);
    }
  });

  it("puts the origin at 0,0 and E one hex-width to the right", () => {
    expect(hexToPixel(hex(0, 0), 10)).toEqual({ x: 0, y: 0 });
    expect(hexToPixel(hex(1, 0), 10).x).toBeCloseTo(10 * Math.sqrt(3));
    expect(hexToPixel(hex(1, 0), 10).y).toBe(0);
  });

  it("maps points near a center back to that hex", () => {
    expect(pixelToHex({ x: 3, y: -4 }, 24)).toEqual(hex(0, 0));
  });
});
