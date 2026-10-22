import type { Point } from "../hex/hex";

// Tracks held keys and mouse state, plus "just pressed" edges that last one update.
export class Input {
  mouse: Point = { x: 0, y: 0 };
  private held = new Set<string>();
  private pressed = new Set<string>();
  private mouseButtonsPressed = new Set<number>();

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.held.clear());
    canvas.addEventListener("mousemove", (e) => {
      this.mouse = { x: e.offsetX, y: e.offsetY };
    });
    canvas.addEventListener("mousedown", (e) => this.mouseButtonsPressed.add(e.button));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
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
