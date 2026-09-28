import { expect } from '@open-wc/testing';
import { UmbraDesktopWindowLayoutPersistence, browserLayoutCache, layoutStorageKey } from './layout-persistence.js';
import { serialiseLayout } from './layout.js';
import type { UmbraDesktopWindowLayout } from './layout.js';

/**
 * The window layout in this browser's localStorage, per user, and nowhere else.
 *
 * Not on the account, deliberately: the layout changes every time a window is moved, resized,
 * opened or closed, and writing that to the server each time is excessive for what is a convenience
 * for people who use the desktop regularly. Only the choice of whether to reopen windows lives on
 * the account, with the other settings.
 */

const LAYOUT: UmbraDesktopWindowLayout = {
  version: 1,
  windows: [{ app: 'content', rect: { x: 1, y: 2, w: 300, h: 200 }, state: 'normal', z: 1, active: true }],
};

/** A `Storage` in memory, optionally one that refuses every call, as private browsing can. */
function memoryStorage(refuses = false): Storage {
  const values = new Map<string, string>();
  const guard = () => {
    if (refuses) throw new DOMException('refused', 'SecurityError');
  };
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => (guard(), values.get(key) ?? null),
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => (guard(), void values.set(key, value)),
  };
}

/** Persistence over an in-memory storage, for one user. */
function persistence(user = 'user-1', storage = memoryStorage()) {
  return { storage, layout: new UmbraDesktopWindowLayoutPersistence(browserLayoutCache(user, storage)) };
}

it('saves the layout in this browser, under the user’s own key', async () => {
  const { layout, storage } = persistence();
  expect(await layout.save(LAYOUT)).to.equal(true);
  expect(storage.getItem(layoutStorageKey('user-1'))).to.equal(serialiseLayout(LAYOUT));
});

it('loads what it saved', async () => {
  const { layout } = persistence();
  await layout.save(LAYOUT);
  expect(await layout.load()).to.deep.equal({ layout: LAYOUT });
});

it('loads an empty layout when nothing is saved', async () => {
  const { layout } = persistence();
  expect(await layout.load()).to.deep.equal({ layout: { version: 1, windows: [] } });
});

it('keeps one user’s layout apart from another’s on the same browser', async () => {
  const storage = memoryStorage();
  await persistence('user-1', storage).layout.save(LAYOUT);
  expect(await persistence('user-2', storage).layout.load()).to.deep.equal({ layout: { version: 1, windows: [] } });
});

/** Private browsing, or blocked site data: the desktop still works, it just forgets on close. */
it('carries on when the browser refuses storage', async () => {
  const { layout } = persistence('user-1', memoryStorage(true));
  expect(await layout.save(LAYOUT)).to.equal(false);
  expect(await layout.load()).to.deep.equal({ layout: { version: 1, windows: [] } });
});
