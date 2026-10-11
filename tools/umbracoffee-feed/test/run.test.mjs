import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/run.mjs';
import { sourceHash } from '../src/build.mjs';
import { fixture, respond, fakeFetch } from './helpers.mjs';

const NOW = new Date('2026-09-30T09:00:00Z');
const FILES = ['sources.json', 'episodes.json', 'next-episode.json'];
const tempDir = () => mkdtempSync(join(tmpdir(), 'uc-feed-test-'));
const read = (dir, name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const bytes = (dir) => FILES.map((f) => readFileSync(join(dir, f), 'utf8'));
const times = (dir) => FILES.map((f) => statSync(join(dir, f)).mtimeMs);
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The recorded channel feed, optionally with one extra entry prepended. */
function feedWith(extraId) {
  const xml = fixture('feed-umbracoffee.xml');
  if (!extraId) return xml;
  const entry = `<entry><yt:videoId>${extraId}</yt:videoId><title>umbraCoffee - Fresh</title><published>2026-10-29T10:00:00+00:00</published><media:description>new</media:description></entry>`;
  return xml.replace('<entry>', `${entry}<entry>`);
}

/** The recorded feed with the newest episode retitled and its description rewritten. */
function feedEdited() {
  return fixture('feed-umbracoffee.xml')
    .replace('<title>umbraCoffee - The September Shift</title>', '<title>umbraCoffee - The September Shift (with guests)</title>')
    .replace(/(<entry>[\s\S]*?<media:description>)[\s\S]*?(<\/media:description>)/, '$1Edited description.$2');
}

test('the first run over an empty directory writes sources, episodes v2 and an empty next-episode file', async () => {
  const dir = tempDir();
  const { fetchImpl, calls } = fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) });
  const result = await run({ dir, fetchImpl, apiKey: undefined, now: NOW });
  assert.equal(result.changed, true);

  const sources = read(dir, 'sources.json');
  assert.equal(sources.version, 1);
  assert.equal(sources.generatedAt, '2026-09-30T09:00:00Z');
  assert.equal(sources.episodes.length, 15);
  assert.equal(sources.episodes[0].title, 'The September Shift', 'prefix stripped');
  assert.deepEqual(Object.keys(sources.episodes[0]), ['videoId', 'title', 'published', 'description']);
  assert.ok(sources.episodes[0].description.length > 0);

  const episodes = read(dir, 'episodes.json');
  assert.equal(episodes.version, 2);
  assert.equal(episodes.generatedAt, '2026-09-30T09:00:00Z');
  assert.equal(episodes.episodes.length, 15);
  assert.deepEqual(episodes.episodes[0], {
    videoId: 'aRkc0fRxQjw', title: 'The September Shift', published: '2026-09-25T11:27:38Z',
    summary: '', guests: [], guestsUnnamed: false, uncertain: false,
  });

  assert.deepEqual(read(dir, 'next-episode.json'), { version: 1, updatedAt: '2026-09-30T09:00:00Z', episode: null });
  assert.ok(calls.every((c) => c.includes('feeds/videos.xml')), 'no key means no API call and no other lookups');
  assert.ok(calls[0].includes('channel_id=UCF_Ene5-58a3Z55aw8O6Djg'));
  assert.equal(existsSync(join(dir, 'details.json')), false, 'the Action never creates details.json');
  assert.equal(existsSync(join(dir, 'overrides.json')), false, 'nor overrides.json');
  rmSync(dir, { recursive: true });
});

test('a second run over the same feed changes nothing and writes nothing', async () => {
  const dir = tempDir();
  const { fetchImpl } = fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) });
  await run({ dir, fetchImpl, now: NOW });
  const before = bytes(dir);
  const mtimes = times(dir);
  await pause();
  const again = await run({ dir, fetchImpl, now: new Date('2026-09-30T09:05:00Z') });
  assert.equal(again.changed, false);
  assert.deepEqual(bytes(dir), before);
  assert.deepEqual(times(dir), mtimes);
  rmSync(dir, { recursive: true });
});

test('a changed title or description in the feed updates sources.json, and only for feed entries', async () => {
  const dir = tempDir();
  const old = { videoId: 'OLD00000001', title: 'From the backfill', published: '2019-01-01T00:00:00Z', description: '' };
  writeFileSync(join(dir, 'sources.json'), JSON.stringify({ version: 1, generatedAt: '2026-01-01T00:00:00Z', episodes: [old] }, null, 2) + '\n');
  await run({ dir, fetchImpl: fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) }).fetchImpl, now: NOW });

  const stale = read(dir, 'sources.json').episodes[0];
  const details = {
    version: 1,
    episodes: {
      [stale.videoId]: { summary: 'Before the edit.', guests: [], guestsUnnamed: false, uncertain: false, uncertainReason: null, sourceHash: sourceHash(stale.title, stale.description) },
    },
  };
  writeFileSync(join(dir, 'details.json'), JSON.stringify(details, null, 2) + '\n');
  const detailsBytes = readFileSync(join(dir, 'details.json'), 'utf8');

  const later = new Date('2026-10-01T09:00:00Z');
  const result = await run({ dir, fetchImpl: fakeFetch({ 'feeds/videos.xml': () => respond(200, feedEdited()) }).fetchImpl, now: later });
  assert.equal(result.changed, true);
  const sources = read(dir, 'sources.json');
  assert.equal(sources.generatedAt, '2026-10-01T09:00:00Z');
  assert.equal(sources.episodes[0].title, 'The September Shift (with guests)');
  assert.equal(sources.episodes[0].description, 'Edited description.');
  assert.equal(sources.episodes[0].published, '2026-09-25T11:27:38Z');
  assert.deepEqual(sources.episodes.at(-1), old, 'an entry the feed no longer lists is never touched');

  const episodes = read(dir, 'episodes.json');
  assert.equal(episodes.episodes[0].title, 'The September Shift (with guests)');
  assert.equal(episodes.episodes[0].summary, 'Before the edit.', 'a stale details entry is still shown');
  assert.equal(readFileSync(join(dir, 'details.json'), 'utf8'), detailsBytes, 'the Action only reads details.json');
  rmSync(dir, { recursive: true });
});

test('episodes.json is rebuilt from details and overrides, and a rerun keeps its bytes', async () => {
  const dir = tempDir();
  const { fetchImpl } = fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) });
  await run({ dir, fetchImpl, now: NOW });
  const [first, second] = read(dir, 'sources.json').episodes;
  writeFileSync(join(dir, 'details.json'), JSON.stringify({
    version: 1,
    episodes: {
      [first.videoId]: { summary: 'S1.', guests: [{ name: 'Jane', affiliation: null }], guestsUnnamed: false, uncertain: true, uncertainReason: 'first name only', sourceHash: sourceHash(first.title, first.description) },
    },
  }));
  writeFileSync(join(dir, 'overrides.json'), JSON.stringify({
    version: 1,
    guestNames: { Jane: 'Jane Doe' },
    episodes: { [second.videoId]: { summary: 'Written by the owner.' } },
  }));
  const later = new Date('2026-10-01T09:00:00Z');
  const result = await run({ dir, fetchImpl, now: later });
  assert.equal(result.changed, true);
  assert.equal(result.episodesChanged, true);
  assert.equal(read(dir, 'sources.json').generatedAt, '2026-09-30T09:00:00Z', 'sources did not change');
  const episodes = read(dir, 'episodes.json');
  assert.equal(episodes.generatedAt, '2026-10-01T09:00:00Z');
  assert.deepEqual(episodes.episodes[0].guests, [{ name: 'Jane Doe', affiliation: null }]);
  assert.equal(episodes.episodes[0].uncertain, true);
  assert.equal(episodes.episodes[1].summary, 'Written by the owner.');

  const before = bytes(dir);
  await pause();
  const again = await run({ dir, fetchImpl, now: new Date('2026-10-01T09:05:00Z') });
  assert.equal(again.changed, false);
  assert.deepEqual(bytes(dir), before);
  rmSync(dir, { recursive: true });
});

test('a pre-v2 episodes.json seeds sources.json when there is none, so the back catalogue survives', async () => {
  const dir = tempDir();
  const back = { videoId: 'BACK0000001', title: 'Old one', published: '2019-01-01T00:00:00Z', description: 'old text' };
  writeFileSync(join(dir, 'episodes.json'), JSON.stringify({ version: 1, generatedAt: '2026-09-01T00:00:00Z', episodes: [back] }));
  const { fetchImpl } = fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) });
  await run({ dir, fetchImpl, now: NOW });
  const sources = read(dir, 'sources.json');
  assert.equal(sources.episodes.length, 16);
  assert.deepEqual(sources.episodes.at(-1), back);
  const episodes = read(dir, 'episodes.json');
  assert.equal(episodes.version, 2);
  assert.equal(episodes.episodes.length, 16);
  assert.equal('description' in episodes.episodes.at(-1), false);
  rmSync(dir, { recursive: true });
});

test('a new id whose lookup says upcoming writes all three files', async () => {
  const dir = tempDir();
  const first = fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) });
  await run({ dir, fetchImpl: first.fetchImpl, now: NOW });
  const upcoming = JSON.stringify({
    items: [{ id: 'NEWID000001', snippet: { title: 'umbraCoffee - Fresh', liveBroadcastContent: 'upcoming' }, liveStreamingDetails: { scheduledStartTime: '2026-10-30T11:30:00Z' } }],
  });
  const second = fakeFetch({
    'feeds/videos.xml': () => respond(200, feedWith('NEWID000001')),
    'googleapis.com/youtube/v3/videos': () => respond(200, upcoming),
  });
  const result = await run({ dir, fetchImpl: second.fetchImpl, apiKey: 'K', now: new Date('2026-10-29T10:10:00Z') });
  assert.equal(result.changed, true);
  assert.equal(read(dir, 'sources.json').episodes.length, 16);
  const episodes = read(dir, 'episodes.json');
  assert.equal(episodes.episodes.length, 16);
  assert.equal(episodes.episodes[0].videoId, 'NEWID000001');
  const next = read(dir, 'next-episode.json');
  assert.equal(next.episode.videoId, 'NEWID000001');
  assert.equal(next.episode.state, 'upcoming');
  assert.equal(next.updatedAt, '2026-10-29T10:10:00Z');
  rmSync(dir, { recursive: true });
});

test('an API failure leaves next-episode.json alone instead of dropping the episode', async () => {
  const dir = tempDir();
  const previous = { version: 1, updatedAt: '2026-10-30T09:00:00Z', episode: { videoId: 'P', title: 'T', state: 'upcoming', scheduledStart: '2026-10-30T11:30:00Z', actualStart: null } };
  writeFileSync(join(dir, 'next-episode.json'), JSON.stringify(previous, null, 2) + '\n');
  const { fetchImpl } = fakeFetch({
    'feeds/videos.xml': () => respond(200, feedWith()),
    'googleapis.com': () => respond(500, 'boom'),
  });
  await run({ dir, fetchImpl, apiKey: 'K', now: new Date('2026-10-30T10:00:00Z') });
  assert.deepEqual(read(dir, 'next-episode.json'), previous);
  rmSync(dir, { recursive: true });
});

test('a broken feed fails the run and writes nothing', async () => {
  const dir = tempDir();
  const { fetchImpl } = fakeFetch({ 'feeds/videos.xml': () => respond(200, '<html>blocked</html>') });
  await assert.rejects(() => run({ dir, fetchImpl, now: NOW }), /not an Atom feed/);
  assert.equal(existsSync(join(dir, 'sources.json')), false);
  assert.equal(existsSync(join(dir, 'episodes.json')), false);
  rmSync(dir, { recursive: true });
});

test('a non-200 feed fails the run', async () => {
  const dir = tempDir();
  const { fetchImpl } = fakeFetch({ 'feeds/videos.xml': () => respond(404, '') });
  await assert.rejects(() => run({ dir, fetchImpl, now: NOW }), /404/);
  rmSync(dir, { recursive: true });
});

test('changed is reported to GITHUB_OUTPUT when given a path', async () => {
  const dir = tempDir();
  const out = join(dir, 'gh-output');
  const { fetchImpl } = fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) });
  await run({ dir, fetchImpl, now: NOW, githubOutput: out });
  assert.match(readFileSync(out, 'utf8'), /^changed=true$/m);
  await run({ dir, fetchImpl, now: NOW, githubOutput: out });
  assert.match(readFileSync(out, 'utf8'), /^changed=false$/m);
  rmSync(dir, { recursive: true });
});

test('timestamps drop milliseconds, so a real clock never puts .123Z into the data files', async () => {
  const dir = tempDir();
  const { fetchImpl } = fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) });
  await run({ dir, fetchImpl, now: new Date('2026-09-30T14:00:18.844Z') });
  assert.equal(read(dir, 'sources.json').generatedAt, '2026-09-30T14:00:18Z');
  assert.equal(read(dir, 'episodes.json').generatedAt, '2026-09-30T14:00:18Z');
  assert.equal(read(dir, 'next-episode.json').updatedAt, '2026-09-30T14:00:18Z');
  rmSync(dir, { recursive: true });
});
