import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER, UmbraDesktopStoredMigrationLedger } from './ledger';
import { fakeStore } from './fake-store.test-helper';
import type { UmbraDesktopFakeStore } from './fake-store.test-helper';
import type { UmbraDesktopMigrationStore } from './types';

/**
 * The ledger's own behaviour, which is mostly about what it does with a payload it cannot read.
 *
 * A ledger that throws on a malformed value would take the desktop down over a corrupt row, and a
 * ledger that treated an unreachable server as "nothing applied" would re-run every migration on
 * every load with no way to record any of them. Those two are the tests that matter here; the rest
 * is bookkeeping.
 */

/**
 * What the store holds for the ledger, as a parsed payload.
 * @param store The store to read.
 * @returns The decoded ledger document.
 */
function storedLedger(store: UmbraDesktopFakeStore): { v: number; applied: string[] } {
  return JSON.parse(store.values.get(UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER)!);
}

/**
 * The identifiers a store was asked for, for the one test that cares.
 * @param store The store to wrap.
 * @param seen The list to append to.
 * @returns A store that records what it was asked for.
 */
function recording(store: UmbraDesktopMigrationStore, seen: string[]): UmbraDesktopMigrationStore {
  return {
    read: (identifier) => {
      seen.push(identifier);
      return store.read(identifier);
    },
    write: (identifier, value) => {
      seen.push(identifier);
      return store.write(identifier, value);
    },
  };
}

it('reads the ids a stored ledger holds', async () => {
  const ledger = new UmbraDesktopStoredMigrationLedger(fakeStore({ [UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER]: '{"v":1,"applied":["a","b"]}' }));

  expect(await ledger.read()).to.eql(['a', 'b']);
});

it('reads nothing applied when no ledger is stored', async () => {
  const ledger = new UmbraDesktopStoredMigrationLedger(fakeStore());

  expect(await ledger.read()).to.eql([]);
});

it('reports the ledger as unreadable when the store failed', async () => {
  const store = fakeStore({ [UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER]: '{"v":1,"applied":["a"]}' });
  store.failReads(true);
  const ledger = new UmbraDesktopStoredMigrationLedger(store);

  expect(await ledger.read()).to.equal(undefined);
});

it('reads nothing applied from a payload that is not JSON', async () => {
  const ledger = new UmbraDesktopStoredMigrationLedger(fakeStore({ [UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER]: 'not json at all' }));

  expect(await ledger.read()).to.eql([]);
});

it('reads nothing applied from a payload of the wrong shape', async () => {
  const ledger = new UmbraDesktopStoredMigrationLedger(fakeStore({ [UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER]: '{"v":1,"applied":"a"}' }));

  expect(await ledger.read()).to.eql([]);
});

it('ignores entries that are not ids', async () => {
  const ledger = new UmbraDesktopStoredMigrationLedger(fakeStore({ [UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER]: '{"v":1,"applied":["a",7,null,"b"]}' }));

  expect(await ledger.read()).to.eql(['a', 'b']);
});

it('reads nothing applied from a version it does not understand', async () => {
  // Same reasoning as the settings payload: a ledger written by a later build is not something to
  // guess at. Reading it as empty re-runs idempotent migrations, which is the safe direction.
  const ledger = new UmbraDesktopStoredMigrationLedger(fakeStore({ [UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER]: '{"v":2,"applied":["a"]}' }));

  expect(await ledger.read()).to.eql([]);
});

it('reports itself unreadable rather than rejecting when the store throws', async () => {
  // A ledger that rejected would take the whole load down with it, and the load has no catch. The
  // store's contract is to report failure, and this is where that contract stops being assumed.
  const ledger = new UmbraDesktopStoredMigrationLedger({
    read: async () => Promise.reject(new Error('boom')),
    write: async () => Promise.reject(new Error('boom')),
  });

  expect(await ledger.read()).to.equal(undefined);
});

it('reports a record as failed rather than rejecting when the store throws', async () => {
  // Worse than the read: a rejecting record escapes from inside the migration screen, which has no
  // dismiss button while it is running, so the person is left behind a screen with no way out.
  const ledger = new UmbraDesktopStoredMigrationLedger({
    read: async () => null,
    write: async () => Promise.reject(new Error('boom')),
  });

  expect(await ledger.record('a')).to.equal(false);
});

it('records an id', async () => {
  const store = fakeStore();
  const ledger = new UmbraDesktopStoredMigrationLedger(store);

  expect(await ledger.record('a')).to.equal(true);
  expect(storedLedger(store)).to.eql({ v: 1, applied: ['a'] });
});

it('keeps the ids already recorded', async () => {
  const store = fakeStore({ [UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER]: '{"v":1,"applied":["a"]}' });
  const ledger = new UmbraDesktopStoredMigrationLedger(store);

  await ledger.record('b');

  expect(storedLedger(store).applied).to.eql(['a', 'b']);
});

it('does not record the same id twice', async () => {
  const store = fakeStore({ [UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER]: '{"v":1,"applied":["a"]}' });
  const ledger = new UmbraDesktopStoredMigrationLedger(store);

  await ledger.record('a');

  expect(storedLedger(store).applied).to.eql(['a']);
});

it('reports a record the store refused', async () => {
  const store = fakeStore();
  store.failWrites(true);
  const ledger = new UmbraDesktopStoredMigrationLedger(store);

  expect(await ledger.record('a')).to.equal(false);
});

it('does not lose a refused record from what it will write next', async () => {
  const store = fakeStore();
  const ledger = new UmbraDesktopStoredMigrationLedger(store);
  store.failWrites(true);
  await ledger.record('a');

  store.failWrites(false);
  await ledger.record('b');

  expect(storedLedger(store).applied).to.eql(['a', 'b']);
});

it('stores the ledger under its own identifier', async () => {
  const seen: string[] = [];
  const ledger = new UmbraDesktopStoredMigrationLedger(recording(fakeStore(), seen));

  await ledger.record('a');

  expect(seen.every((identifier) => identifier === 'migrations')).to.equal(true);
});
