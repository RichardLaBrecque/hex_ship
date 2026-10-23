// The smallest screen the station layout fits on, in CSS pixels.
export const MIN_WIDTH = 1000;
export const MIN_HEIGHT = 680;

export type View = { width: number; height: number; scale: number };

// Screens smaller than the minimum draw everything scaled down, keeping their aspect ratio.
// `width`/`height` are the logical size the scenes lay out in; desktop windows get scale 1.
export function fitView(cssWidth: number, cssHeight: number): View {
  const scale = Math.min(1, cssWidth / MIN_WIDTH, cssHeight / MIN_HEIGHT);
  return { width: cssWidth / scale, height: cssHeight / scale, scale };
}
