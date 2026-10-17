import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/run.mjs';
import { sourceHash } from '../src/build.mjs';
import { parseFeed } from '../src/rss.mjs';
import { fixture, respond, fakeFetch } from './helpers.mjs';

const NOW = new Date('2026-09-30T09:00:00Z');
const FILES = ['sources.json', 'episodes.json', 'next-episode.json'];
const tempDir = () => mkdtempSync(join(tmpdir(), 'uc-feed-test-'));
const read = (dir, name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const bytes = (dir) => FILES.map((f) => readFileSync(join(dir, f), 'utf8'));
const times = (dir) => FILES.map((f) => statSync(join(dir, f)).mtimeMs);
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
/** A wait that returns at once, so a test of a failing feed does not sit out the real retry delays. */
const noWait = async () => {};
const feedCalls = (calls) => calls.filter((c) => c.includes('feeds/videos.xml')).length;

/**
 * A `playlistItems.list` answer describing the same uploads as a feed, the way the API would.
 * @param {string} xml A feed body.
 * @param {(entry: object) => object} [edit] Changes an entry before it goes in, for an API that disagrees with the feed.
 * @returns {string} The answer's JSON.
 */
function uploadsOf(xml, edit = (entry) => entry) {
  const items = parseFeed(xml).map(edit).map((e) => ({ snippet: { title: e.title, description: e.description, resourceId: { kind: 'youtube#video', videoId: e.videoId } } }));
  return JSON.stringify({ items });
}

/** A `videos.list` answer saying the given id is a stream that has not started yet. */
const upcomingAnswer = (id) => JSON.stringify({
  items: [{ id, snippet: { title: 'umbraCoffee - Fresh', liveBroadcastContent: 'upcoming' }, liveStreamingDetails: { scheduledStartTime: '2026-10-30T11:30:00Z' } }],
});

/** Collects the warnings a run raises, so a test can assert on them instead of on the console. */
function warnings() {
  const messages = [];
  return { messages, warn: (message) => messages.push(message) };
}

/** A data folder after one run over the recorded feed with no key: the state every API test starts from. */
async function primed() {
  const dir = tempDir();
  await run({ dir, fetchImpl: fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) }).fetchImpl, now: NOW, warn: () => {} });
  return dir;
}

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
  const { messages, warn } = warnings();
  const result = await run({ dir, fetchImpl, apiKey: undefined, now: NOW, warn });
  assert.equal(result.changed, true);
  assert.deepEqual(messages, [], 'no key is a normal setup, not a warning');

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
  const dir = await primed();
  const { messages, warn } = warnings();
  const second = fakeFetch({
    'feeds/videos.xml': () => respond(200, feedWith('NEWID000001')),
    'youtube/v3/playlistItems': () => respond(200, uploadsOf(feedWith('NEWID000001'))),
    'youtube/v3/videos': () => respond(200, upcomingAnswer('NEWID000001')),
  });
  const result = await run({ dir, fetchImpl: second.fetchImpl, apiKey: 'K', now: new Date('2026-10-29T10:10:00Z'), warn });
  assert.equal(result.changed, true);
  assert.deepEqual(messages, []);
  assert.equal(feedCalls(second.calls), 1);
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

test('when the API lists nothing new or changed the feed is not read at all, and the run is green', async () => {
  const dir = await primed();
  // An older episode the newest 15 do not reach: its text is never compared, so it cannot force a read.
  const sources = read(dir, 'sources.json');
  sources.episodes.push({ videoId: 'OLD00000001', title: 'From the backfill', published: '2019-01-01T00:00:00Z', description: '' });
  writeFileSync(join(dir, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
  await run({ dir, fetchImpl: fakeFetch({ 'feeds/videos.xml': () => respond(200, feedWith()) }).fetchImpl, now: NOW, warn: () => {} });
  const before = bytes(dir);

  const { messages, warn } = warnings();
  const { fetchImpl, calls } = fakeFetch({
    'feeds/videos.xml': () => respond(404, ''),
    'youtube/v3/playlistItems': () => respond(200, uploadsOf(feedWith())),
  });
  const result = await run({ dir, fetchImpl, apiKey: 'K', now: new Date('2026-10-01T09:00:00Z'), warn, wait: noWait });
  assert.equal(result.changed, false);
  assert.equal(feedCalls(calls), 0, 'the feed was read');
  assert.deepEqual(messages, []);
  assert.deepEqual(bytes(dir), before);
  rmSync(dir, { recursive: true });
});

test('a title or description the API reports changed makes the run read the feed and take its text', async () => {
  const dir = await primed();
  const edited = (entry) => (entry.videoId === 'aRkc0fRxQjw' ? { ...entry, description: 'Edited description.' } : entry);
  const { fetchImpl, calls } = fakeFetch({
    'feeds/videos.xml': () => respond(200, feedEdited()),
    'youtube/v3/playlistItems': () => respond(200, uploadsOf(feedWith(), edited)),
  });
  const result = await run({ dir, fetchImpl, apiKey: 'K', now: new Date('2026-10-01T09:00:00Z'), warn: () => {} });
  assert.equal(feedCalls(calls), 1);
  assert.equal(result.sourcesChanged, true);
  assert.equal(read(dir, 'sources.json').episodes[0].description, 'Edited description.', 'the text comes from the feed, never the API');
  assert.equal(read(dir, 'sources.json').episodes[0].title, 'The September Shift (with guests)');
  rmSync(dir, { recursive: true });
});

test('a new id while the feed fails: not in sources.json, but in next-episode.json, and the run is green with a warning', async () => {
  const dir = await primed();
  const sourcesBefore = readFileSync(join(dir, 'sources.json'), 'utf8');
  const { messages, warn } = warnings();
  const { fetchImpl, calls } = fakeFetch({
    'feeds/videos.xml': () => respond(404, ''),
    'youtube/v3/playlistItems': () => respond(200, uploadsOf(feedWith('NEWID000001'))),
    'youtube/v3/videos': () => respond(200, upcomingAnswer('NEWID000001')),
  });
  const result = await run({ dir, fetchImpl, apiKey: 'K', now: new Date('2026-10-29T10:10:00Z'), warn, wait: noWait });
  assert.equal(feedCalls(calls), 3, 'three attempts');
  assert.equal(readFileSync(join(dir, 'sources.json'), 'utf8'), sourcesBefore);
  assert.equal(read(dir, 'next-episode.json').episode.videoId, 'NEWID000001');
  assert.equal(result.nextChanged, true);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /feed/i);
  assert.match(messages[0], /404/);
  rmSync(dir, { recursive: true });
});

test('a feed that answers without the new id yet adds nothing, and the next run looks again', async () => {
  const dir = await primed();
  const sourcesBefore = readFileSync(join(dir, 'sources.json'), 'utf8');
  const routes = {
    'feeds/videos.xml': () => respond(200, feedWith()),
    'youtube/v3/playlistItems': () => respond(200, uploadsOf(feedWith('NEWID000001'))),
    'youtube/v3/videos': () => respond(200, upcomingAnswer('NEWID000001')),
  };
  const first = fakeFetch(routes);
  await run({ dir, fetchImpl: first.fetchImpl, apiKey: 'K', now: new Date('2026-10-29T10:10:00Z'), warn: () => {} });
  assert.equal(readFileSync(join(dir, 'sources.json'), 'utf8'), sourcesBefore);
  assert.equal(read(dir, 'next-episode.json').episode.videoId, 'NEWID000001');

  routes['feeds/videos.xml'] = () => respond(200, feedWith('NEWID000001'));
  const second = fakeFetch(routes);
  await run({ dir, fetchImpl: second.fetchImpl, apiKey: 'K', now: new Date('2026-10-29T10:15:00Z'), warn: () => {} });
  assert.equal(feedCalls(second.calls), 1, 'still new, so the feed is read again');
  assert.equal(read(dir, 'sources.json').episodes[0].videoId, 'NEWID000001');
  rmSync(dir, { recursive: true });
});

test('the feed read retries: two failures and then an answer is a green run with no warning', async () => {
  const dir = tempDir();
  let attempt = 0;
  const { fetchImpl, calls } = fakeFetch({
    'feeds/videos.xml': () => (++attempt < 3 ? respond(404, '') : respond(200, feedWith())),
  });
  const waited = [];
  const { messages, warn } = warnings();
  const result = await run({ dir, fetchImpl, now: NOW, warn, wait: async (ms) => { waited.push(ms); } });
  assert.equal(result.changed, true);
  assert.equal(feedCalls(calls), 3);
  assert.equal(waited.length, 2);
  assert.ok(waited[0] >= 10_000 && waited[1] > waited[0], `waits were ${waited}`);
  assert.deepEqual(messages, []);
  assert.equal(read(dir, 'sources.json').episodes.length, 15);
  rmSync(dir, { recursive: true });
});

test('an API failure with a feed that answers is green with a warning, and leaves next-episode.json alone', async () => {
  const dir = tempDir();
  const previous = { version: 1, updatedAt: '2026-10-30T09:00:00Z', episode: { videoId: 'P', title: 'T', state: 'upcoming', scheduledStart: '2026-10-30T11:30:00Z', actualStart: null } };
  writeFileSync(join(dir, 'next-episode.json'), JSON.stringify(previous, null, 2) + '\n');
  const { messages, warn } = warnings();
  const { fetchImpl, calls } = fakeFetch({
    'feeds/videos.xml': () => respond(200, feedWith()),
    'googleapis.com': () => respond(500, 'boom'),
  });
  await run({ dir, fetchImpl, apiKey: 'K', now: new Date('2026-10-30T10:00:00Z'), warn });
  assert.deepEqual(read(dir, 'next-episode.json'), previous);
  assert.equal(feedCalls(calls), 1);
  assert.equal(read(dir, 'sources.json').episodes.length, 15);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /500/);
  rmSync(dir, { recursive: true });
});

test('an API failure and a failing feed is a red run, and the key is in no message', async () => {
  const secret = 'AIzaSy-SECRET-KEY-123';
  const dir = await primed();
  const { messages, warn } = warnings();
  const fetchImpl = async (url) => {
    if (String(url).includes('feeds/videos.xml')) return respond(404, '');
    throw new Error(`connect ECONNREFUSED ${url}`);
  };
  await assert.rejects(() => run({ dir, fetchImpl, apiKey: secret, now: NOW, warn, wait: noWait }), (error) => {
    assert.match(error.message, /404/);
    assert.ok(!error.message.includes(secret) && !String(error.stack).includes(secret), 'the error leaked the key');
    return true;
  });
  assert.ok(messages.length > 0);
  assert.ok(messages.every((m) => !m.includes(secret)), 'a warning leaked the key');
  rmSync(dir, { recursive: true });
});

test('a broken feed fails the run and writes nothing', async () => {
  const dir = tempDir();
  const { fetchImpl, calls } = fakeFetch({ 'feeds/videos.xml': () => respond(200, '<html>blocked</html>') });
  await assert.rejects(() => run({ dir, fetchImpl, now: NOW, wait: noWait }), /not an Atom feed/);
  assert.equal(feedCalls(calls), 3, 'a blocked page is retried like any other failure');
  assert.equal(existsSync(join(dir, 'sources.json')), false);
  assert.equal(existsSync(join(dir, 'episodes.json')), false);
  rmSync(dir, { recursive: true });
});

test('without a key a non-200 feed fails the run after three attempts', async () => {
  const dir = tempDir();
  const { fetchImpl, calls } = fakeFetch({ 'feeds/videos.xml': () => respond(404, '') });
  await assert.rejects(() => run({ dir, fetchImpl, now: NOW, wait: noWait }), /404/);
  assert.equal(feedCalls(calls), 3);
  rmSync(dir, { recursive: true });
});

test('a feed that cannot be reached at all is a failure like any other', async () => {
  const dir = tempDir();
  const fetchImpl = async () => { throw new Error('getaddrinfo ENOTFOUND www.youtube.com'); };
  await assert.rejects(() => run({ dir, fetchImpl, now: NOW, wait: noWait }), /feed/);
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
