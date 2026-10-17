import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeVideo, fetchVideo, checkTitle, latestUploads, fetchSnippets } from '../src/youtube.mjs';
import { fixture, respond, fakeFetch } from './helpers.mjs';

const item = (name) => JSON.parse(fixture(name)).items[0];

test('an upcoming broadcast maps to state upcoming with its scheduled start', () => {
  assert.deepEqual(describeVideo(item('videos-upcoming.json')), {
    videoId: 'UPCOMING001',
    title: 'umbraCoffee - The October Edition',
    state: 'upcoming',
    scheduledStart: '2026-10-30T11:30:00Z',
    actualStart: null,
  });
});

test('a live broadcast carries its actual start', () => {
  const video = describeVideo(item('videos-live.json'));
  assert.equal(video.state, 'live');
  assert.equal(video.actualStart, '2026-10-30T11:34:10Z');
});

test('an actualEndTime means ended, whatever liveBroadcastContent says', () => {
  assert.equal(describeVideo(item('videos-ended.json')).state, 'ended');
  const stale = item('videos-live.json');
  stale.liveStreamingDetails.actualEndTime = '2026-10-30T12:40:00Z';
  assert.equal(describeVideo(stale).state, 'ended');
});

test('a normal upload with no liveStreamingDetails is ended, meaning not next', () => {
  const video = describeVideo({ id: 'V', snippet: { title: 'T', liveBroadcastContent: 'none' } });
  assert.equal(video.state, 'ended');
  assert.equal(video.scheduledStart, null);
});

test('fetchVideo asks videos.list for snippet and liveStreamingDetails and returns the description', async () => {
  const { fetchImpl, calls } = fakeFetch({ 'googleapis.com': () => respond(200, fixture('videos-upcoming.json')) });
  const video = await fetchVideo('UPCOMING001', { apiKey: 'K', fetchImpl });
  assert.equal(video.state, 'upcoming');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('https://www.googleapis.com/youtube/v3/videos?'));
  assert.ok(calls[0].includes('part=snippet,liveStreamingDetails') || calls[0].includes('part=snippet%2CliveStreamingDetails'));
  assert.ok(calls[0].includes('id=UPCOMING001'));
});

test('fetchVideo returns undefined when the video is gone', async () => {
  const { fetchImpl } = fakeFetch({ 'googleapis.com': () => respond(200, fixture('videos-none.json')) });
  assert.equal(await fetchVideo('GONE', { apiKey: 'K', fetchImpl }), undefined);
});

test('a non-200 throws an error that never contains the key', async () => {
  const secret = 'AIzaSy-SECRET-KEY-123';
  const { fetchImpl } = fakeFetch({ 'googleapis.com': () => respond(403, `{"error":"bad key ${secret}"}`) });
  await assert.rejects(
    () => fetchVideo('X', { apiKey: secret, fetchImpl }),
    (error) => {
      assert.match(error.message, /403/);
      assert.ok(!error.message.includes(secret), 'the message leaked the key');
      assert.ok(!String(error.stack).includes(secret), 'the stack leaked the key');
      return true;
    },
  );
});

test('a network failure also throws without the key, even if the runtime put the URL in its message', async () => {
  const secret = 'AIzaSy-SECRET-KEY-123';
  const fetchImpl = async (url) => {
    throw new Error(`connect ECONNREFUSED ${url}`);
  };
  await assert.rejects(
    () => fetchVideo('X', { apiKey: secret, fetchImpl }),
    (error) => {
      assert.ok(!error.message.includes(secret));
      return true;
    },
  );
});

test('checkTitle returns the oEmbed title', async () => {
  const { fetchImpl, calls } = fakeFetch({ 'youtube.com/oembed': () => respond(200, '{"title":"umbraCoffee - Hello"}') });
  assert.equal(await checkTitle('abc', fetchImpl), 'umbraCoffee - Hello');
  assert.ok(calls[0].includes('format=json'));
  assert.ok(calls[0].includes(encodeURIComponent('https://www.youtube.com/watch?v=abc')));
});

test('checkTitle returns undefined on a non-200, bad JSON or a network failure', async () => {
  assert.equal(await checkTitle('a', fakeFetch({ oembed: () => respond(404, 'Not Found') }).fetchImpl), undefined);
  assert.equal(await checkTitle('a', fakeFetch({ oembed: () => respond(200, 'not json') }).fetchImpl), undefined);
  assert.equal(await checkTitle('a', async () => { throw new Error('offline'); }), undefined);
});

/** A `playlistItems.list` answer with one item per id, in the order given. */
function playlist(ids) {
  return JSON.stringify({
    items: ids.map((id) => ({ snippet: { title: `umbraCoffee - ${id}`, description: `About ${id}.`, resourceId: { kind: 'youtube#video', videoId: id } } })),
  });
}

test('latestUploads asks for the newest 15 of the uploads playlist, UU plus the channel id without UC', async () => {
  const { fetchImpl, calls } = fakeFetch({ 'youtube/v3/playlistItems': () => respond(200, playlist(['A', 'B'])) });
  const uploads = await latestUploads('UCF_Ene5-58a3Z55aw8O6Djg', { apiKey: 'K', fetchImpl });
  assert.deepEqual(uploads, [
    { videoId: 'A', title: 'umbraCoffee - A', description: 'About A.' },
    { videoId: 'B', title: 'umbraCoffee - B', description: 'About B.' },
  ]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('https://www.googleapis.com/youtube/v3/playlistItems?'));
  assert.ok(calls[0].includes('playlistId=UUF_Ene5-58a3Z55aw8O6Djg'));
  assert.ok(calls[0].includes('part=snippet&'));
  assert.ok(calls[0].includes('maxResults=15'));
});

test('latestUploads keeps only the first 15, whatever the answer holds', async () => {
  const ids = Array.from({ length: 20 }, (_, i) => `V${i}`);
  const { fetchImpl } = fakeFetch({ playlistItems: () => respond(200, playlist(ids)) });
  const uploads = await latestUploads('UCx', { apiKey: 'K', fetchImpl });
  assert.deepEqual(uploads.map((u) => u.videoId), ids.slice(0, 15));
});

test('latestUploads throws without the key, on a non-200 and on a network failure', async () => {
  const secret = 'AIzaSy-SECRET-KEY-123';
  const check = (pattern) => (error) => {
    assert.match(error.message, pattern);
    assert.ok(!error.message.includes(secret), 'the message leaked the key');
    assert.ok(!String(error.stack).includes(secret), 'the stack leaked the key');
    return true;
  };
  const refused = fakeFetch({ playlistItems: () => respond(403, `{"error":"bad key ${secret}"}`) }).fetchImpl;
  await assert.rejects(() => latestUploads('UCx', { apiKey: secret, fetchImpl: refused }), check(/403/));
  const offline = async (url) => { throw new Error(`connect ECONNREFUSED ${url}`); };
  await assert.rejects(() => latestUploads('UCx', { apiKey: secret, fetchImpl: offline }), check(/network/));
});

test('fetchSnippets asks videos.list for snippets 50 ids at a time and maps every answer by id', async () => {
  const ids = Array.from({ length: 120 }, (_, i) => `V${i}`);
  const asked = [];
  const fetchImpl = async (url) => {
    const batch = new URL(url).searchParams.get('id').split(',');
    asked.push({ url: String(url), batch });
    return respond(200, JSON.stringify({ items: batch.filter((id) => id !== 'V7').map((id) => ({ id, snippet: { title: `T ${id}`, description: `D ${id}` } })) }));
  };
  const snippets = await fetchSnippets(ids, { apiKey: 'K', fetchImpl });
  assert.deepEqual(asked.map((a) => a.batch.length), [50, 50, 20]);
  assert.ok(asked.every((a) => a.url.startsWith('https://www.googleapis.com/youtube/v3/videos?') && new URL(a.url).searchParams.get('part') === 'snippet'));
  assert.equal(snippets.size, 119, 'a video YouTube does not know is simply absent');
  assert.deepEqual(snippets.get('V42'), { title: 'T V42', description: 'D V42' });
  assert.equal(snippets.has('V7'), false);
});

test('fetchSnippets throws without the key in the message', async () => {
  const secret = 'AIzaSy-SECRET-KEY-123';
  const offline = async (url) => { throw new Error(`connect ECONNREFUSED ${url}`); };
  await assert.rejects(() => fetchSnippets(['A'], { apiKey: secret, fetchImpl: offline }), (error) => {
    assert.ok(!error.message.includes(secret));
    return true;
  });
  const refused = fakeFetch({ 'googleapis.com': () => respond(500, secret) }).fetchImpl;
  await assert.rejects(() => fetchSnippets(['A'], { apiKey: secret, fetchImpl: refused }), (error) => {
    assert.match(error.message, /500/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});
