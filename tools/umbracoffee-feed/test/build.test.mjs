import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceHash, buildEpisodes, pendingEpisodes, rebuildEpisodes } from '../src/build.mjs';

const NOW = new Date('2026-10-01T09:00:00Z');
const src = (videoId, published, title = videoId, description = '') => ({ videoId, title, published, description });
const detail = (episode, fields = {}) => ({
  summary: `About ${episode.videoId}.`,
  guests: [],
  guestsUnnamed: false,
  uncertain: false,
  uncertainReason: null,
  sourceHash: sourceHash(episode.title, episode.description),
  ...fields,
});

test('sourceHash is the first 16 hex characters of SHA-256 over title, newline, description', () => {
  assert.equal(sourceHash('The September Shift', 'hello'), '16dd4f183dfa3468');
  assert.notEqual(sourceHash('The September Shift', 'hello!'), '16dd4f183dfa3468', 'a changed description changes the hash');
  assert.match(sourceHash('', ''), /^[0-9a-f]{16}$/);
});

test('buildEpisodes gives the v2 shape in source order, with no descriptions', () => {
  const a = src('a', '2026-09-01T00:00:00Z', 'A', 'desc a');
  const b = src('b', '2026-08-01T00:00:00Z', 'B', 'desc b');
  const episodes = buildEpisodes({
    sources: [a, b],
    details: { a: detail(a, { guests: [{ name: 'Jane Doe', affiliation: 'Perplex' }], uncertain: true, uncertainReason: 'first name only' }) },
  });
  assert.deepEqual(episodes.map((e) => e.videoId), ['a', 'b']);
  assert.deepEqual(Object.keys(episodes[0]), ['videoId', 'title', 'published', 'summary', 'guests', 'guestsUnnamed', 'uncertain']);
  assert.deepEqual(episodes[0], {
    videoId: 'a', title: 'A', published: '2026-09-01T00:00:00Z', summary: 'About a.',
    guests: [{ name: 'Jane Doe', affiliation: 'Perplex' }], guestsUnnamed: false, uncertain: true,
  });
});

test('a missing details entry gives an empty summary and no guests', () => {
  const [episode] = buildEpisodes({ sources: [src('a', '2026-09-01T00:00:00Z')] });
  assert.equal(episode.summary, '');
  assert.deepEqual(episode.guests, []);
  assert.equal(episode.guestsUnnamed, false);
  assert.equal(episode.uncertain, false);
});

test('a stale details entry (hash mismatch) is still used until it is redone', () => {
  const a = src('a', '2026-09-01T00:00:00Z', 'A', 'new description');
  const [episode] = buildEpisodes({ sources: [a], details: { a: detail(a, { sourceHash: '0000000000000000', summary: 'Old.' }) } });
  assert.equal(episode.summary, 'Old.');
});

test('overrides win field by field, and leave the other fields to details', () => {
  const a = src('a', '2026-09-01T00:00:00Z', 'A');
  const b = src('b', '2026-08-01T00:00:00Z', 'B');
  const episodes = buildEpisodes({
    sources: [a, b],
    details: { a: detail(a, { guests: [{ name: 'X Y', affiliation: null }] }) },
    overrides: {
      version: 1,
      episodes: {
        a: { summary: 'Fixed by hand.' },
        b: { guests: [{ name: 'Only Override' }], guestsUnnamed: false },
      },
    },
  });
  assert.equal(episodes[0].summary, 'Fixed by hand.');
  assert.deepEqual(episodes[0].guests, [{ name: 'X Y', affiliation: null }], 'guests still from details');
  assert.equal(episodes[1].summary, '', 'no details, no summary override');
  assert.deepEqual(episodes[1].guests, [{ name: 'Only Override', affiliation: null }]);
});

test('guestNames maps a variant to its canonical name, exact match only', () => {
  const a = src('a', '2026-09-01T00:00:00Z');
  const [episode] = buildEpisodes({
    sources: [a],
    details: { a: detail(a, { guests: [{ name: 'Jon Smith', affiliation: 'HQ' }, { name: 'jon smith', affiliation: null }] }) },
    overrides: { version: 1, guestNames: { 'Jon Smith': 'Jonathan Smith' }, episodes: {} },
  });
  assert.deepEqual(episode.guests, [
    { name: 'Jonathan Smith', affiliation: 'HQ' },
    { name: 'jon smith', affiliation: null },
  ], 'the lower-case spelling is not an exact match, so it is left alone');
});

test('guestNames collapses a guest that becomes a duplicate within the same episode', () => {
  const a = src('a', '2026-09-01T00:00:00Z');
  const [episode] = buildEpisodes({
    sources: [a],
    details: { a: detail(a, { guests: [{ name: 'Jesper', affiliation: null }, { name: 'Jesper Mayntzhusen', affiliation: 'Umbraco HQ' }] }) },
    overrides: { version: 1, guestNames: { Jesper: 'Jesper Mayntzhusen' }, episodes: {} },
  });
  assert.deepEqual(episode.guests, [{ name: 'Jesper Mayntzhusen', affiliation: 'Umbraco HQ' }],
    'one guest left, and the affiliation the dropped duplicate carried is kept');
});

test('guestNames leaves an unmapped name alone and also applies to override guests', () => {
  const a = src('a', '2026-09-01T00:00:00Z');
  const [episode] = buildEpisodes({
    sources: [a],
    overrides: { version: 1, guestNames: { Kim: 'Kim Jensen' }, episodes: { a: { guests: [{ name: 'Kim', affiliation: null }, { name: 'Ada Lovelace', affiliation: null }] } } },
  });
  assert.deepEqual(episode.guests.map((g) => g.name), ['Kim Jensen', 'Ada Lovelace']);
});

test('pendingEpisodes lists episodes with no details or a hash mismatch, newest first, with a date', () => {
  const a = src('a', '2026-07-01T10:00:00Z', 'A', 'da');
  const b = src('b', '2026-09-01T23:30:00Z', 'B', 'db');
  const c = src('c', '2026-08-01T00:00:00Z', 'C', 'dc');
  const pending = pendingEpisodes({
    sources: [a, b, c],
    details: { a: detail(a, { sourceHash: 'ffffffffffffffff' }), c: detail(c) },
  });
  assert.deepEqual(pending, [
    { videoId: 'b', title: 'B', date: '2026-09-01', description: 'db' },
    { videoId: 'a', title: 'A', date: '2026-07-01', description: 'da' },
  ]);
});

test('rebuildEpisodes writes episodes.json v2 and keeps the bytes when nothing changed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uc-build-'));
  const a = src('a', '2026-09-01T00:00:00Z', 'A', 'd');
  writeFileSync(join(dir, 'sources.json'), JSON.stringify({ version: 1, generatedAt: '2026-09-30T00:00:00Z', episodes: [a] }));
  const first = rebuildEpisodes(dir, NOW);
  assert.equal(first.changed, true);
  const file = JSON.parse(readFileSync(join(dir, 'episodes.json'), 'utf8'));
  assert.deepEqual(Object.keys(file), ['version', 'generatedAt', 'episodes']);
  assert.equal(file.version, 2);
  assert.equal(file.generatedAt, '2026-10-01T09:00:00Z');
  const bytes = readFileSync(join(dir, 'episodes.json'), 'utf8');
  const mtime = statSync(join(dir, 'episodes.json')).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));

  const again = rebuildEpisodes(dir, new Date('2026-10-02T09:00:00Z'));
  assert.equal(again.changed, false);
  assert.equal(readFileSync(join(dir, 'episodes.json'), 'utf8'), bytes);
  assert.equal(statSync(join(dir, 'episodes.json')).mtimeMs, mtime);

  writeFileSync(join(dir, 'details.json'), JSON.stringify({ version: 1, episodes: { a: detail(a) } }));
  const third = rebuildEpisodes(dir, new Date('2026-10-03T09:00:00.500Z'));
  assert.equal(third.changed, true);
  const updated = JSON.parse(readFileSync(join(dir, 'episodes.json'), 'utf8'));
  assert.equal(updated.generatedAt, '2026-10-03T09:00:00Z');
  assert.equal(updated.episodes[0].summary, 'About a.');
  rmSync(dir, { recursive: true });
});
