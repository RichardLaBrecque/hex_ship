# Hex Ship

A top-down space trading game you play in the browser. Build a ship out of hex parts, haul cargo between two
planets, and fight off raiders on the way. Each run is roguelike: lose your ship and the run is over.

**Play it:** https://richardlabrecque.github.io/hex_ship/

> **This is a vibe-coding practice project.** I built it by pairing with an AI coding agent (Claude Code), one
> playable milestone at a time. I set the design, the rules and the feel, and played each build. The agent wrote
> most of the code. The point is to practise that way of working, so expect placeholder balance numbers and
> some rough edges.

## How to play

1. **Build your ship at the station.** Buy hex parts and place them on the grid: bridge, engines, fuel tanks, crew
   modules, cargo bays, armor, shields, and laser, cannon or missile pods. A ship has to be spaceworthy before it
   can launch, and where you put the engines matters. Engines that sit off-centre twist the ship, and the
   shipyard shows how far.
2. **Take a contract.** Load cargo, hire crew and buy fuel. Heavier ships burn more fuel.
3. **Fly it to the other planet.** Your weapons fire on their own. Your job is to fly.
4. **Sell, repair, upgrade, repeat.** Each delivery raises your reputation. Reputation unlocks better-paying
   contracts, which need bigger ships, and bigger ships draw tougher enemies.

Your score has three columns: peak ship value at launch, cargo sold, and bounties collected. Your best in each
column is saved as a high score. A run in progress is saved in your browser, so you can close the tab and come
back to it.

### Controls

| Where    | Input                     | Action                                |
| -------- | ------------------------- | ------------------------------------- |
| Station  | Left-click                | Buy and place a part / select a part  |
| Station  | Right-click or `Del`      | Sell a part                           |
| Station  | `1`–`8`                   | Pick a part to build                  |
| Station  | `R` / `Shift+R`           | Rotate                                |
| Station  | `Esc`                     | Stop building / deselect              |
| Flight   | `W` / `↑`                 | Thrust                                |
| Flight   | `S` / `↓`                 | Brake                                 |
| Flight   | `A` `D` / `←` `→`         | Turn                                  |
| Flight   | `Esc`                     | Turn back                             |
| Anywhere | `M` or the speaker button | Mute                                  |

**On a phone or tablet,** hold it sideways. The station has its own touch layout: the ship's grid on the left and
tabs on the right. To build, tap a part in the Parts tab, then tap a hex to see the part there. Rotate it if you
need to, then tap the hex again (or Place) to buy it. Tap a part on your ship to select it, rotate it or sell it. In
flight, the buttons in the bottom corners turn, thrust and brake, and you can hold two at once.

## Tech stack

- TypeScript with no game framework. It draws vector art on an HTML Canvas.
- [Vite](https://vite.dev/) for the dev server and build.
- [Vitest](https://vitest.dev/) for tests.
- The Web Audio API for synthesised sound effects. There are no audio files.
- GitHub Pages for hosting. Every push to `main` redeploys through
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Running it locally

You need Node 24. The exact version is pinned in [`mise.toml`](mise.toml), so if you use
[mise](https://mise.jdx.dev/), run `mise install` first.

```sh
npm install
npm run dev        # start the dev server
npm test           # run the tests
npm run typecheck  # type-check without building
npm run build      # type-check and build to dist/
npm run preview    # serve the built game
```

## Project layout

```
src/
  audio/    synthesised sound effects
  data/     part catalogue, enemy designs and balance numbers
  economy/  contracts, crew, fuel, shop, danger tiers and run state
  engine/   game loop, input and scenes
  fx/       particles and screen shake
  hex/      hex-grid maths
  render/   drawing ships, parts and UI
  save/     mid-run save and high scores (localStorage)
  scenes/   station, flight and game-over screens
  ship/     ship model, stats, damage and spaceworthiness checks
  sim/      flight physics, weapons, enemy AI and spawning
tests/      Vitest tests, including the balance rules
```

Some game-design rules are enforced as tests in [`tests/balance.test.ts`](tests/balance.test.ts). One example: a
full fuel tank must fly the starter ship twice the distance between the planets. If you change the numbers in
[`src/data/`](src/data/), run the tests.

## Status

Playable, and still being built. Balance numbers are placeholders until a proper balance pass. Ideas still on the
list include random route events, salvage from kills and part upgrade tiers.
