import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot, writeSnapshot } from '../src/snapshot.mjs';
import { parseCsv, backfill, backfillDir } from '../src/backfill.mjs';
import { respond, fakeFetch } from './helpers.mjs';

const episodes = {
  version: 2,
  generatedAt: '2026-09-30T09:00:00Z',
  episodes: [
    { videoId: 'a', title: 'A', published: '2026-09-25T11:27:38Z', summary: 'About A.', guests: [{ name: 'Jane Doe', affiliation: 'Perplex' }], guestsUnnamed: false, uncertain: true },
    { videoId: 'b', title: 'B', published: '2026-08-25T11:27:38Z', summary: '', guests: [], guestsUnnamed: true, uncertain: false },
  ],
};

const sources = [
  { videoId: 'a', title: 'A', published: '2026-09-25T11:27:38Z', description: 'x' },
  { videoId: 'b', title: 'B', published: '2026-08-25T11:27:38Z', description: 'short' },
];

test('the snapshot is episodes.json v2 with every field, stamped snapshotAt from the file', () => {
  const snapshot = buildSnapshot(episodes, new Date('2030-01-01T00:00:00Z'));
  assert.deepEqual(Object.keys(snapshot), ['version', 'snapshotAt', 'episodes']);
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.snapshotAt, '2026-09-30T09:00:00Z');
  assert.deepEqual(snapshot.episodes, episodes.episodes);
  assert.notStrictEqual(snapshot.episodes[0].guests, episodes.episodes[0].guests, 'a copy, not the input');
});

test('the snapshot falls back to now only when the file has no generatedAt', () => {
  const snapshot = buildSnapshot({ ...episodes, generatedAt: undefined }, new Date('2030-01-01T00:00:00.250Z'));
  assert.equal(snapshot.snapshotAt, '2030-01-01T00:00:00Z');
});

test('the snapshot refuses a pre-v2 episodes file', () => {
  assert.throws(() => buildSnapshot({ version: 1, episodes: [] }), /version 2/);
});

test('writeSnapshot reads an episodes.json and writes the snapshot file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uc-snap-'));
  writeFileSync(join(dir, 'episodes.json'), JSON.stringify(episodes));
  writeSnapshot(join(dir, 'episodes.json'), join(dir, 'out', 'snap.json'));
  const written = JSON.parse(readFileSync(join(dir, 'out', 'snap.json'), 'utf8'));
  assert.equal(written.version, 2);
  assert.equal(written.episodes.length, 2);
  rmSync(dir, { recursive: true });
});

test('parseCsv reads id,published lines, skipping blanks and comments', () => {
  const rows = parseCsv('# ids\nabc,2020-01-02T03:04:05Z\n\n def ,2019-05-06\n');
  assert.deepEqual(rows, [
    { videoId: 'abc', published: '2020-01-02T03:04:05Z' },
    { videoId: 'def', published: '2019-05-06' },
  ]);
});

test('parseCsv rejects a line with no real date, naming the line', () => {
  assert.throws(() => parseCsv('abc'), /line 1/);
  assert.throws(() => parseCsv('abc,'), /line 1/);
  assert.throws(() => parseCsv('ok,2020-01-01\nabc,not-a-date'), /line 2/);
});

test('backfill checks each id with oEmbed, merges the live ones and reports the missing', async () => {
  const { fetchImpl } = fakeFetch({
    'watch%3Fv%3DGOOD': () => respond(200, '{"title":"umbraCoffee - Old One"}'),
    'watch%3Fv%3DGONE': () => respond(404, 'Not Found'),
  });
  const result = await backfill({
    existing: sources,
    rows: [
      { videoId: 'GOOD', published: '2019-01-01T00:00:00Z' },
      { videoId: 'GONE', published: '2018-01-01T00:00:00Z' },
      { videoId: 'a', published: '2026-09-25T11:27:38+00:00' },
    ],
    fetchImpl,
  });
  assert.deepEqual(result.added, ['GOOD']);
  assert.deepEqual(result.skipped, ['GONE']);
  assert.deepEqual(result.episodes.map((e) => e.videoId), ['a', 'b', 'GOOD']);
  assert.equal(result.episodes[2].title, 'Old One');
  assert.equal(result.episodes[2].published, '2019-01-01T00:00:00Z');
});

test('backfillDir merges into sources.json and rebuilds episodes.json in the same folder', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uc-backfill-'));
  writeFileSync(join(dir, 'sources.json'), JSON.stringify({ version: 1, generatedAt: '2026-09-30T09:00:00Z', episodes: sources }));
  const { fetchImpl } = fakeFetch({ 'watch%3Fv%3DGOOD': () => respond(200, '{"title":"umbraCoffee - Old One"}') });
  const result = await backfillDir({ dir, rows: [{ videoId: 'GOOD', published: '2019-01-01T00:00:00Z' }], fetchImpl, now: new Date('2026-10-01T09:00:00Z') });
  assert.deepEqual(result.added, ['GOOD']);
  const written = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
  assert.equal(written.version, 1);
  assert.equal(written.generatedAt, '2026-10-01T09:00:00Z');
  assert.deepEqual(written.episodes.at(-1), { videoId: 'GOOD', title: 'Old One', published: '2019-01-01T00:00:00Z', description: '' });
  const built = JSON.parse(readFileSync(join(dir, 'episodes.json'), 'utf8'));
  assert.equal(built.version, 2);
  assert.deepEqual(built.episodes.map((e) => e.videoId), ['a', 'b', 'GOOD']);
  rmSync(dir, { recursive: true });
});
