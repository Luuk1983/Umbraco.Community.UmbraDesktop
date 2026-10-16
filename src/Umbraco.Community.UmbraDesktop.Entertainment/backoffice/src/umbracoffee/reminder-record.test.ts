import { expect } from '@open-wc/testing';
import { markReminded, readReminded, REMINDED_STORAGE_KEY } from './reminder-record.js';
import type { ReminderStorage } from './reminder-record.js';
import { memoryStorage } from './test-support.js';

/**
 * The record is the one part of the reminders that touches the browser, and storage is the part of a
 * browser most likely to be blocked, full or full of something else. So most of these are about it
 * failing, and the rule under test is that a failure costs a repeated reminder and never the cup.
 */

/** A storage that throws on every call, as a full or locked-down one can. */
const throwing: ReminderStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

/**
 * A source whose very lookup throws, as `window.localStorage` itself does in a browser that blocks
 * site data: the getter throws before there is a storage object to call anything on.
 * @returns Never.
 */
const blockedSource = (): ReminderStorage => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

it('reads an empty set from empty storage', () => {
  const storage = memoryStorage();
  expect([...readReminded(() => storage)]).to.deep.equal([]);
});

it('reads an empty set when there is no storage at all', () => {
  expect([...readReminded(() => undefined)]).to.deep.equal([]);
});

it('remembers a reminder once marked', () => {
  const storage = memoryStorage();
  markReminded('v1:soon', () => storage);
  expect(readReminded(() => storage).has('v1:soon')).to.equal(true);
});

it('reads junk as empty', () => {
  for (const junk of ['not json', '{"a":1}', '42', '[1,2]', 'null']) {
    const storage = memoryStorage();
    storage.setItem(REMINDED_STORAGE_KEY, junk);
    expect([...readReminded(() => storage)], junk).to.deep.equal([]);
  }
});

it('reads a throwing storage as empty, and marking in it does not throw', () => {
  expect([...readReminded(() => throwing)]).to.deep.equal([]);
  expect(() => markReminded('v1:soon', () => throwing)).to.not.throw();
});

it('survives a storage whose lookup itself throws', () => {
  expect([...readReminded(blockedSource)]).to.deep.equal([]);
  expect(() => markReminded('v1:soon', blockedSource)).to.not.throw();
});

it("defaults to this browser's localStorage, looked up when called", () => {
  const key = 'v-default-test:soon';
  const before = window.localStorage.getItem(REMINDED_STORAGE_KEY);
  try {
    markReminded(key);
    expect(readReminded().has(key)).to.equal(true);
  } finally {
    if (before === null) window.localStorage.removeItem(REMINDED_STORAGE_KEY);
    else window.localStorage.setItem(REMINDED_STORAGE_KEY, before);
  }
});

it('keeps only the newest twenty keys', () => {
  const storage = memoryStorage();
  for (let i = 0; i < 25; i++) markReminded(`v${i}:soon`, () => storage);
  const kept = readReminded(() => storage);
  expect(kept.size).to.equal(20);
  expect(kept.has('v4:soon'), 'the oldest go first').to.equal(false);
  expect(kept.has('v5:soon')).to.equal(true);
  expect(kept.has('v24:soon')).to.equal(true);
});

it('keeps one copy of a key marked twice, counted as the newest', () => {
  const storage = memoryStorage();
  markReminded('v0:soon', () => storage);
  for (let i = 1; i < 20; i++) markReminded(`v${i}:soon`, () => storage);
  markReminded('v0:soon', () => storage);
  markReminded('v20:soon', () => storage);
  const kept = readReminded(() => storage);
  expect(kept.has('v0:soon'), 're-marking moved it to the newest end').to.equal(true);
  expect(kept.has('v1:soon'), 'so the next oldest went instead').to.equal(false);
});
