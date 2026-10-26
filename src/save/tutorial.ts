import { browserStore, type Store } from "./store";

// Set once the tutorial is finished or skipped, so it only greets a new player.
export const TUTORIAL_KEY = "hex-ship/tutorial-done";

export const tutorialDone = (store: Store = browserStore()): boolean => store.get(TUTORIAL_KEY) !== null;

export function markTutorialDone(store: Store = browserStore()): void {
  store.set(TUTORIAL_KEY, "1");
}
