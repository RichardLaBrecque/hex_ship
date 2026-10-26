import { Sound } from "./audio/sound";
import { PLANETS } from "./data/balance";
import { TUTORIAL } from "./data/tutorial";
import { afterFlight, arrive, launch, newRun, towBack, withBossWin, type Run, type TripResult } from "./economy/run";
import { tutorialRun } from "./economy/tutorial";
import type { Win } from "./economy/victory";
import { Input } from "./engine/input";
import { startLoop } from "./engine/loop";
import { SceneManager } from "./engine/scene";
import { fitView } from "./engine/view";
import { BriefingScene } from "./scenes/BriefingScene";
import { FlightScene } from "./scenes/FlightScene";
import { GameOverScene, type RunEnd } from "./scenes/GameOverScene";
import { StationScene } from "./scenes/StationScene";
import { drawMuteButton, muteButtonRect } from "./render/muteButton";
import { drawText, pointInRect, THEME, type Rect } from "./render/ui";
import { addScore, loadRecords, saveRecords, scoreOf } from "./save/records";
import { clearRun, loadRun, saveRun } from "./save/save";
import { markTutorialDone, tutorialDone } from "./save/tutorial";

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
  const flight = new FlightScene({
    run: flying,
    sound,
    onArrive: (trip, planet) => {
      sound.dock();
      const { run, delivered, earned } = arrive(flying, trip, planet);
      const report =
        delivered.length > 0
          ? `Delivered ${delivered.length} contract(s): +$${earned}`
          : run.cargo.length > 0
            ? `No cargo bound for ${PLANETS[planet].name}.`
            : "Arrived with an empty hold.";
      // Saved before the victory screen, so closing the tab on it keeps the win.
      if (run.won?.win === "merchant" && flying.won === null) {
        saveRun(run);
        showVictory(run, "merchant", "Keep playing", () => openStation(run, withTrip(report, trip)));
        return;
      }
      openStation(run, withTrip(report, trip));
    },
    onAbort: (trip) =>
      trip.fuel > 0
        ? openStation(afterFlight(flying, trip), withTrip("Turned back. Wages aren't refunded.", trip))
        : openStation(towBack(afterFlight(flying, trip)), withTrip("Towed back on an empty tank.", trip)),
    // A boss destroyed before the core still wins the run.
    onDestroyed: (trip) => endRun(withBossWin(flying, trip), "destroyed"),
    // Keeping on flying goes back to this same flight, right where it paused.
    onVictory: (trip) => showVictory(afterFlight(flying, trip), "warrior", "Keep flying", () => scenes.switchTo(flight)),
  });
  scenes.switchTo(flight);
}

// The tutorial: a briefing and then a flight for each leg in turn, then the finale and the game proper.
// Losing the ship, turning back or running dry flies the same leg again. Nothing in it is saved or scored.
function briefLeg(index: number, note?: string): void {
  const leg = TUTORIAL.legs[index];
  const run = tutorialRun(leg);
  scenes.switchTo(
    new BriefingScene({
      kicker: `TUTORIAL ${index + 1} / ${TUTORIAL.legs.length}`,
      title: leg.title,
      paragraphs: leg.briefing,
      ship: { name: leg.shipName, ship: run.ship },
      note,
      action: "Launch",
      onContinue: () => flyLeg(index, run),
      onSkip: finishTutorial,
    }),
  );
}

function flyLeg(index: number, run: Run): void {
  scenes.switchTo(
    new FlightScene({
      run,
      sound,
      script: TUTORIAL.legs[index].flight,
      onArrive: () => {
        sound.dock();
        if (index + 1 < TUTORIAL.legs.length) briefLeg(index + 1);
        else showFinale();
      },
      onAbort: (trip) => briefLeg(index, trip.fuel > 0 ? "You turned back. Give it another go." : "You ran dry and were towed back. Burn a little less this time."),
      onDestroyed: () => briefLeg(index, "The ship was destroyed. The yard has patched it up: try again."),
      onVictory: () => {}, // a tutorial flight has no boss
    }),
  );
}

function showFinale(): void {
  const { title, paragraphs } = TUTORIAL.finale;
  scenes.switchTo(new BriefingScene({ kicker: "TUTORIAL COMPLETE", title, paragraphs, action: "Take the helm", onContinue: finishTutorial }));
}

// Finished or skipped: on to the game proper, or back to the run already under way when the tutorial was replayed.
function finishTutorial(): void {
  markTutorialDone();
  const saved = loadRun();
  if (saved) openStation(saved, `Back to your run. Day ${saved.day}, $${saved.money}.`);
  else openStation(newRun(), "Welcome to Avalon, Captain. Your starter ship is fueled: take a contract and launch.");
}

// The core is lost or the player ended the run: the save goes and the score joins the records.
function endRun(run: Run, reason: RunEnd): void {
  const { records, newBests } = recordRun(run);
  scenes.switchTo(new GameOverScene({ run, reason, records, newBests, onRestart: () => openStation(newRun()), share, url: playUrl() }));
}

// The run was just won. Its score shows where it would land if the run ended now, but it's only recorded if the
// player ends it here; keeping on playing records it whenever the run does end.
function showVictory(run: Run, win: Win, label: string, onKeepPlaying: () => void): void {
  const { records, newBests } = addScore(loadRecords(), scoreOf(run, win));
  const onRestart = (): void => {
    recordRun(run);
    openStation(newRun());
  };
  scenes.switchTo(new GameOverScene({ run, reason: win, records, newBests, onRestart, share, url: playUrl(), keepPlaying: { label, onKeepPlaying } }));
}

// Deletes the save and adds the run's score to the records, tagged with how it was won if it was.
function recordRun(run: Run): ReturnType<typeof addScore> {
  clearRun();
  const result = addScore(loadRecords(), scoreOf(run, run.won?.win));
  saveRecords(result.records);
  return result;
}

const playUrl = (): string => window.location.href.split(/[?#]/)[0];

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

// The trip's report, plus the bounties it earned and the salvage it picked up, if any.
function withTrip(report: string, trip: TripResult): string {
  const bounty = trip.bounty > 0 ? ` Bounties: +$${trip.bounty}.` : "";
  const count = trip.salvage.length;
  const salvage = count > 0 ? ` Salvaged ${count} part${count === 1 ? "" : "s"}: see Cargo.` : "";
  return `${report}${bounty}${salvage}`;
}

// A new player starts with the tutorial. Adding #tutorial to the address plays it again.
const saved = loadRun();
const replayTutorial = window.location.hash === "#tutorial";
if (replayTutorial) history.replaceState(null, "", playUrl());
if (replayTutorial || (saved === null && !tutorialDone())) briefLeg(0);
else openStation(saved ?? newRun(), saved ? `Welcome back. Day ${saved.day}, $${saved.money}.` : undefined);

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
