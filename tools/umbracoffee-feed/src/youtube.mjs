/**
 * The YouTube calls the tool makes: the Data API for live state, for what is new, and for the
 * description report, and oEmbed for titles. All go through an injected `fetchImpl` so tests never
 * touch the network. Nothing the Data API answers about text is ever stored: it is compared and dropped.
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
 * A video's text as the API reports it, for comparing with what the feed gave us. Never stored.
 * @typedef {object} VideoText
 * @property {string} title The title, prefix and all.
 * @property {string} description The full description.
 */

/**
 * One Data API call. Every failure is rethrown with a fresh message, never the original: a
 * runtime's network error can carry the request URL, and the URL carries the key, which must not
 * reach a public workflow log.
 * @param {string} url The full request URL, key included.
 * @param {string} what What the call is, for the message, for example `videos.list for abc`.
 * @param {typeof fetch} fetchImpl The fetch to use.
 * @returns {Promise<any>} The parsed answer.
 * @throws {Error} On a non-200 answer or a network failure, without the key in the message.
 */
async function askApi(url, what, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new Error(`${what} failed: network error`);
  }
  if (response.status !== 200) {
    throw new Error(`${what} failed with HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Asks `videos.list` about one video (1 quota unit).
 * @param {string} videoId The video to look up.
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} options The key and, for tests, a fake fetch.
 * @returns {Promise<DescribedVideo|undefined>} The video, or undefined when the API does not know it.
 * @throws {Error} On a non-200 answer or a network failure, without the key in the message.
 */
export async function fetchVideo(videoId, { apiKey, fetchImpl = fetch }) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
  const body = await askApi(url, `videos.list for ${videoId}`, fetchImpl);
  const item = body?.items?.[0];
  return item ? describeVideo(item) : undefined;
}

/**
 * How many uploads a run compares: what the feed lists. An older upload the feed cannot fix, so
 * comparing it could only ever say "changed" and send every run to the feed for nothing.
 */
export const NEWEST = 15;

/**
 * Asks `playlistItems.list` for a channel's newest uploads (1 quota unit). The uploads playlist is
 * the channel id with `UU` in place of `UC`, and it lists a scheduled stream before it airs
 * (measured 2026-10-17, feed reliability design), which is what lets the API say an episode is new
 * while the feed is down.
 * @param {string} channelId The channel, `UC...`.
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} options The key and, for tests, a fake fetch.
 * @returns {Promise<Array<{videoId: string} & VideoText>>} At most {@link NEWEST} uploads, newest first.
 * @throws {Error} On a non-200 answer or a network failure, without the key in the message.
 */
export async function latestUploads(channelId, { apiKey, fetchImpl = fetch }) {
  const playlistId = `UU${channelId.replace(/^UC/, '')}`;
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${NEWEST}&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}`;
  const body = await askApi(url, 'playlistItems.list for the uploads', fetchImpl);
  return (body?.items ?? []).slice(0, NEWEST).map((item) => ({
    videoId: item.snippet?.resourceId?.videoId ?? '',
    title: item.snippet?.title ?? '',
    description: item.snippet?.description ?? '',
  })).filter((upload) => upload.videoId !== '');
}

/** The most ids `videos.list` takes in one call. */
const IDS_PER_CALL = 50;

/**
 * Asks `videos.list` for the title and description of many videos, {@link IDS_PER_CALL} per call
 * (1 quota unit each). For the local description report only: the Action never calls it.
 * @param {string[]} ids The videos.
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} options The key and, for tests, a fake fetch.
 * @returns {Promise<Map<string, VideoText>>} Every video the API knows, by id. A deleted or private one is absent.
 * @throws {Error} On a non-200 answer or a network failure, without the key in the message.
 */
export async function fetchSnippets(ids, { apiKey, fetchImpl = fetch }) {
  const snippets = new Map();
  for (let start = 0; start < ids.length; start += IDS_PER_CALL) {
    const batch = ids.slice(start, start + IDS_PER_CALL);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.map(encodeURIComponent).join(',')}&key=${encodeURIComponent(apiKey)}`;
    const body = await askApi(url, `videos.list for ${batch.length} videos`, fetchImpl);
    for (const item of body?.items ?? []) {
      snippets.set(item.id, { title: item.snippet?.title ?? '', description: item.snippet?.description ?? '' });
    }
  }
  return snippets;
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
