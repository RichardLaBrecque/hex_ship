import { Sound } from "./audio/sound";
import { PLANETS } from "./data/balance";
import { afterFlight, arrive, launch, newRun, towBack, type Run } from "./economy/run";
import { deliveredGrandHaul } from "./economy/victory";
import { Input } from "./engine/input";
import { startLoop } from "./engine/loop";
import { SceneManager } from "./engine/scene";
import { fitView } from "./engine/view";
import { FlightScene } from "./scenes/FlightScene";
import { GameOverScene, type RunEnd } from "./scenes/GameOverScene";
import { StationScene } from "./scenes/StationScene";
import { drawMuteButton, muteButtonRect } from "./render/muteButton";
import { drawText, pointInRect, THEME, type Rect } from "./render/ui";
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

// Size the backing store for the device pixel ratio.
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  fitScene();
}

// Draw in the current scene's logical pixels (see fitView). Each scene can ask for its own minimum size.
function fitScene(): void {
  const dpr = window.devicePixelRatio || 1;
  const view = fitView(window.innerWidth, window.innerHeight, scenes.scene?.minView?.(input.usingTouch));
  width = view.width;
  height = view.height;
  input.scale = view.scale;
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// The run is saved at every station change, so a reload picks up where you left off.
function openStation(run: Run, report?: string): void {
  saveRun(run);
  scenes.switchTo(
    new StationScene({ run, report, onLaunch: (docked) => startTrip(docked), onChange: saveRun, onEndRun: (docked) => endRun(docked, "ended") }),
  );
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
      onArrive: (trip, planet) => {
        sound.dock();
        const { run, delivered, earned } = arrive(flying, trip, planet);
        if (deliveredGrandHaul(delivered)) {
          endRun(run, "merchant");
          return;
        }
        const report =
          delivered.length > 0
            ? `Delivered ${delivered.length} contract(s): +$${earned}`
            : run.cargo.length > 0
              ? `No cargo bound for ${PLANETS[planet].name}.`
              : "Arrived with an empty hold.";
        openStation(run, withBounty(report, trip.bounty));
      },
      onAbort: (trip) =>
        trip.fuel > 0
          ? openStation(afterFlight(flying, trip), withBounty("Turned back. Wages aren't refunded.", trip.bounty))
          : openStation(towBack(afterFlight(flying, trip)), withBounty("Towed back on an empty tank.", trip.bounty)),
      onDestroyed: () => endRun(flying, "destroyed"),
      onVictory: (trip) => endRun(afterFlight(flying, trip), "warrior"),
    }),
  );
}

// The core is lost, the player ended the run at a station, or the run was won: the save goes and the score joins the records.
function endRun(run: Run, reason: RunEnd): void {
  clearRun();
  const win = reason === "warrior" || reason === "merchant" ? reason : undefined;
  const { records, newBests } = addScore(loadRecords(), scoreOf(run, win));
  saveRecords(records);
  const url = window.location.href.split(/[?#]/)[0];
  scenes.switchTo(new GameOverScene({ run, reason, records, newBests, onRestart: () => openStation(newRun()), share, url }));
}

// Phones get the share sheet; everything else copies to the clipboard. Resolves to what to tell the player.
async function share(text: string): Promise<string> {
  try {
    if (input.usingTouch && navigator.share) {
      await navigator.share({ text });
      return "Shared!";
    }
    await navigator.clipboard.writeText(text);
    return "Copied to the clipboard. Paste it anywhere to share.";
  } catch {
    return "Couldn't share from this browser.";
  }
}

// The game is laid out for landscape. A phone held upright pauses behind a note until it's turned.
const isUpright = (): boolean => input.usingTouch && window.innerHeight > window.innerWidth;

function drawTurnSideways(): void {
  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, width, height);
  drawText(ctx, "↻", width / 2, height / 2 - 60, { align: "center", size: 64, color: THEME.accent });
  drawText(ctx, "Turn your phone sideways to play", width / 2, height / 2 + 10, { align: "center", size: 32, bold: true });
}

const muteButton = (): Rect => scenes.scene?.muteButton?.(width, height) ?? muteButtonRect(width);

const withBounty = (report: string, bounty: number): string => (bounty > 0 ? `${report} Bounties: +$${bounty}` : report);

const saved = loadRun();
openStation(saved ?? newRun(), saved ? `Welcome back. Day ${saved.day}, $${saved.money}.` : undefined);

startLoop(
  (dt) => {
    if (isUpright()) {
      sound.thrust(0); // flight sets it again on its next update
      input.endFrame();
      return;
    }
    // The mute button sits over every screen, so it takes its click before the scene sees it.
    const clickedMute = input.wasClicked(0) && pointInRect(input.mouse, muteButton());
    if (clickedMute) input.consumeClick(0);
    if (clickedMute || input.wasPressed("KeyM")) sound.toggleMute();
    scenes.scene?.update(dt, input);
    input.endFrame();
  },
  () => {
    fitScene();
    if (isUpright()) {
      drawTurnSideways();
      return;
    }
    scenes.scene?.render(ctx, width, height);
    const muteRect = muteButton();
    const hovered = pointInRect(input.mouse, muteRect);
    drawMuteButton(ctx, muteRect, sound.isMuted, hovered);
    canvas.style.cursor = hovered ? "pointer" : "";
  },
);
