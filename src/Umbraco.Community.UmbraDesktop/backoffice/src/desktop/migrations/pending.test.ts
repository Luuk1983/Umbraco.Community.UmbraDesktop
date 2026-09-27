import { expect } from '@open-wc/testing';
import { pendingMigrations } from './pending';
import type { UmbraDesktopMigration, UmbraDesktopMigrationLedger } from './types';

/**
 * The look-ahead that decides whether a migration screen appears at all.
 *
 * Every rule here is about not putting a screen in somebody's way for nothing. It is asked before
 * anything has run, so being wrong costs a screen shown or withheld — never data, because the runner
 * does not consult it and each migration decides for itself whether to act.
 *
 * Which is why the last test matters most: a look-ahead that threw would take the desktop down over
 * a question whose answer is cosmetic.
 */

/**
 * A ledger over a fixed list.
 * @param applied The ids it holds, or undefined to report itself unreadable.
 * @returns The ledger.
 */
function fakeLedger(applied: string[] = []): UmbraDesktopMigrationLedger {
  return {
    async read() {
      return [...applied];
    },
    async record() {
      return true;
    },
  };
}

/**
 * A ledger that cannot be read, as an unreachable server gives.
 * @returns The ledger.
 */
function unreadableLedger(): UmbraDesktopMigrationLedger {
  return {
    async read() {
      return undefined;
    },
    async record() {
      return false;
    },
  };
}

/**
 * A migration with a scripted look-ahead.
 * @param id The migration's id.
 * @param pending What `pending` resolves to, or the error it throws.
 * @returns The migration.
 */
function fakeMigration(id: string, pending: boolean | Error): UmbraDesktopMigration {
  return {
    id,
    descriptionKey: `does ${id}`,
    async pending() {
      if (pending instanceof Error) throw pending;
      return pending;
    },
    async run() {
      return true;
    },
  };
}

/**
 * The ids a look-ahead returned.
 * @param migrations The migrations it returned.
 * @returns Their ids.
 */
function idsOf(migrations: readonly UmbraDesktopMigration[]): string[] {
  return migrations.map((migration) => migration.id);
}

it('reports nothing when no migration has work', async () => {
  const pending = await pendingMigrations([fakeMigration('a', false)], fakeLedger());

  expect(pending).to.eql([]);
});

it('reports a migration that has work', async () => {
  const pending = await pendingMigrations([fakeMigration('a', true)], fakeLedger());

  expect(idsOf(pending)).to.eql(['a']);
});

it('ignores a migration the ledger already has', async () => {
  const pending = await pendingMigrations(
    [fakeMigration('a', true), fakeMigration('b', true)],
    fakeLedger(['a']),
  );

  expect(idsOf(pending)).to.eql(['b']);
});

it('keeps them in the order they are declared', async () => {
  const pending = await pendingMigrations(
    [fakeMigration('a', true), fakeMigration('b', false), fakeMigration('c', true)],
    fakeLedger(),
  );

  expect(idsOf(pending)).to.eql(['a', 'c']);
});

it('reports nothing when the ledger cannot be read', async () => {
  // Nothing will run in that state, so nothing is pending. A screen announcing work that is not
  // about to happen would be worse than no screen.
  const pending = await pendingMigrations([fakeMigration('a', true)], unreadableLedger());

  expect(pending).to.eql([]);
});

it('treats a look-ahead that throws as nothing to do', async () => {
  const pending = await pendingMigrations(
    [fakeMigration('a', new Error('boom')), fakeMigration('b', true)],
    fakeLedger(),
  );

  expect(idsOf(pending)).to.eql(['b']);
});
