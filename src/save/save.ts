import { PLANETS } from "../data/balance";
import { PARTS, type PartCatalog } from "../data/parts";
import type { Contract } from "../economy/contracts";
import type { Run } from "../economy/run";
import { hexKey } from "../hex/hex";
import type { PlacedPart } from "../ship/ship";
import { browserStore, parseJson, type Store } from "./store";

// The run in progress, saved at every station change and at launch, and deleted when the core is lost.
// Bump the version whenever Run changes shape: an older save is then ignored instead of loading half-filled.
export const SAVE_KEY = "hex-ship/run";
export const SAVE_VERSION = 3;

type SavedRun = Omit<Run, "ship"> & { ship: PlacedPart[] };
type SaveFile = { version: number; run: SavedRun };

export function saveRun(run: Run, store: Store = browserStore()): void {
  const file: SaveFile = { version: SAVE_VERSION, run: { ...run, ship: [...run.ship.values()] } };
  store.set(SAVE_KEY, JSON.stringify(file));
}

// The saved run, or null if there is none or it can't be read.
export function loadRun(store: Store = browserStore(), catalog: PartCatalog = PARTS): Run | null {
  const file = parseJson(store.get(SAVE_KEY)) as SaveFile | null;
  const saved = file ? upgrade(file) : null;
  if (!saved || !isSavedRun(saved, catalog)) return null;
  const { ship, ...rest } = saved;
  return { ...rest, ship: new Map(ship.map((part) => [hexKey(part.hex), part])) };
}

// Older saves, brought up to the current shape. Null for a version this game doesn't know.
// Version 1 is version 2 before boss trips were counted. Version 2 had only two planets, so every contract
// went from the planet you were docked at to the other one.
function upgrade(file: SaveFile): SavedRun | null {
  const { version, run } = file;
  if (version === SAVE_VERSION) return run;
  if (version !== 1 && version !== 2) return null;
  if (typeof run !== "object" || run === null) return null;
  const twoPlanet = (c: Contract): Contract => ({ ...c, from: run.docked, to: run.docked === 0 ? 1 : 0 });
  return {
    ...run,
    topTrips: version === 1 ? 0 : run.topTrips,
    offers: Array.isArray(run.offers) ? run.offers.map(twoPlanet) : run.offers,
    cargo: Array.isArray(run.cargo) ? run.cargo.map(twoPlanet) : run.cargo,
  };
}

export function clearRun(store: Store = browserStore()): void {
  store.remove(SAVE_KEY);
}

// A hand-edited or damaged save is treated as no save.
function isSavedRun(run: SavedRun | undefined, catalog: PartCatalog): boolean {
  if (typeof run !== "object" || run === null) return false;
  const numbers = [
    run.money,
    run.day,
    run.crew,
    run.crewSigned,
    run.fuel,
    run.delivered,
    run.kills,
    run.valueTier,
    run.topTrips,
    run.peakShipValue,
    run.cargoEarned,
    run.bountiesEarned,
  ];
  return (
    numbers.every(Number.isFinite) &&
    isPlanet(run.docked) &&
    Array.isArray(run.ship) &&
    run.ship.length > 0 &&
    run.ship.every((part) => isPart(part, catalog)) &&
    Array.isArray(run.offers) &&
    run.offers.every(isContract) &&
    Array.isArray(run.cargo) &&
    run.cargo.every(isContract)
  );
}

const isPart = (part: PlacedPart, catalog: PartCatalog): boolean =>
  typeof part === "object" &&
  part !== null &&
  Object.hasOwn(catalog, part.type) &&
  Number.isInteger(part.hex?.q) &&
  Number.isInteger(part.hex?.r) &&
  Number.isInteger(part.rotation) &&
  Number.isFinite(part.hp);

const isContract = (c: Contract): boolean =>
  typeof c === "object" &&
  c !== null &&
  typeof c.id === "string" &&
  typeof c.cargo === "string" &&
  Number.isFinite(c.units) &&
  Number.isFinite(c.payPerUnit) &&
  Number.isInteger(c.tier) &&
  isPlanet(c.from) &&
  (c.to === null || isPlanet(c.to));

const isPlanet = (index: number): boolean => Number.isInteger(index) && index >= 0 && index < PLANETS.length;
