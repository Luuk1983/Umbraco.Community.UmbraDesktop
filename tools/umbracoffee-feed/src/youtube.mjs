/**
 * The two YouTube calls the tool makes: the Data API for live state, and oEmbed for titles.
 * Both go through an injected `fetchImpl` so tests never touch the network.
 * @module youtube
 */

/**
 * What the next-episode file needs to know about a video.
 * @typedef {object} DescribedVideo
 * @property {string} videoId The video id.
 * @property {string} title The title as YouTube reports it.
 * @property {'upcoming'|'live'|'ended'} state `ended` also covers a normal upload, which means "not next".
 * @property {string|null} scheduledStart Scheduled start, ISO, or null.
 * @property {string|null} actualStart Actual start, ISO, or null.
 */

/**
 * Maps one `videos.list` item to the shape the state machine uses. An `actualEndTime` wins over
 * `liveBroadcastContent`, because the two can disagree for a while after a stream ends and an
 * ended stream must never be announced as coming up.
 * @param {object} item An item from a `videos.list` answer.
 * @returns {DescribedVideo} The described video.
 */
export function describeVideo(item) {
  const details = item.liveStreamingDetails;
  const broadcast = item.snippet?.liveBroadcastContent;
  let state = 'ended';
  if (details && !details.actualEndTime) {
    if (broadcast === 'live') state = 'live';
    else if (broadcast === 'upcoming') state = 'upcoming';
  }
  return {
    videoId: item.id,
    title: item.snippet?.title ?? '',
    state,
    scheduledStart: details?.scheduledStartTime ?? null,
    actualStart: details?.actualStartTime ?? null,
  };
}

/**
 * Asks `videos.list` about one video (1 quota unit). Every failure is rethrown with a fresh
 * message, never the original: a runtime's network error can carry the request URL, and the URL
 * carries the key, which must not reach a public workflow log.
 * @param {string} videoId The video to look up.
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} options The key and, for tests, a fake fetch.
 * @returns {Promise<DescribedVideo|undefined>} The video, or undefined when the API does not know it.
 * @throws {Error} On a non-200 answer or a network failure, without the key in the message.
 */
export async function fetchVideo(videoId, { apiKey, fetchImpl = fetch }) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new Error(`videos.list for ${videoId} failed: network error`);
  }
  if (response.status !== 200) {
    throw new Error(`videos.list for ${videoId} failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  const item = body?.items?.[0];
  return item ? describeVideo(item) : undefined;
}

/**
 * Reads a video's title from oEmbed, which is keyless and not an API service, so it carries no
 * storage limit. Used where the feed has no title (a backfilled id).
 * @param {string} videoId The video id.
 * @param {typeof fetch} [fetchImpl] A fetch, injectable for tests.
 * @returns {Promise<string|undefined>} The title, or undefined on any failure: a missing title is
 * an ordinary answer for a private or deleted video, not an error.
 */
export async function checkTitle(videoId, fetchImpl = fetch) {
  try {
    const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const response = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${watch}`);
    if (response.status !== 200) return undefined;
    const title = JSON.parse(await response.text()).title;
    return typeof title === 'string' && title !== '' ? title : undefined;
  } catch {
    return undefined;
  }
}
