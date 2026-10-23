import { Sound } from "./audio/sound";
import { afterFlight, arrive, launch, newRun, towBack, type Run } from "./economy/run";
import { Input } from "./engine/input";
import { startLoop } from "./engine/loop";
import { SceneManager } from "./engine/scene";
import { fitView } from "./engine/view";
import { FlightScene } from "./scenes/FlightScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { StationScene } from "./scenes/StationScene";
import { drawMuteButton, muteButtonRect } from "./render/muteButton";
import { pointInRect } from "./render/ui";
import { addScore, loadRecords, saveRecords, scoreOf } from "./save/records";
import { clearRun, loadRun, saveRun } from "./save/save";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const input = new Input(canvas);
const scenes = new SceneManager();
const sound = new Sound();
// Browsers only start audio from a key press or click.
window.addEventListener("keydown", () => sound.unlock());
window.addEventListener("pointerdown", () => sound.unlock());

let width = 0;
let height = 0;

// Size the backing store for the device pixel ratio but draw in logical pixels (see fitView).
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const view = fitView(window.innerWidth, window.innerHeight);
  width = view.width;
  height = view.height;
  input.scale = view.scale;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// The run is saved at every station change, so a reload picks up where you left off.
function openStation(run: Run, report?: string): void {
  saveRun(run);
  scenes.switchTo(new StationScene({ run, report, onLaunch: (docked) => startTrip(docked), onChange: saveRun }));
}

// Launch costs are paid up front; turning back (Esc) doesn't refund them.
// Saving the launched run means closing the tab mid-flight is like turning back: back at the station, wages spent.
function startTrip(docked: Run): void {
  const outcome = launch(docked);
  if (!outcome.ok) return;
  const flying = outcome.run;
  saveRun(flying);
  scenes.switchTo(
    new FlightScene({
      run: flying,
      sound,
      onArrive: (trip) => {
        sound.dock();
        const { run, delivered, earned } = arrive(afterFlight(flying, trip));
        const report = delivered.length > 0 ? `Delivered ${delivered.length} contract(s): +$${earned}` : "Arrived with an empty hold.";
        openStation(run, withBounty(report, trip.bounty));
      },
      onAbort: (trip) =>
        trip.fuel > 0
          ? openStation(afterFlight(flying, trip), withBounty("Turned back. Wages aren't refunded.", trip.bounty))
          : openStation(towBack(afterFlight(flying, trip)), withBounty("Towed back on an empty tank.", trip.bounty)),
      onDestroyed: () => endRun(flying),
    }),
  );
}

// The core is lost: the save goes and the score joins the records.
function endRun(run: Run): void {
  clearRun();
  const { records, newBests } = addScore(loadRecords(), scoreOf(run));
  saveRecords(records);
  scenes.switchTo(new GameOverScene({ run, records, newBests, onRestart: () => openStation(newRun()) }));
}

const withBounty = (report: string, bounty: number): string => (bounty > 0 ? `${report} Bounties: +$${bounty}` : report);

const saved = loadRun();
openStation(saved ?? newRun(), saved ? `Welcome back. Day ${saved.day}, $${saved.money}.` : undefined);

startLoop(
  (dt) => {
    // The mute button sits over every screen, so it takes its click before the scene sees it.
    const clickedMute = input.wasClicked(0) && pointInRect(input.mouse, muteButtonRect(width));
    if (clickedMute) input.consumeClick(0);
    if (clickedMute || input.wasPressed("KeyM")) sound.toggleMute();
    scenes.scene?.update(dt, input);
    input.endFrame();
  },
  () => {
    scenes.scene?.render(ctx, width, height);
    const muteButton = muteButtonRect(width);
    const hovered = pointInRect(input.mouse, muteButton);
    drawMuteButton(ctx, muteButton, sound.isMuted, hovered);
    canvas.style.cursor = hovered ? "pointer" : "";
  },
);
