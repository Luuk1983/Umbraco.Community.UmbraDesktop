import { expect } from '@open-wc/testing';
import {
  clearBootAttempt,
  hasBootAttempt,
  isBootSuppressed,
  markBootAttempt,
  readBootHint,
  suppressBootForSession,
  writeBootHint,
} from './boot-storage';

/**
 * A `Storage` stand-in, so no test depends on the real one being writable — which is the same
 * reason every function here takes its storage rather than reaching for a global.
 * @returns An in-memory storage.
 */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

/**
 * A `Storage` that throws on every access, as a browser with site data blocked does. Accessing
 * `localStorage` there raises rather than returning null, so every call has to be guarded.
 * @returns A storage that refuses everything.
 */
function hostileStorage(): Storage {
  const refuse = () => {
    throw new DOMException('denied');
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
  } as unknown as Storage;
}

it('defaults the boot hint to false when nothing was ever written', () => {
  expect(readBootHint(fakeStorage())).to.equal(false);
});

it('round-trips the boot hint', () => {
  const store = fakeStorage();
  writeBootHint(true, store);
  expect(readBootHint(store)).to.equal(true);
  writeBootHint(false, store);
  expect(readBootHint(store)).to.equal(false);
});

it('marks and clears a boot attempt', () => {
  const store = fakeStorage();
  expect(hasBootAttempt(store)).to.equal(false);
  markBootAttempt(store);
  expect(hasBootAttempt(store)).to.equal(true);
  clearBootAttempt(store);
  expect(hasBootAttempt(store)).to.equal(false);
});

it('suppresses the boot for the session', () => {
  const store = fakeStorage();
  expect(isBootSuppressed(store)).to.equal(false);
  suppressBootForSession(store);
  expect(isBootSuppressed(store)).to.equal(true);
});

it('keeps the hint, the marker and the suppression in separate keys', () => {
  // They have different lifetimes — a browser-long hint, a single-boot marker and a tab-long
  // suppression — so a shared key would make one of them undo another.
  const store = fakeStorage();
  writeBootHint(true, store);
  markBootAttempt(store);
  suppressBootForSession(store);
  clearBootAttempt(store);
  expect(readBootHint(store)).to.equal(true);
  expect(isBootSuppressed(store)).to.equal(true);
  expect(hasBootAttempt(store)).to.equal(false);
});

it('treats storage that refuses everything as "nothing stored" rather than throwing', () => {
  // The whole point: a browser with site data blocked degrades to a boot that is simply off,
  // rather than an exception thrown out of the bundle module during boot.
  const store = hostileStorage();
  expect(() => writeBootHint(true, store)).to.not.throw();
  expect(() => markBootAttempt(store)).to.not.throw();
  expect(() => clearBootAttempt(store)).to.not.throw();
  expect(() => suppressBootForSession(store)).to.not.throw();
  expect(readBootHint(store)).to.equal(false);
  expect(hasBootAttempt(store)).to.equal(false);
  expect(isBootSuppressed(store)).to.equal(false);
});
