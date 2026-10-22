import { arrive, launch, newRun, towBack, type Run } from "./economy/run";
import { Input } from "./engine/input";
import { startLoop } from "./engine/loop";
import { SceneManager } from "./engine/scene";
import { FlightScene } from "./scenes/FlightScene";
import { StationScene } from "./scenes/StationScene";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const input = new Input(canvas);
const scenes = new SceneManager();

let width = 0;
let height = 0;

// Size the backing store for the device pixel ratio but draw in CSS pixels.
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function openStation(run: Run, report?: string): void {
  scenes.switchTo(new StationScene({ run, report, onLaunch: (docked) => startTrip(docked) }));
}

// Launch costs are paid up front; turning back (Esc) doesn't refund them.
function startTrip(docked: Run): void {
  const outcome = launch(docked);
  if (!outcome.ok) return;
  const flying = outcome.run;
  scenes.switchTo(
    new FlightScene({
      run: flying,
      onArrive: (fuel) => {
        const { run, delivered, earned } = arrive({ ...flying, fuel });
        openStation(run, delivered.length > 0 ? `Delivered ${delivered.length} contract(s): +$${earned}` : "Arrived with an empty hold.");
      },
      onAbort: (fuel) =>
        fuel > 0
          ? openStation({ ...flying, fuel }, "Turned back. Wages aren't refunded.")
          : openStation(towBack(flying), "Towed back on an empty tank."),
    }),
  );
}

openStation(newRun());

startLoop(
  (dt) => {
    scenes.scene?.update(dt, input);
    input.endFrame();
  },
  () => scenes.scene?.render(ctx, width, height),
);
