import { expect } from '@open-wc/testing';
import { layoutStorageKey, windowLayoutStore } from './layout-persistence.js';
import { serialiseLayout } from './layout.js';
import type { UmbraDesktopWindowLayout } from './layout.js';
import type { UmbraDesktopReopenWindows } from '../settings/types.js';

/**
 * The window layout in this browser, per user, and never on the account.
 *
 * Two copies with different jobs. The tab's `sessionStorage` is the working copy: every save goes
 * there and every load reads it first, so two tabs never overwrite each other and F5 brings back
 * exactly this tab. `localStorage` is only written when the user keeps their windows between
 * visits, and only read by a tab that has no working copy yet, to seed it.
 */

const LAYOUT: UmbraDesktopWindowLayout = {
  version: 1,
  windows: [{ app: 'content', rect: { x: 1, y: 2, w: 300, h: 200 }, state: 'normal', z: 1, active: true }],
};

const OTHER: UmbraDesktopWindowLayout = {
  version: 1,
  windows: [{ app: 'media', rect: { x: 5, y: 5, w: 400, h: 300 }, state: 'maximized', z: 1, active: true }],
};

const EMPTY: UmbraDesktopWindowLayout = { version: 1, windows: [] };

/** A `Storage` in memory, optionally one that refuses every call, as blocked site data can. */
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
    removeItem: (key) => (guard(), void values.delete(key)),
    setItem: (key, value) => (guard(), void values.set(key, value)),
  };
}

/**
 * A store for one user over in-memory session and local storage, with a mode the case can change.
 * @param options The user, the starting mode, and the storages, when a case shares them.
 */
function setup(options: { user?: string; mode?: UmbraDesktopReopenWindows; session?: Storage; local?: Storage } = {}) {
  const session = options.session ?? memoryStorage();
  const local = options.local ?? memoryStorage();
  let mode: UmbraDesktopReopenWindows = options.mode ?? 'session';
  const store = windowLayoutStore(options.user ?? 'user-1', () => mode, {
    session: () => session,
    local: () => local,
  });
  return { store, session, local, setMode: (next: UmbraDesktopReopenWindows) => (mode = next) };
}

const key = layoutStorageKey('user-1');

it('saves to the tab only, after a refresh', () => {
  const { store, session, local } = setup();
  store.save(LAYOUT);
  expect(session.getItem(key)).to.equal(serialiseLayout(LAYOUT));
  expect(local.getItem(key), 'nothing kept once the tab closes').to.equal(null);
});

it('saves to the tab and the browser when windows are kept between visits', () => {
  const { store, session, local } = setup({ mode: 'persistent' });
  store.save(LAYOUT);
  expect(session.getItem(key)).to.equal(serialiseLayout(LAYOUT));
  expect(local.getItem(key)).to.equal(serialiseLayout(LAYOUT));
});

it('saves nothing anywhere while switched off', () => {
  const { store, session, local } = setup({ mode: 'off' });
  store.save(LAYOUT);
  expect(session.getItem(key)).to.equal(null);
  expect(local.getItem(key)).to.equal(null);
});

it('loads the tab’s own copy before the browser’s, so another tab’s changes never arrive here', () => {
  const local = memoryStorage();
  local.setItem(key, serialiseLayout(OTHER));
  const { store } = setup({ mode: 'persistent', local });
  store.save(LAYOUT);
  expect(store.load()).to.deep.equal(LAYOUT);
});

it('seeds a fresh tab from the browser’s copy when windows are kept between visits', () => {
  const local = memoryStorage();
  local.setItem(key, serialiseLayout(LAYOUT));
  expect(setup({ mode: 'persistent', local }).store.load()).to.deep.equal(LAYOUT);
});

it('never reads the browser’s copy unless windows are kept between visits', () => {
  const local = memoryStorage();
  local.setItem(key, serialiseLayout(LAYOUT));
  expect(setup({ mode: 'session', local }).store.load()).to.deep.equal(EMPTY);
  expect(setup({ mode: 'off', local }).store.load()).to.deep.equal(EMPTY);
});

it('loads nothing while switched off, even from the tab', () => {
  const { store, session } = setup({ mode: 'off' });
  session.setItem(key, serialiseLayout(LAYOUT));
  expect(store.load()).to.deep.equal(EMPTY);
});

it('keeps one user’s layout apart from another’s on the same browser', () => {
  const session = memoryStorage();
  const local = memoryStorage();
  setup({ user: 'user-1', mode: 'persistent', session, local }).store.save(LAYOUT);
  expect(setup({ user: 'user-2', mode: 'persistent', session, local }).store.load()).to.deep.equal(EMPTY);
});

/**
 * What changing the setting throws away: switching off forgets both copies, and going back to
 * "after a refresh" forgets the one kept between visits, so the browser holds nothing the user has
 * not asked it to keep.
 */
describe('forgetting what the mode no longer keeps', () => {
  it('forgets both copies when switched off', () => {
    const { store, session, local, setMode } = setup({ mode: 'persistent' });
    store.save(LAYOUT);
    setMode('off');
    store.forgetUnkept();
    expect(session.getItem(key)).to.equal(null);
    expect(local.getItem(key)).to.equal(null);
  });

  it('forgets only the browser’s copy when windows are kept after a refresh only', () => {
    const { store, session, local, setMode } = setup({ mode: 'persistent' });
    store.save(LAYOUT);
    setMode('session');
    store.forgetUnkept();
    expect(session.getItem(key)).to.equal(serialiseLayout(LAYOUT));
    expect(local.getItem(key)).to.equal(null);
  });

  it('forgets nothing when windows are kept between visits', () => {
    const { store, session, local } = setup({ mode: 'persistent' });
    store.save(LAYOUT);
    store.forgetUnkept();
    expect(session.getItem(key)).to.equal(serialiseLayout(LAYOUT));
    expect(local.getItem(key)).to.equal(serialiseLayout(LAYOUT));
  });
});

/** Blocked site data: the desktop still works, it just forgets its windows. */
it('carries on when the browser refuses storage', () => {
  const { store } = setup({ mode: 'persistent', session: memoryStorage(true), local: memoryStorage(true) });
  store.save(LAYOUT);
  expect(store.load()).to.deep.equal(EMPTY);
  store.forgetUnkept();
});

/**
 * Where site data is blocked, merely reading `window.localStorage` throws, before any call is made
 * on it. So the store is handed a way to reach each storage rather than the storage itself.
 */
it('carries on when reaching the storage at all throws', () => {
  const refuse = (): Storage => {
    throw new DOMException('refused', 'SecurityError');
  };
  const store = windowLayoutStore('user-1', () => 'persistent', { session: refuse, local: refuse });
  store.save(LAYOUT);
  expect(store.load()).to.deep.equal(EMPTY);
  store.forgetUnkept();
});
