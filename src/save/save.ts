import { PARTS, type PartCatalog } from "../data/parts";
import type { Contract } from "../economy/contracts";
import type { Run } from "../economy/run";
import { hexKey } from "../hex/hex";
import type { PlacedPart } from "../ship/ship";
import { browserStore, parseJson, type Store } from "./store";

// The run in progress, saved at every station change and at launch, and deleted when the core is lost.
// Bump the version whenever Run changes shape: an older save is then ignored instead of loading half-filled.
export const SAVE_KEY = "hex-ship/run";
export const SAVE_VERSION = 1;

type SavedRun = Omit<Run, "ship"> & { ship: PlacedPart[] };
type SaveFile = { version: number; run: SavedRun };

export function saveRun(run: Run, store: Store = browserStore()): void {
  const file: SaveFile = { version: SAVE_VERSION, run: { ...run, ship: [...run.ship.values()] } };
  store.set(SAVE_KEY, JSON.stringify(file));
}

// The saved run, or null if there is none or it can't be read.
export function loadRun(store: Store = browserStore(), catalog: PartCatalog = PARTS): Run | null {
  const file = parseJson(store.get(SAVE_KEY)) as SaveFile | null;
  if (!file || file.version !== SAVE_VERSION || !isSavedRun(file.run, catalog)) return null;
  const { ship, ...rest } = file.run;
  return { ...rest, ship: new Map(ship.map((part) => [hexKey(part.hex), part])) };
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
    run.peakShipValue,
    run.cargoEarned,
    run.bountiesEarned,
  ];
  return (
    numbers.every(Number.isFinite) &&
    (run.docked === 0 || run.docked === 1) &&
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
  Number.isInteger(c.tier);
