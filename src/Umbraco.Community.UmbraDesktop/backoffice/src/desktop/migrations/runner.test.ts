import { expect } from '@open-wc/testing';
import { runMigrations } from './runner';
import type { UmbraDesktopMigration, UmbraDesktopMigrationLedger } from './types';

/**
 * What the runner promises, and every rule in it is one that exists because the obvious version
 * loses somebody's data or wedges the next release.
 *
 * The runner is driven with fake migrations and a fake ledger. Both are trivial, which is the point:
 * the runner knows nothing about settings, storage or Umbraco, so there is nothing to stand up.
 */

/** A ledger over an in-memory list, with the two failure modes the runner has to survive. */
interface FakeLedger extends UmbraDesktopMigrationLedger {
  /** The ids it currently holds. */
  readonly applied: string[];
  /** Make reads report the ledger as unreadable. */
  failReads(fail: boolean): void;
  /** Make records fail, as a server that accepted the work but not the record would. */
  failRecords(fail: boolean): void;
}

/**
 * A ledger holding ids in memory.
 * @param applied The ids it starts with.
 * @returns The ledger.
 */
function fakeLedger(applied: string[] = []): FakeLedger {
  let readsFail = false;
  let recordsFail = false;

  return {
    applied,
    failReads: (fail) => (readsFail = fail),
    failRecords: (fail) => (recordsFail = fail),
    async read() {
      return readsFail ? undefined : [...applied];
    },
    async record(id) {
      if (recordsFail) return false;
      applied.push(id);
      return true;
    },
  };
}

/** A migration that records that it ran, and answers however the test tells it to. */
interface FakeMigration extends UmbraDesktopMigration {
  /** How many times `run` was called. */
  readonly runs: () => number;
}

/**
 * A migration with a scripted answer.
 * @param id The migration's id.
 * @param answer What `run` resolves to, or the error it throws.
 * @param log A list every migration appends its id to, in the order they run.
 * @returns The migration.
 */
function fakeMigration(id: string, answer: boolean | Error, log: string[] = []): FakeMigration {
  let runs = 0;

  return {
    id,
    descriptionKey: `does ${id}`,
    runs: () => runs,
    async pending() {
      return true;
    },
    async run() {
      runs++;
      log.push(id);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

it('runs migrations in the order they are declared', async () => {
  const order: string[] = [];
  const migrations = [fakeMigration('a', true, order), fakeMigration('b', true, order), fakeMigration('c', true, order)];

  await runMigrations({ migrations, ledger: fakeLedger() });

  expect(order).to.eql(['a', 'b', 'c']);
});

it('skips a migration the ledger already has', async () => {
  const done = fakeMigration('a', true);
  const pending = fakeMigration('b', true);

  await runMigrations({ migrations: [done, pending], ledger: fakeLedger(['a']) });

  expect(done.runs()).to.equal(0);
  expect(pending.runs()).to.equal(1);
});

it('records a migration that did work', async () => {
  const ledger = fakeLedger();

  await runMigrations({ migrations: [fakeMigration('a', true)], ledger });

  expect(ledger.applied).to.eql(['a']);
});

it('does not record a migration that found nothing to do', async () => {
  const ledger = fakeLedger();

  await runMigrations({ migrations: [fakeMigration('a', false)], ledger });

  expect(ledger.applied).to.eql([]);
});

it('re-runs a migration that found nothing to do, on the next run', async () => {
  // The case this rule exists for: somebody signs in first on a machine that has nothing to migrate,
  // then signs in on the machine where their settings actually are. Recording the first run would
  // skip the second and lose them.
  const ledger = fakeLedger();
  const first = fakeMigration('a', false);
  await runMigrations({ migrations: [first], ledger });

  const second = fakeMigration('a', true);
  await runMigrations({ migrations: [second], ledger });

  expect(second.runs()).to.equal(1);
  expect(ledger.applied).to.eql(['a']);
});

it('reports which migrations were applied', async () => {
  const report = await runMigrations({
    migrations: [fakeMigration('a', true), fakeMigration('b', false), fakeMigration('c', true)],
    ledger: fakeLedger(),
  });

  expect(report.applied).to.eql(['a', 'c']);
});

it('stops at the first migration that throws', async () => {
  const order: string[] = [];
  const later = fakeMigration('c', true, order);

  await runMigrations({
    migrations: [fakeMigration('a', true, order), fakeMigration('b', new Error('boom'), order), later],
    ledger: fakeLedger(),
  });

  expect(order).to.eql(['a', 'b']);
  expect(later.runs()).to.equal(0);
});

it('reports the migration that threw, and what it threw', async () => {
  const boom = new Error('boom');

  const report = await runMigrations({
    migrations: [fakeMigration('a', boom)],
    ledger: fakeLedger(),
  });

  expect(report.failure?.id).to.equal('a');
  expect(report.failure?.error).to.equal(boom);
});

it('does not record a migration that threw', async () => {
  const ledger = fakeLedger();

  await runMigrations({ migrations: [fakeMigration('a', new Error('boom'))], ledger });

  expect(ledger.applied).to.eql([]);
});

it('runs nothing when the ledger cannot be read', async () => {
  const ledger = fakeLedger();
  ledger.failReads(true);
  const migration = fakeMigration('a', true);

  const report = await runMigrations({ migrations: [migration], ledger });

  expect(migration.runs()).to.equal(0);
  expect(report.ledgerUnavailable).to.equal(true);
});

it('carries on when a record fails, rather than wedging every later migration', async () => {
  // A record that fails permanently must not become a permanent block on migration 2. Migrations are
  // required to be idempotent precisely so that repeating them is cheaper than never reaching them.
  const ledger = fakeLedger();
  ledger.failRecords(true);
  const later = fakeMigration('b', true);

  const report = await runMigrations({ migrations: [fakeMigration('a', true), later], ledger });

  expect(later.runs()).to.equal(1);
  expect(report.unrecorded).to.eql(['a', 'b']);
});

it('announces each migration before running it', async () => {
  const announced: string[] = [];

  await runMigrations({
    migrations: [fakeMigration('a', true), fakeMigration('b', true)],
    ledger: fakeLedger(),
    onStart: (migration) => announced.push(migration.descriptionKey),
  });

  expect(announced).to.eql(['does a', 'does b']);
});

it('says nothing about a migration it skipped', async () => {
  const announced: string[] = [];

  await runMigrations({
    migrations: [fakeMigration('a', true), fakeMigration('b', true)],
    ledger: fakeLedger(['a']),
    onStart: (migration) => announced.push(migration.id),
  });

  expect(announced).to.eql(['b']);
});

it('reports a clean run with nothing to do', async () => {
  const report = await runMigrations({ migrations: [], ledger: fakeLedger() });

  expect(report.applied).to.eql([]);
  expect(report.unrecorded).to.eql([]);
  expect(report.failure).to.equal(undefined);
  expect(report.ledgerUnavailable).to.equal(false);
});
