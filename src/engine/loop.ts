export const STEP = 1 / 60;
const MAX_FRAME = 0.25; // avoid a spiral of catch-up updates after a tab switch

// Fixed-timestep updates with rendering once per animation frame.
export function startLoop(update: (dt: number) => void, render: () => void): void {
  let last = performance.now();
  let accumulator = 0;

  const frame = (now: number) => {
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
