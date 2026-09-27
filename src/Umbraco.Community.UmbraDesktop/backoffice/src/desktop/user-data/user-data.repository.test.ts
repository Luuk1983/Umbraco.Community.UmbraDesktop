import { expect } from '@open-wc/testing';
import { UmbraDesktopUserDataRepository } from './user-data.repository';
import type { UmbraDesktopUserDataClient, UmbraDesktopUserDataRow } from './types';

/**
 * The save contract from the design doc §2.2, which exists because Umbraco's `user-data` table has
 * no uniqueness constraint on (user, group, identifier) and a POST without a key always succeeds.
 * Every branch below is a way a naive "save" silently corrupts the store: a second row nobody reads,
 * a write that lands on a different row than the read, or a write attempted while we cannot see what
 * is already there.
 *
 * The repository is driven through a fake client rather than the generated SDK. What is under test
 * is the contract, not `tryExecute`.
 */

/** Calls the fake client received, in order, so a test can assert on requests as well as results. */
interface RecordedCall {
  /** Which operation. */
  op: 'readGroup' | 'create' | 'update' | 'remove';
  /** The row or key involved, where there is one. */
  row?: UmbraDesktopUserDataRow;
}

/** A fake client with a controllable store, standing in for the management API. */
interface FakeClient extends UmbraDesktopUserDataClient {
  /** Everything asked of it, in order. */
  readonly calls: RecordedCall[];
  /** The rows it currently holds. */
  readonly rows: UmbraDesktopUserDataRow[];
  /** Make the next read fail, as an unreachable server would. */
  failReads(fail: boolean): void;
  /** Make every write fail, as a refused request would. */
  failWrites(fail: boolean): void;
}

/** The group every test uses. Its actual value is irrelevant here; that it is passed through is not. */
const GROUP = 'test.group';

/**
 * A fake client holding rows in memory.
 * @param rows The rows it starts with.
 * @returns The client, with its recorded calls.
 */
function fakeClient(rows: UmbraDesktopUserDataRow[] = []): FakeClient {
  const calls: RecordedCall[] = [];
  let readsFail = false;
  let writesFail = false;

  return {
    calls,
    rows,
    failReads: (fail) => (readsFail = fail),
    failWrites: (fail) => (writesFail = fail),

    async readGroup(group) {
      calls.push({ op: 'readGroup' });
      if (readsFail) return undefined;
      return rows.filter((row) => row.group === group).map((row) => ({ ...row }));
    },

    async create(row) {
      calls.push({ op: 'create', row: { ...row } });
      if (writesFail) return false;
      rows.push({ ...row });
      return true;
    },

    async update(row) {
      calls.push({ op: 'update', row: { ...row } });
      if (writesFail) return false;
      const existing = rows.find((candidate) => candidate.key === row.key);
      if (!existing) return false;
      existing.value = row.value;
      return true;
    },

    async remove(key) {
      calls.push({ op: 'remove', row: rows.find((row) => row.key === key) });
      if (writesFail) return false;
      const at = rows.findIndex((row) => row.key === key);
      if (at < 0) return false;
      rows.splice(at, 1);
      return true;
    },
  };
}

/**
 * One row, with the fields a test cares about.
 * @param identifier The row's identifier.
 * @param value The row's value.
 * @param key The row's key. Defaults to one derived from the identifier.
 * @returns The row.
 */
function row(identifier: string, value: string, key = `key-${identifier}`): UmbraDesktopUserDataRow {
  return { key, group: GROUP, identifier, value };
}

/**
 * How many times the client was asked for the group.
 * @param client The client to count.
 * @returns The number of reads.
 */
function reads(client: FakeClient): number {
  return client.calls.filter((call) => call.op === 'readGroup').length;
}

/**
 * A client whose every method rejects, as one throwing rather than reporting failure would.
 * @returns The client.
 */
function rejectingClient(): UmbraDesktopUserDataClient {
  const boom = (): never => {
    throw new Error('boom');
  };

  return { readGroup: boom, create: boom, update: boom, remove: boom };
}

it('reads nothing rather than rejecting when the client throws', async () => {
  // The port's contract is to *report* failure, not to throw it, and the implementation behind it is
  // Umbraco's generated client. A rejection here escapes all the way to the settings context, whose
  // load has no catch, and the desktop then never paints at all.
  const repository = new UmbraDesktopUserDataRepository(GROUP, rejectingClient());

  expect(await repository.read('settings')).to.equal(undefined);
});

it('refuses the write rather than rejecting when the client throws', async () => {
  const repository = new UmbraDesktopUserDataRepository(GROUP, rejectingClient());

  expect(await repository.write('settings', 'anything')).to.equal(false);
});

it('retries after a client that threw, rather than remembering the throw', async () => {
  // The point is the *second* read. A failure must not be memoised as an answer, or one bad request
  // leaves the session convinced the account holds nothing.
  const client = fakeClient([row('settings', 'stored')]);
  let reads = 0;
  const flaky: UmbraDesktopUserDataClient = {
    ...client,
    readGroup: async (group) => {
      reads++;
      if (reads === 1) throw new Error('boom');
      return client.readGroup(group);
    },
  };
  const repository = new UmbraDesktopUserDataRepository(GROUP, flaky);

  expect(await repository.read('settings')).to.equal(undefined);
  expect(await repository.read('settings')).to.equal('stored');
});

it('makes one row when two writes to the same identifier overlap', async () => {
  // The settings context does not await `#persist`, so two clicks inside one round trip put two
  // writes in flight. Both would see no existing row, both would create one with a key of their own,
  // and core has nothing to stop either: its duplicate check is by row key, and the index on
  // (user, group, identifier) is not unique. The second payload then becomes the one nobody reads,
  // and the next save deletes it as a duplicate.
  const client = fakeClient();
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  await Promise.all([repository.write('settings', 'first'), repository.write('settings', 'second')]);

  expect(client.rows.filter((row) => row.identifier === 'settings')).to.have.lengthOf(1);
});

it('lets the last of two overlapping writes win', async () => {
  const client = fakeClient();
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  await Promise.all([repository.write('settings', 'first'), repository.write('settings', 'second')]);

  expect(await repository.read('settings')).to.equal('second');
});

it('does not let a write that threw block every write after it', async () => {
  // Writes are queued, so a rejection that escaped into the queue would stall every later save for
  // the rest of the session, silently.
  const client = fakeClient();
  let creates = 0;
  const flaky: UmbraDesktopUserDataClient = {
    ...client,
    create: async (row) => {
      creates++;
      if (creates === 1) throw new Error('boom');
      return client.create(row);
    },
  };
  const repository = new UmbraDesktopUserDataRepository(GROUP, flaky);

  expect(await repository.write('settings', 'refused')).to.equal(false);
  expect(await repository.write('settings', 'accepted')).to.equal(true);
  expect(await repository.read('settings')).to.equal('accepted');
});

it('drops a queued write once it has been abandoned', async () => {
  // The queue makes this reachable: a save for the user who just signed out can still be waiting
  // when the next one signs in, and the request would then carry the new user's token. Core's PUT
  // has no ownership check, so it would re-home the old user's row to the new one — they lose their
  // settings and the new user silently inherits them.
  const client = fakeClient();
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  const queued = repository.write('settings', 'theirs');
  repository.abandon();

  expect(await queued).to.equal(false);
  expect(client.rows).to.have.lengthOf(0);
});

it('refuses a write made after it was abandoned', async () => {
  const client = fakeClient();
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  repository.abandon();

  expect(await repository.write('settings', 'theirs')).to.equal(false);
  expect(client.rows).to.have.lengthOf(0);
});

it('reads the whole group once however many identifiers are asked for', async () => {
  const client = fakeClient([row('settings', '{"a":1}'), row('migrations', '{"b":2}')]);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  await repository.read('settings');
  await repository.read('migrations');
  await repository.read('settings');

  expect(reads(client)).to.equal(1);
});

it('reads the group once when two consumers ask at the same time', async () => {
  const client = fakeClient([row('settings', '{"a":1}'), row('migrations', '{"b":2}')]);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  // The migration runner and the settings context both ask during the same load, and neither waits
  // for the other. Without an in-flight read to join, that is two round trips for one answer.
  const [settings, migrations] = await Promise.all([repository.read('settings'), repository.read('migrations')]);

  expect(settings).to.equal('{"a":1}');
  expect(migrations).to.equal('{"b":2}');
  expect(reads(client)).to.equal(1);
});

it('returns the stored value for an identifier that has a row', async () => {
  const client = fakeClient([row('settings', '{"a":1}')]);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  expect(await repository.read('settings')).to.equal('{"a":1}');
});

it('returns null for an identifier with no row', async () => {
  const client = fakeClient([row('settings', '{"a":1}')]);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  expect(await repository.read('migrations')).to.equal(null);
});

it('distinguishes a failed read from an absent row', async () => {
  const client = fakeClient();
  client.failReads(true);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  expect(await repository.read('settings')).to.equal(undefined);
});

it('retries a read that failed rather than remembering the failure', async () => {
  const client = fakeClient([row('settings', 'stored')]);
  client.failReads(true);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  await repository.read('settings');
  client.failReads(false);

  expect(await repository.read('settings')).to.equal('stored');
  expect(reads(client)).to.equal(2);
});

it('creates a row when the identifier has none', async () => {
  const client = fakeClient();
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  expect(await repository.write('settings', 'first')).to.equal(true);
  expect(client.rows).to.have.lengthOf(1);
  expect(client.rows[0].identifier).to.equal('settings');
  expect(client.rows[0].value).to.equal('first');
  expect(client.rows[0].group).to.equal(GROUP);
});

it('creates the row with a key of its own, since a keyless POST always succeeds', async () => {
  const client = fakeClient();
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  await repository.write('settings', 'first');

  expect(client.rows[0].key).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

it('updates the row it just created rather than creating a second one', async () => {
  const client = fakeClient();
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  await repository.write('settings', 'first');
  await repository.write('settings', 'second');

  expect(client.rows).to.have.lengthOf(1);
  expect(client.rows[0].value).to.equal('second');
  expect(client.calls.filter((call) => call.op === 'create')).to.have.lengthOf(1);
});

it('updates an existing row in place', async () => {
  const client = fakeClient([row('settings', 'stored')]);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  expect(await repository.write('settings', 'changed')).to.equal(true);
  expect(client.rows).to.have.lengthOf(1);
  expect(client.rows[0].key).to.equal('key-settings');
  expect(client.rows[0].value).to.equal('changed');
});

it('keeps the first of several duplicate rows and deletes the rest', async () => {
  const client = fakeClient([
    row('settings', 'one', 'key-one'),
    row('settings', 'two', 'key-two'),
    row('settings', 'three', 'key-three'),
  ]);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  expect(await repository.write('settings', 'winner')).to.equal(true);
  expect(client.rows).to.have.lengthOf(1);
  expect(client.rows[0].key).to.equal('key-one');
  expect(client.rows[0].value).to.equal('winner');
});

it('reads back the surviving row after duplicates were cleaned up', async () => {
  const client = fakeClient([row('settings', 'one', 'key-one'), row('settings', 'two', 'key-two')]);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  await repository.write('settings', 'winner');

  expect(await repository.read('settings')).to.equal('winner');
});

it('refuses to write when the group could not be read', async () => {
  const client = fakeClient();
  client.failReads(true);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  expect(await repository.write('settings', 'anything')).to.equal(false);
  expect(client.calls.some((call) => call.op === 'create')).to.equal(false);
});

it('reports a write the server refused', async () => {
  const client = fakeClient();
  client.failWrites(true);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  expect(await repository.write('settings', 'anything')).to.equal(false);
});

it('does not remember a value the server refused to store', async () => {
  const client = fakeClient([row('settings', 'stored')]);
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);
  client.failWrites(true);

  await repository.write('settings', 'rejected');

  expect(await repository.read('settings')).to.equal('stored');
});

it('serves a written value without reading the group again', async () => {
  const client = fakeClient();
  const repository = new UmbraDesktopUserDataRepository(GROUP, client);

  await repository.write('settings', 'first');
  const before = reads(client);

  expect(await repository.read('settings')).to.equal('first');
  expect(reads(client)).to.equal(before);
});
