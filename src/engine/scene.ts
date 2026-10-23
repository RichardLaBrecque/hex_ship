import type { Input } from "./input";
import type { Size } from "./view";

export interface Scene {
  enter?(): void;
  exit?(): void;
  // The smallest logical size this scene lays out in; smaller screens draw it scaled down. Defaults to DEFAULT_MIN_VIEW.
  minView?(touch: boolean): Size;
  update(dt: number, input: Input): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}

export class SceneManager {
  private current: Scene | null = null;

  get scene(): Scene | null {
    return this.current;
  }

  switchTo(next: Scene): void {
    this.current?.exit?.();
    this.current = next;
    next.enter?.();
  }
}
