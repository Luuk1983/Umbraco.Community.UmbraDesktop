import { expect } from '@open-wc/testing';
import shipped from './snapshot/episodes.snapshot.json';
import { snapshotData } from './snapshot.js';
import { isEpisode } from './types.js';

/**
 * The snapshot is what the window shows when GitHub cannot be reached, so what matters is that it is
 * usable as it stands: offline, nothing current, real episodes, and dated so the notice can say "up to".
 * It is loaded on demand, so `snapshotData` is asynchronous; the test may import the file itself,
 * since the rule about not loading it eagerly is the bundle's, not the test page's.
 */

/** An arbitrary receipt time. */
const NOW = Date.parse('2026-10-30T11:00:00Z');

it('is offline with nothing current, stamped with the time it was asked for', async () => {
  const data = await snapshotData(NOW);
  expect(data.offline).to.equal(true);
  expect(data.current === null).to.equal(true);
  expect(data.currentUpdatedAt === undefined).to.equal(true);
  expect(data.receivedAt).to.equal(NOW);
});

it('carries the shipped episodes, valid version 2 entries, and the date they are up to', async () => {
  const data = await snapshotData(NOW);
  expect(shipped.version, 'the shipped file is the version 2 list').to.equal(2);
  expect(data.episodes.length).to.be.greaterThan(0);
  expect(data.episodes.every(isEpisode)).to.equal(true);
  expect(data.episodesAsOf).to.equal(shipped.snapshotAt);
  expect(Number.isNaN(Date.parse(data.episodesAsOf ?? ''))).to.equal(false);
});

it('hands out a list each caller may keep without changing the next', async () => {
  const first = await snapshotData(NOW);
  first.episodes.pop();
  const guests = (await snapshotData(NOW)).episodes[0]!.guests;
  guests.push({ name: 'Someone', affiliation: null });
  expect((await snapshotData(NOW)).episodes.length).to.equal(first.episodes.length + 1);
  expect((await snapshotData(NOW)).episodes[0]!.guests.length, 'the guests are copied too').to.equal(guests.length - 1);
});
