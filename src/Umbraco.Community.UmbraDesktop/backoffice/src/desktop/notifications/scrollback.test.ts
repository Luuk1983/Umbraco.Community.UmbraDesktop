import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_SCROLLBACK_SIZE,
  attentionCount,
  readScrollback,
  recordNotification,
  writeScrollback,
} from './scrollback.js';
import type { UmbraDesktopNotification, UmbraDesktopScrollbackEntry } from './types.js';

/**
 * A notification as the reader hands it over.
 * @param message Its text.
 * @param color Its severity.
 * @param extra Anything else to set.
 * @returns The notification.
 */
function note(
  message: string,
  color: UmbraDesktopNotification['color'] = 'default',
  extra: Partial<UmbraDesktopNotification> = {},
): UmbraDesktopNotification {
  return { key: `${message}-${Math.random()}`, color, duration: 6000, message, ...extra };
}

const windowA = { sourceId: 'w-a', source: 'Content' };
const windowB = { sourceId: 'w-b', source: 'Media' };

it('records a notification as an entry saying who raised it, what it says and when', () => {
  const entries = recordNotification([], note('Saved', 'positive', { headline: 'Document' }), windowA, 1000);

  expect(entries).to.have.length(1);
  expect(entries[0]).to.deep.include({
    color: 'positive',
    headline: 'Document',
    message: 'Saved',
    count: 1,
    lastSeen: 1000,
    source: 'Content',
    sourceId: 'w-a',
  });
});

it('folds a repeat into the entry it repeats, from whichever window it came', () => {
  let entries = recordNotification([], note('License invalid', 'warning'), windowA, 1000);
  entries = recordNotification(entries, note('License invalid', 'warning'), windowB, 2000);

  expect(entries, 'the same message from two windows is one entry').to.have.length(1);
  expect(entries[0].count).to.equal(2);
  expect(entries[0].lastSeen).to.equal(2000);
  expect(entries[0].sourceId, 'the entry points at the window that raised it last').to.equal('w-b');
  expect(entries[0].source).to.equal('Media');
});

it('does not fold two messages that differ in severity or headline', () => {
  let entries = recordNotification([], note('Done', 'positive'), windowA, 1);
  entries = recordNotification(entries, note('Done', 'warning'), windowA, 2);
  entries = recordNotification(entries, note('Done', 'positive', { headline: 'Other' }), windowA, 3);
  expect(entries).to.have.length(3);
});

it('moves a repeat to the top, newest first', () => {
  let entries = recordNotification([], note('One'), windowA, 1);
  entries = recordNotification(entries, note('Two'), windowA, 2);
  entries = recordNotification(entries, note('One'), windowA, 3);
  expect(entries.map((e) => e.message)).to.deep.equal(['One', 'Two']);
});

it('holds the twenty most recent entries and lets the oldest roll off', () => {
  let entries: UmbraDesktopScrollbackEntry[] = [];
  for (let i = 0; i < UMBRADESKTOP_SCROLLBACK_SIZE + 5; i++) {
    entries = recordNotification(entries, note(`Message ${i}`), windowA, i);
  }
  expect(UMBRADESKTOP_SCROLLBACK_SIZE).to.equal(20);
  expect(entries).to.have.length(20);
  expect(entries[0].message).to.equal('Message 24');
  expect(entries[entries.length - 1].message).to.equal('Message 5');
});

it('lets one recurring message take a single slot however often it arrives', () => {
  let entries: UmbraDesktopScrollbackEntry[] = [];
  for (let i = 0; i < 19; i++) entries = recordNotification(entries, note(`Other ${i}`), windowA, i);
  for (let i = 0; i < 50; i++) entries = recordNotification(entries, note('Recurring', 'warning'), windowA, 100 + i);
  expect(entries, 'nineteen others plus the one recurring entry').to.have.length(20);
  expect(entries[0].count).to.equal(50);
});

it('counts the distinct warning and error entries held, and nothing else', () => {
  let entries = recordNotification([], note('Saved', 'positive'), windowA, 1);
  entries = recordNotification(entries, note('Info'), windowA, 2);
  entries = recordNotification(entries, note('License', 'warning'), windowA, 3);
  entries = recordNotification(entries, note('License', 'warning'), windowB, 4);
  entries = recordNotification(entries, note('Failed', 'danger'), windowA, 5);
  expect(attentionCount(entries), 'a repeat is one entry, so it counts once').to.equal(2);
});

it('lets the count fall as warnings roll off', () => {
  let entries = recordNotification([], note('Old warning', 'warning'), windowA, 0);
  expect(attentionCount(entries)).to.equal(1);
  for (let i = 0; i < UMBRADESKTOP_SCROLLBACK_SIZE; i++) {
    entries = recordNotification(entries, note(`Fine ${i}`, 'positive'), windowA, i + 1);
  }
  expect(attentionCount(entries)).to.equal(0);
});

it('round-trips through storage, which is how it survives a reload', () => {
  const store = window.sessionStorage;
  store.clear();
  const entries = recordNotification(
    [],
    note('Could not save', 'danger', { element: { name: 'umb-peek-error-notification', data: { message: 'x' } } }),
    windowA,
    5,
  );

  writeScrollback(store, entries);

  expect(readScrollback(store)).to.deep.equal(entries);
  store.clear();
});

it('reads missing or corrupt storage as an empty scrollback', () => {
  const store = window.sessionStorage;
  store.clear();
  expect(readScrollback(store)).to.deep.equal([]);
  store.setItem('umbradesktop.notifications', '{not json');
  expect(readScrollback(store)).to.deep.equal([]);
  store.setItem('umbradesktop.notifications', JSON.stringify({ not: 'a list' }));
  expect(readScrollback(store)).to.deep.equal([]);
  store.setItem('umbradesktop.notifications', JSON.stringify([{ message: 'no count' }, 7]));
  expect(readScrollback(store), 'rows without the shape of an entry are dropped').to.deep.equal([]);
  store.clear();
});
