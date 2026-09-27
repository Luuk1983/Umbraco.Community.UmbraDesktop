import { expect } from '@open-wc/testing';
import { browserSettingsCache } from './settings-cache';
import { UMBRADESKTOP_DEFAULT_SETTINGS, settingsStorageKey } from './settings-store';
import { UMBRADESKTOP_BOOT_HINT_KEY } from '../boot/constants';

/**
 * The browser copy of a user's settings, which stopped being the source of truth and became a cache.
 *
 * Its whole job is to be unable to fail. It is read during boot, before anything has painted, and it
 * is read on a desktop whose server is unreachable — the two moments where an exception costs the
 * most and helps the least. So every branch below is a browser refusing storage.
 */

/** A `Storage` that throws on everything, as a browser with site data blocked does. */
function refusingStorage(): Storage {
  const refuse = (): never => {
    throw new DOMException('refused', 'SecurityError');
  };

  return {
    get length(): number {
      return refuse();
    },
    clear: refuse,
    getItem: refuse,
    key: refuse,
    removeItem: refuse,
    setItem: refuse,
  };
}

/** A `Storage` over a plain object, good enough for reading and writing one key. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(seed));

  return {
    get length(): number {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

it('reads the payload stored for this user', () => {
  const storage = memoryStorage({ [settingsStorageKey('user-1')]: 'stored' });
  const cache = browserSettingsCache('user-1', storage);

  expect(cache.read()).to.equal('stored');
});

it('reads nothing for a user who has nothing stored', () => {
  const cache = browserSettingsCache('user-1', memoryStorage({ [settingsStorageKey('user-2')]: 'theirs' }));

  expect(cache.read()).to.equal(null);
});

it('writes the payload under this user key', () => {
  const storage = memoryStorage();
  const cache = browserSettingsCache('user-1', storage);

  cache.write('written');

  expect(storage.getItem(settingsStorageKey('user-1'))).to.equal('written');
});

it('writes the boot hint alongside the payload', () => {
  // The two are one thing: this browser's copy of the preference. The splash is raised from the
  // hint and the navigation is decided from the payload, so a browser holding a hint that disagrees
  // with its payload either shows a splash that lifts onto the backoffice, or boots with no splash
  // at all. Writing them anywhere but together is how they drift.
  const storage = memoryStorage();
  const cache = browserSettingsCache('user-1', storage);

  cache.write(JSON.stringify({ ...UMBRADESKTOP_DEFAULT_SETTINGS, bootIntoDesktop: true }));

  expect(storage.getItem(UMBRADESKTOP_BOOT_HINT_KEY)).to.equal('true');
});

it('writes a false boot hint for a payload that does not boot', () => {
  const storage = memoryStorage();
  const cache = browserSettingsCache('user-1', storage);

  cache.write(JSON.stringify({ ...UMBRADESKTOP_DEFAULT_SETTINGS, bootIntoDesktop: false }));

  expect(storage.getItem(UMBRADESKTOP_BOOT_HINT_KEY)).to.equal('false');
});

it('writes a false boot hint for a payload it cannot read', () => {
  // Off is the safe direction: the worst a missing splash costs is a moment of the classic
  // backoffice, while a splash raised for a boot that never happens covers a working screen.
  const storage = memoryStorage();
  const cache = browserSettingsCache('user-1', storage);

  cache.write('not json at all');

  expect(storage.getItem(UMBRADESKTOP_BOOT_HINT_KEY)).to.equal('false');
});

it('reads nothing rather than throwing when storage refuses', () => {
  const cache = browserSettingsCache('user-1', refusingStorage());

  expect(cache.read()).to.equal(null);
});

it('writes nothing rather than throwing when storage refuses', () => {
  const cache = browserSettingsCache('user-1', refusingStorage());

  expect(() => cache.write('written')).to.not.throw();
});
