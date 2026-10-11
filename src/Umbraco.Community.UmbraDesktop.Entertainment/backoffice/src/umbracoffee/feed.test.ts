import { expect } from '@open-wc/testing';
import { UMBRACOFFEE_DATA_BASE_URL } from './constants.js';
import { fetchFeed } from './feed.js';

/**
 * `fetchFeed` reads two files off GitHub and must never throw: each file is either good or
 * `undefined`, independently, so the store can decide what half an answer means.
 */

/** A valid `episodes.json` body, version 2. */
const episodes = {
  version: 2,
  generatedAt: '2026-09-30T09:00:00Z',
  episodes: [
    { videoId: 'v0', title: 'September', published: '2026-09-25T11:27:38Z', summary: '', guests: [], guestsUnnamed: false, uncertain: false },
  ],
};

/** A valid `next-episode.json` body with nothing coming up. */
const next = { version: 1, updatedAt: '2026-10-30T11:05:00Z', episode: null };

/** What a fake fetch does for one URL: a body, a status, or a rejection. */
type Reply = { body?: unknown; text?: string; status?: number; reject?: boolean };

/**
 * A fetch that answers by the file name at the end of the URL, and records what it was asked.
 * @param replies What to do for `episodes.json` and `next-episode.json`.
 * @returns The fetch and the URLs it was asked for.
 */
function fakeFetch(replies: { episodes: Reply; next: Reply }) {
  const asked: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const reply = url.endsWith('/episodes.json') ? replies.episodes : replies.next;
    if (reply.reject) throw new TypeError('Failed to fetch');
    const status = reply.status ?? 200;
    const text = reply.text ?? JSON.stringify(reply.body);
    return new Response(text, { status });
  }) as typeof fetch;
  return { fetchImpl, asked };
}

it('reads both files from the data branch', async () => {
  const { fetchImpl, asked } = fakeFetch({ episodes: { body: episodes }, next: { body: next } });
  const result = await fetchFeed(fetchImpl);
  expect(result.episodes).to.deep.equal(episodes);
  expect(result.next).to.deep.equal(next);
  expect(asked.sort()).to.deep.equal(
    [`${UMBRACOFFEE_DATA_BASE_URL}/episodes.json`, `${UMBRACOFFEE_DATA_BASE_URL}/next-episode.json`].sort(),
  );
});

it('gives the other file when one is a 404', async () => {
  const { fetchImpl } = fakeFetch({ episodes: { body: episodes }, next: { status: 404, text: '404: Not Found' } });
  const result = await fetchFeed(fetchImpl);
  expect(result.episodes).to.deep.equal(episodes);
  expect(result.next === undefined).to.equal(true);
});

it('treats invalid JSON as no file', async () => {
  const { fetchImpl } = fakeFetch({ episodes: { text: '<html>proxy says no</html>' }, next: { body: next } });
  const result = await fetchFeed(fetchImpl);
  expect(result.episodes === undefined).to.equal(true);
  expect(result.next).to.deep.equal(next);
});

it('treats a body that fails its guard as no file', async () => {
  const { fetchImpl } = fakeFetch({
    episodes: { body: { ...episodes, version: 1 } },
    next: { body: { ...next, episode: { videoId: 'v', title: 't', state: 'ended' } } },
  });
  const result = await fetchFeed(fetchImpl);
  expect(result.episodes === undefined).to.equal(true);
  expect(result.next === undefined).to.equal(true);
});

it('treats a network failure as no file and never throws', async () => {
  const { fetchImpl } = fakeFetch({ episodes: { reject: true }, next: { reject: true } });
  const result = await fetchFeed(fetchImpl);
  expect(result.episodes === undefined).to.equal(true);
  expect(result.next === undefined).to.equal(true);
});

it('survives a fetch that throws before it returns a promise', async () => {
  const result = await fetchFeed((() => {
    throw new Error('blocked');
  }) as typeof fetch);
  expect(result.episodes === undefined && result.next === undefined).to.equal(true);
});
