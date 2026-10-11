import { expect } from '@open-wc/testing';
import { UmbraDesktopUserDataDocument } from './user-data-document.js';
import { fakeUserDataServer } from './fake-user-data-server.test-helper.js';
import type { UmbraDesktopUserDataRow } from '../../user-data/types.js';

/**
 * One package's settings row in Umbraco's `umbracoUserData`, ported from Accessories' own document
 * with its rules (design §5). The table enforces no uniqueness on group and identifier, so the rules
 * that matter are about never making a second row, and about telling "nothing stored yet" from
 * "could not ask".
 */

/** The group every case uses. Its value is irrelevant; that it is passed through is not. */
const GROUP = 'Pkg.Group';

/**
 * A row of the test group.
 * @param key The row's key.
 * @param identifier The row's identifier.
 * @param value The stored value.
 * @returns The row.
 */
const row = (key: string, identifier: string, value: string): UmbraDesktopUserDataRow => ({ key, group: GROUP, identifier, value });

it('reads null, not a failure, when nothing is stored yet', async () => {
  const { client } = fakeUserDataServer();
  expect(await new UmbraDesktopUserDataDocument(client, GROUP, 'Settings').read()).to.equal(null);
});

it('reads undefined when the server could not be asked', async () => {
  const server = fakeUserDataServer([row('k1', 'Settings', '{}')]);
  server.failing = true;
  expect(await new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings').read()).to.equal(undefined);
});

it('reads only its own identifier within the group', async () => {
  const { client } = fakeUserDataServer([row('k1', 'Other', '[1]'), row('k2', 'Settings', '{"a":1}')]);
  expect(await new UmbraDesktopUserDataDocument(client, GROUP, 'Settings').read()).to.equal('{"a":1}');
});

it('creates the row on the first write and updates that same row afterwards', async () => {
  const server = fakeUserDataServer();
  const document = new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings', () => 'new-key');
  expect(await document.write('one')).to.equal(true);
  expect(await document.write('two')).to.equal(true);
  expect(server.rows).to.deep.equal([row('new-key', 'Settings', 'two')]);
  expect(server.calls.filter((call) => call.startsWith('create'))).to.have.length(1);
});

it('updates a row it found by reading instead of creating a second one', async () => {
  const server = fakeUserDataServer([row('k1', 'Settings', 'old')]);
  const document = new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings', () => 'never');
  await document.read();
  await document.write('new');
  expect(server.rows).to.deep.equal([row('k1', 'Settings', 'new')]);
});

it('looks before its first write, so a row made in another browser is updated, not duplicated', async () => {
  const server = fakeUserDataServer([row('elsewhere', 'Settings', 'old')]);
  await new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings', () => 'never').write('new');
  expect(server.rows).to.deep.equal([row('elsewhere', 'Settings', 'new')]);
});

it('looks again before writing when it knows no row, so a row made since is updated, not duplicated', async () => {
  // What another tab or browser does between this document's read and its write.
  const server = fakeUserDataServer();
  const document = new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings', () => 'never');
  expect(await document.read()).to.equal(null);
  server.rows.push(row('elsewhere', 'Settings', 'old'));
  await document.write('new');
  expect(server.rows).to.deep.equal([row('elsewhere', 'Settings', 'new')]);
});

it('keeps the lowest-keyed of duplicate rows, and removes the rest on the next write', async () => {
  const server = fakeUserDataServer([row('b', 'Settings', 'second'), row('a', 'Settings', 'first')]);
  const document = new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings');
  // The lowest key wins, so every browser that finds the same duplicates settles on the same row.
  expect(await document.read()).to.equal('first');
  await document.write('merged');
  expect(server.rows).to.deep.equal([row('a', 'Settings', 'merged')]);
});

it('reports a failed write, and does not create a row when it could not look first', async () => {
  const server = fakeUserDataServer();
  server.failing = true;
  expect(await new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings').write('x')).to.equal(false);
  expect(server.calls.some((call) => call.startsWith('create'))).to.equal(false);
});

it('creates again when the row it knew was deleted meanwhile', async () => {
  const server = fakeUserDataServer([row('k1', 'Settings', 'old')]);
  let next = 0;
  const document = new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings', () => `fresh-${++next}`);
  await document.read();
  server.rows = [];
  expect(await document.write('again')).to.equal(true);
  expect(server.rows).to.deep.equal([row('fresh-1', 'Settings', 'again')]);
});

it('does not guess when an update fails and it then cannot look', async () => {
  // A failed update is usually the network. Creating then would make a second row of the one that
  // is still there.
  const server = fakeUserDataServer([row('k1', 'Settings', 'old')]);
  const document = new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings', () => 'never');
  await document.read();
  server.failing = true;
  expect(await document.write('new')).to.equal(false);
  expect(server.calls.some((call) => call.startsWith('create'))).to.equal(false);
});

it('answers "could not" rather than throwing when the server throws', async () => {
  // The store above awaits these with no catch, so a throw would end its write loop and reject a
  // load nobody awaits. The port promises to report failure; this holds it to that.
  const server = fakeUserDataServer([row('k1', 'Settings', 'old')]);
  server.throwing = true;
  const document = new UmbraDesktopUserDataDocument(server.client, GROUP, 'Settings', () => 'never');
  expect(await document.read()).to.equal(undefined);
  expect(await document.write('new')).to.equal(false);
});
