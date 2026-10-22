// Pointy-top hexes in axial coordinates (q, r).
// Screen space has y pointing down, so increasing direction index turns clockwise.

export type Hex = { readonly q: number; readonly r: number };
export type Point = { readonly x: number; readonly y: number };

export const hex = (q: number, r: number): Hex => ({ q, r });

// 0=E, 1=SE, 2=SW, 3=W, 4=NW, 5=NE
export const DIRECTIONS: readonly Hex[] = [
  hex(1, 0),
  hex(0, 1),
  hex(-1, 1),
  hex(-1, 0),
  hex(0, -1),
  hex(1, -1),
];

const SQRT3 = Math.sqrt(3);

export const hexKey = (h: Hex): string => `${h.q},${h.r}`;

export function fromKey(key: string): Hex {
  const [q, r] = key.split(",").map(Number);
  return hex(q, r);
}

export const hexEquals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const hexAdd = (a: Hex, b: Hex): Hex => hex(a.q + b.q, a.r + b.r);

export const hexSub = (a: Hex, b: Hex): Hex => hex(a.q - b.q, a.r - b.r);

export const neighbor = (h: Hex, direction: number): Hex => hexAdd(h, DIRECTIONS[mod6(direction)]);

export const neighbors = (h: Hex): Hex[] => DIRECTIONS.map((d) => hexAdd(h, d));

export function hexDistance(a: Hex, b: Hex): number {
  const d = hexSub(a, b);
  return (Math.abs(d.q) + Math.abs(d.r) + Math.abs(d.q + d.r)) / 2;
}

// Rotate around the origin by 60° clockwise per step.
export function hexRotate(h: Hex, steps: number): Hex {
  let q = h.q;
  let r = h.r;
  for (let i = 0; i < mod6(steps); i++) {
    [q, r] = [-r, q + r];
  }
  return hex(q + 0, r + 0); // + 0 turns -0 into 0
}

// Every hex within `radius` of the origin, including the origin.
export function hexesInRadius(radius: number): Hex[] {
  const result: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      result.push(hex(q, r));
    }
  }
  return result;
}

export function hexToPixel(h: Hex, size: number): Point {
  return {
    x: size * (SQRT3 * h.q + (SQRT3 / 2) * h.r),
    y: size * 1.5 * h.r,
  };
}

export function pixelToHex(p: Point, size: number): Hex {
  const q = ((SQRT3 / 3) * p.x - p.y / 3) / size;
  const r = ((2 / 3) * p.y) / size;
  return hexRound(q, r);
}

export function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }
  return hex(rq + 0, rr + 0); // + 0 turns -0 into 0
}

// Corner points of a hex centred at `center`, starting at the top and going clockwise.
export function hexCorners(center: Point, size: number): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    corners.push({ x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) });
  }
  return corners;
}

// Screen angle (radians) of a direction index, 0 = pointing right.
export const directionAngle = (direction: number): number => (Math.PI / 3) * mod6(direction);

export const mod6 = (n: number): number => ((n % 6) + 6) % 6;
