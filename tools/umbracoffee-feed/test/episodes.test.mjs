import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripPrefix, mergeEpisodes, refreshFromFeed } from '../src/episodes.mjs';

const ep = (videoId, published, title = videoId) => ({ videoId, title, published, description: '' });
const ids = (result) => result.episodes.map((e) => e.videoId);

test('stripPrefix removes the channel prefix, with hyphen, en dash or extra spaces', () => {
  assert.equal(stripPrefix('umbraCoffee - The September Shift'), 'The September Shift');
  assert.equal(stripPrefix('umbraCoffee – The September Shift'), 'The September Shift');
  assert.equal(stripPrefix('  umbraCoffee   -   Spaced  '), 'Spaced');
});

test('stripPrefix leaves a title without the prefix untouched', () => {
  assert.equal(stripPrefix('Special: Codegarden'), 'Special: Codegarden');
  assert.equal(stripPrefix('umbraCoffee'), 'umbraCoffee');
});

test('mergeEpisodes adds only unseen ids, newest first, and reports them', () => {
  const existing = [ep('b', '2026-08-01T00:00:00Z'), ep('a', '2026-07-01T00:00:00Z')];
  const result = mergeEpisodes(existing, [
    { videoId: 'c', title: 'umbraCoffee - C', published: '2026-09-01T00:00:00Z', description: 'd' },
    { videoId: 'b', title: 'changed', published: '2026-08-01T00:00:00Z', description: 'x' },
  ]);
  assert.equal(result.changed, true);
  assert.deepEqual(result.added, ['c']);
  assert.deepEqual(ids(result), ['c', 'b', 'a']);
  assert.equal(result.episodes[0].title, 'C');
  assert.equal(result.episodes[1].title, 'b', 'an existing entry is never edited');
});

test('mergeEpisodes reports no change when every id is known', () => {
  const existing = [ep('a', '2026-07-01T00:00:00Z')];
  const result = mergeEpisodes(existing, [ep('a', '2026-07-01T00:00:00Z')]);
  assert.equal(result.changed, false);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.episodes, existing);
});

test('mergeEpisodes never reorders existing entries, even when they are not sorted', () => {
  const existing = [ep('old', '2020-01-01T00:00:00Z'), ep('new', '2026-01-01T00:00:00Z')];
  const result = mergeEpisodes(existing, [ep('mid', '2023-01-01T00:00:00Z')]);
  // 'old' stays ahead of 'new' as given; the newcomer goes before the first entry older than it.
  assert.deepEqual(ids(result), ['mid', 'old', 'new']);
});

test('mergeEpisodes puts older backfilled entries after newer ones, ordered among themselves', () => {
  const existing = [ep('a', '2026-07-01T00:00:00Z')];
  const result = mergeEpisodes(existing, [ep('x', '2019-01-01T00:00:00Z'), ep('y', '2020-01-01T00:00:00Z')]);
  assert.deepEqual(ids(result), ['a', 'y', 'x']);
});

test('refreshFromFeed updates title and description of feed entries that changed, and only those', () => {
  const existing = [
    { videoId: 'a', title: 'A', published: '2026-09-01T00:00:00Z', description: 'old a' },
    { videoId: 'b', title: 'B', published: '2026-08-01T00:00:00Z', description: 'b' },
    { videoId: 'gone', title: 'Gone', published: '2020-01-01T00:00:00Z', description: 'kept' },
  ];
  const result = refreshFromFeed(existing, [
    { videoId: 'a', title: 'umbraCoffee - A renamed', published: '2030-01-01T00:00:00Z', description: 'new a' },
    { videoId: 'b', title: 'umbraCoffee - B', published: '2026-08-01T00:00:00Z', description: 'b' },
    { videoId: 'new', title: 'N', published: '2026-10-01T00:00:00Z', description: 'n' },
  ]);
  assert.equal(result.changed, true);
  assert.deepEqual(result.updated, ['a']);
  assert.deepEqual(result.episodes[0], { videoId: 'a', title: 'A renamed', published: '2026-09-01T00:00:00Z', description: 'new a' },
    'published is never moved, only title and description');
  assert.strictEqual(result.episodes[1], existing[1], 'an unchanged entry is the same object');
  assert.strictEqual(result.episodes[2], existing[2], 'an entry not in the feed is never touched');
  assert.equal(result.episodes.length, 3, 'refresh never adds; mergeEpisodes does that');
  assert.equal(existing[0].title, 'A', 'the input is not mutated');
});

test('refreshFromFeed keeps the stored title when the feed entry has none', () => {
  const existing = [{ videoId: 'a', title: 'A', published: '2026-09-01T00:00:00Z', description: 'd' }];
  const result = refreshFromFeed(existing, [{ videoId: 'a', title: '  ', published: '2026-09-01T00:00:00Z', description: 'd' }]);
  assert.equal(result.changed, false);
  assert.equal(result.episodes[0].title, 'A');
});
