export type Size = { width: number; height: number };

// The smallest screen the desktop layouts fit on, in CSS pixels. A scene can ask for another (see Scene.minView).
export const DEFAULT_MIN_VIEW: Size = { width: 1000, height: 680 };

export type View = { width: number; height: number; scale: number };

// Screens smaller than the minimum draw everything scaled down, keeping their aspect ratio.
// `width`/`height` are the logical size the scenes lay out in; desktop windows get scale 1.
export function fitView(cssWidth: number, cssHeight: number, min: Size = DEFAULT_MIN_VIEW): View {
  const scale = Math.min(1, cssWidth / min.width, cssHeight / min.height);
  return { width: cssWidth / scale, height: cssHeight / scale, scale };
}
