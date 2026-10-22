// Where saves live. The browser's localStorage in the game, a Map in tests.
export type Store = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

// localStorage can be missing or throw (private windows, blocked site data). Then nothing is saved.
export const browserStore = (): Store => ({
  get: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // the game still plays; it just won't remember
    }
  },
  remove: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // as above
    }
  },
});

export const memoryStore = (): Store => {
  const items = new Map<string, string>();
  return {
    get: (key) => items.get(key) ?? null,
    set: (key, value) => void items.set(key, value),
    remove: (key) => void items.delete(key),
  };
};

// Parses JSON, or returns null if it isn't valid.
export function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
