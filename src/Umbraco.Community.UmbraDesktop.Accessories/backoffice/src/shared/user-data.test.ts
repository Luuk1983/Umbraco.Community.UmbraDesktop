import { expect } from '@open-wc/testing';
import { UserDataDocument } from './user-data.js';
import type { UserDataClient, UserDataRow } from './user-data.js';

/**
 * One document per user in Umbraco's `umbracoUserData`, which is how this package keeps what
 * belongs to a person rather than to the site: their screensaver, their own sticky notes.
 *
 * The store enforces no uniqueness on group and identifier, so the rules that matter are about
 * never making a second row, and about telling "nothing stored yet" from "could not ask".
 */

/** An in-memory stand-in for the four `user-data` endpoints, with a switch to make them fail. */
function fakeClient(rows: UserDataRow[] = []) {
  const state = { rows: [...rows], failing: false, calls: [] as string[] };
  const client: UserDataClient = {
    async readGroup(group) {
      state.calls.push(`read:${group}`);
      return state.failing ? undefined : state.rows.filter((row) => row.group === group).map((row) => ({ ...row }));
    },
    async create(row) {
      state.calls.push(`create:${row.key}`);
      if (state.failing) return false;
      state.rows.push({ ...row });
      return true;
    },
    async update(row) {
      state.calls.push(`update:${row.key}`);
      if (state.failing) return false;
      const index = state.rows.findIndex((existing) => existing.key === row.key);
      if (index < 0) return false;
      state.rows[index] = { ...row };
      return true;
    },
    async remove(key) {
      state.calls.push(`remove:${key}`);
      if (state.failing) return false;
      state.rows = state.rows.filter((row) => row.key !== key);
      return true;
    },
  };
  return { client, state };
}

const GROUP = 'Umbraco.Community.UmbraDesktop.Accessories';

/** A row of this package's group. */
const row = (key: string, identifier: string, value: string): UserDataRow => ({ key, group: GROUP, identifier, value });

it('reads null, not a failure, when nothing is stored yet', async () => {
  const { client } = fakeClient();
  expect(await new UserDataDocument(client, GROUP, 'Settings').read()).to.equal(null);
});

it('reads undefined when the server could not be asked', async () => {
  const { client, state } = fakeClient([row('k1', 'Settings', '{}')]);
  state.failing = true;
  expect(await new UserDataDocument(client, GROUP, 'Settings').read()).to.equal(undefined);
});

it('reads only its own identifier within the group', async () => {
  const { client } = fakeClient([row('k1', 'StickyNotes', '[1]'), row('k2', 'Settings', '{"a":1}')]);
  expect(await new UserDataDocument(client, GROUP, 'Settings').read()).to.equal('{"a":1}');
});

it('creates the row on the first write and updates that same row afterwards', async () => {
  const { client, state } = fakeClient();
  const document = new UserDataDocument(client, GROUP, 'Settings', () => 'new-key');
  expect(await document.write('one')).to.equal(true);
  expect(await document.write('two')).to.equal(true);
  expect(state.rows).to.deep.equal([row('new-key', 'Settings', 'two')]);
  expect(state.calls.filter((call) => call.startsWith('create'))).to.have.length(1);
});

it('updates a row it found by reading instead of creating a second one', async () => {
  const { client, state } = fakeClient([row('k1', 'Settings', 'old')]);
  const document = new UserDataDocument(client, GROUP, 'Settings', () => 'never');
  await document.read();
  await document.write('new');
  expect(state.rows).to.deep.equal([row('k1', 'Settings', 'new')]);
});

it('looks before its first write, so a row made in another browser is updated, not duplicated', async () => {
  const { client, state } = fakeClient([row('elsewhere', 'Settings', 'old')]);
  await new UserDataDocument(client, GROUP, 'Settings', () => 'never').write('new');
  expect(state.rows).to.deep.equal([row('elsewhere', 'Settings', 'new')]);
});

it('keeps one row when duplicates exist, and removes the rest on the next write', async () => {
  const { client, state } = fakeClient([row('b', 'Settings', 'second'), row('a', 'Settings', 'first')]);
  const document = new UserDataDocument(client, GROUP, 'Settings');
  // The lowest key wins, so every browser that finds the same duplicates settles on the same row.
  expect(await document.read()).to.equal('first');
  await document.write('merged');
  expect(state.rows).to.deep.equal([row('a', 'Settings', 'merged')]);
});

it('reports a failed write, and does not create a row when it could not look first', async () => {
  const { client, state } = fakeClient();
  state.failing = true;
  expect(await new UserDataDocument(client, GROUP, 'Settings').write('x')).to.equal(false);
  expect(state.calls.some((call) => call.startsWith('create'))).to.equal(false);
});

it('creates again when the row it knew was deleted meanwhile', async () => {
  const { client, state } = fakeClient([row('k1', 'Settings', 'old')]);
  let next = 0;
  const document = new UserDataDocument(client, GROUP, 'Settings', () => `fresh-${++next}`);
  await document.read();
  state.rows = [];
  expect(await document.write('again')).to.equal(true);
  expect(state.rows).to.deep.equal([row('fresh-1', 'Settings', 'again')]);
});
