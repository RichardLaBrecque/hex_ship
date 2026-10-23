import type { Point } from "../hex/hex";

// Tracks held keys, the mouse and touches, plus "just pressed" edges that last one update.
// A tap counts as a left click where the finger lands.
export class Input {
  mouse: Point = { x: 0, y: 0 };
  scale = 1; // CSS pixels per logical pixel (see fitView); pointer positions are divided by it
  usingTouch = false; // set by the first touch; scenes draw touch controls from then on
  private held = new Set<string>();
  private pressed = new Set<string>();
  private mouseButtonsPressed = new Set<number>();
  private activeTouches = new Map<number, Point>();

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.held.clear());
    canvas.addEventListener("pointermove", (e) => {
      this.mouse = this.toLogical(e);
      if (this.activeTouches.has(e.pointerId)) this.activeTouches.set(e.pointerId, this.mouse);
    });
    canvas.addEventListener("pointerdown", (e) => {
      this.mouse = this.toLogical(e);
      this.mouseButtonsPressed.add(e.button);
      if (e.pointerType === "touch") {
        this.usingTouch = true;
        this.activeTouches.set(e.pointerId, this.mouse);
      }
    });
    const release = (e: PointerEvent) => this.activeTouches.delete(e.pointerId);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private toLogical(e: PointerEvent): Point {
    return { x: e.offsetX / this.scale, y: e.offsetY / this.scale };
  }

  // Where every finger on the screen is right now, for buttons that are held down.
  touches(): Point[] {
    return [...this.activeTouches.values()];
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  // 0 = left, 2 = right
  wasClicked(button: number): boolean {
    return this.mouseButtonsPressed.has(button);
  }

  // Call once at the end of every fixed update.
  endFrame(): void {
    this.pressed.clear();
    this.mouseButtonsPressed.clear();
  }

  // Marks a click as handled, so the scene underneath doesn't also act on it.
  consumeClick(button: number): void {
    this.mouseButtonsPressed.delete(button);
  }
}
