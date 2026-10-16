import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextEpisode, emptyNextFile } from '../src/next-episode.mjs';

const NOW = new Date('2026-10-30T10:00:00Z');
const video = (videoId, state, scheduledStart, actualStart = null) => ({ videoId, title: `T ${videoId}`, state, scheduledStart, actualStart });
const lookupOf = (...videos) => (id) => videos.find((v) => v.videoId === id);
const previousWith = (v) => ({
  version: 1,
  updatedAt: '2026-10-30T09:55:00Z',
  episode: { videoId: v.videoId, title: v.title, state: v.state, scheduledStart: v.scheduledStart, actualStart: v.actualStart },
});

test('a new upcoming id becomes the episode and stamps updatedAt', () => {
  const up = video('N', 'upcoming', '2026-10-30T11:30:00Z');
  const { file, changed } = nextEpisode({ previous: emptyNextFile(NOW), newIds: ['N'], lookup: lookupOf(up), now: NOW });
  assert.equal(changed, true);
  assert.equal(file.updatedAt, '2026-10-30T10:00:00Z');
  assert.deepEqual(file.episode, { videoId: 'N', title: 'T N', state: 'upcoming', scheduledStart: '2026-10-30T11:30:00Z', actualStart: null });
  assert.deepEqual(Object.keys(file.episode), ['videoId', 'title', 'state', 'scheduledStart', 'actualStart'], 'stable key order');
});

test('a new live id becomes the episode', () => {
  const live = video('L', 'live', '2026-10-30T09:30:00Z', '2026-10-30T09:34:00Z');
  const { file } = nextEpisode({ previous: null, newIds: ['L'], lookup: lookupOf(live), now: NOW });
  assert.equal(file.episode.state, 'live');
});

test('a new id that is an ordinary upload is not next', () => {
  const { file } = nextEpisode({ previous: null, newIds: ['E'], lookup: lookupOf(video('E', 'ended', null)), now: NOW });
  assert.equal(file.episode, null);
});

test('the previous episode is updated from the lookup and updatedAt moves on', () => {
  const before = video('P', 'upcoming', '2026-10-30T10:30:00Z');
  const after = video('P', 'live', '2026-10-30T10:30:00Z', '2026-10-30T10:31:00Z');
  const { file, changed } = nextEpisode({ previous: previousWith(before), newIds: [], lookup: lookupOf(after), now: NOW });
  assert.equal(changed, true);
  assert.equal(file.episode.state, 'live');
  assert.equal(file.episode.actualStart, '2026-10-30T10:31:00Z');
  assert.equal(file.updatedAt, '2026-10-30T10:00:00Z');
});

test('an ended previous episode empties the file', () => {
  const before = video('P', 'live', '2026-10-30T09:30:00Z', '2026-10-30T09:31:00Z');
  const { file, changed } = nextEpisode({ previous: previousWith(before), newIds: [], lookup: lookupOf(video('P', 'ended', null)), now: NOW });
  assert.equal(file.episode, null);
  assert.equal(changed, true);
});

test('a previous episode the API no longer knows empties the file', () => {
  const before = video('P', 'upcoming', '2026-10-30T11:30:00Z');
  const { file } = nextEpisode({ previous: previousWith(before), newIds: [], lookup: lookupOf(), now: NOW });
  assert.equal(file.episode, null);
});

test('an upcoming episode more than six hours past its start is abandoned (#114)', () => {
  const stale = video('Old', 'upcoming', '2026-10-30T03:59:00Z');
  const { file } = nextEpisode({ previous: previousWith(stale), newIds: [], lookup: lookupOf(stale), now: NOW });
  assert.equal(file.episode, null);
});

test('an upcoming episode just under six hours late is still kept, the client applies its own grace', () => {
  const late = video('Late', 'upcoming', '2026-10-30T04:01:00Z');
  const { file } = nextEpisode({ previous: previousWith(late), newIds: [], lookup: lookupOf(late), now: NOW });
  assert.equal(file.episode.videoId, 'Late');
});

test('a live episode is never abandoned however long ago it was scheduled', () => {
  const live = video('Marathon', 'live', '2026-10-29T10:00:00Z', '2026-10-29T10:05:00Z');
  const { file } = nextEpisode({ previous: previousWith(live), newIds: [], lookup: lookupOf(live), now: NOW });
  assert.equal(file.episode.state, 'live');
});

test('with no API key (lookup null) the episode stays null and nothing throws', () => {
  const { file, changed } = nextEpisode({ previous: emptyNextFile(NOW), newIds: ['A', 'B'], lookup: null, now: NOW });
  assert.equal(file.episode, null);
  assert.equal(changed, false);
});

test('two candidates: the sooner scheduledStart wins', () => {
  const a = video('A', 'upcoming', '2026-11-05T11:30:00Z');
  const b = video('B', 'upcoming', '2026-10-30T11:30:00Z');
  const { file } = nextEpisode({ previous: null, newIds: ['A', 'B'], lookup: lookupOf(a, b), now: NOW });
  assert.equal(file.episode.videoId, 'B');
});

test('changed is false only when the file would be byte-identical (empty stays empty)', () => {
  const previous = { version: 1, updatedAt: '2026-10-01T00:00:00Z', episode: null };
  const { file, changed } = nextEpisode({ previous, newIds: [], lookup: lookupOf(), now: NOW });
  assert.equal(changed, false);
  assert.equal(file.updatedAt, '2026-10-01T00:00:00Z', 'an empty file keeps its old stamp so the run is a no-op');
});

test('while an episode is set, every run is a change because updatedAt is the heartbeat', () => {
  const up = video('P', 'upcoming', '2026-10-30T11:30:00Z');
  const { changed } = nextEpisode({ previous: previousWith(up), newIds: [], lookup: lookupOf(up), now: NOW });
  assert.equal(changed, true);
});
