import type { Input } from "./input";

export interface Scene {
  enter?(): void;
  exit?(): void;
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
