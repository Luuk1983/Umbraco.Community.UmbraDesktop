/**
 * The next-episode state machine (design section 4, steps 3 and 4), kept a pure function so every
 * branch is testable without a clock, a network or a file.
 * @module next-episode
 */

/**
 * How long past its scheduled start an upcoming stream may sit before it counts as abandoned.
 * The channel has one such stream from 2020 (issue 114); without a limit it would be "next" forever.
 */
export const ABANDONED_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Formats a date the way every file in the data branch does: UTC ISO without milliseconds.
 * @param {Date} date The moment.
 * @returns {string} For example `2026-09-30T09:00:00Z`.
 */
function iso(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The file's empty state, which is its normal one.
 * @param {Date} now Used for `updatedAt`.
 * @returns {{version: number, updatedAt: string, episode: null}} A next-episode file holding nothing.
 */
export function emptyNextFile(now) {
  return { version: 1, updatedAt: iso(now), episode: null };
}

/**
 * Builds the episode object with a fixed key order, so equal data is byte-equal data.
 * @param {import('./youtube.mjs').DescribedVideo} video The described video.
 * @returns {object} The file's `episode` value.
 */
function toEpisode(video) {
  return {
    videoId: video.videoId,
    title: video.title,
    state: video.state,
    scheduledStart: video.scheduledStart ?? null,
    actualStart: video.actualStart ?? null,
  };
}

/**
 * Whether a described video may be "next": it must be upcoming or live, and an upcoming one must
 * not be abandoned. A live stream is never abandoned, however long ago it was scheduled.
 * @param {import('./youtube.mjs').DescribedVideo|undefined} video The video, or undefined when unknown.
 * @param {Date} now The current moment.
 * @returns {boolean} True when it can be written to the file.
 */
function isCandidate(video, now) {
  if (!video) return false;
  if (video.state === 'live') return true;
  if (video.state !== 'upcoming') return false;
  if (!video.scheduledStart) return true;
  return now.getTime() - Date.parse(video.scheduledStart) <= ABANDONED_AFTER_MS;
}

/**
 * Decides what `next-episode.json` should hold after this run.
 * @param {object} args The inputs.
 * @param {{version: number, updatedAt: string, episode: object|null}|null} args.previous The file as it is now, or null when there is none.
 * @param {string[]} args.newIds Ids that just appeared in the feed.
 * @param {((id: string) => import('./youtube.mjs').DescribedVideo|undefined)|null} args.lookup Answers from the API for the ids asked about, or null when there is no key.
 * @param {Date} args.now The current moment.
 * @returns {{ file: {version: number, updatedAt: string, episode: object|null}, changed: boolean }} The new content and whether it differs from `previous`. While an episode is set `updatedAt` moves every run, so that is always a change: the heartbeat is how the browser knows the file is fresh.
 */
export function nextEpisode({ previous, newIds, lookup, now }) {
  const ids = [];
  if (previous?.episode?.videoId) ids.push(previous.episode.videoId);
  for (const id of newIds) if (!ids.includes(id)) ids.push(id);

  const candidates = lookup ? ids.map((id) => lookup(id)).filter((video) => isCandidate(video, now)) : [];
  candidates.sort((a, b) => {
    const at = a.scheduledStart ? Date.parse(a.scheduledStart) : Infinity;
    const bt = b.scheduledStart ? Date.parse(b.scheduledStart) : Infinity;
    return at - bt;
  });

  let file;
  if (candidates.length > 0) {
    file = { version: 1, updatedAt: iso(now), episode: toEpisode(candidates[0]) };
  } else if (previous && previous.episode === null) {
    // Empty stays empty with its old stamp, so an idle channel produces no commits at all.
    file = { version: 1, updatedAt: previous.updatedAt, episode: null };
  } else {
    file = emptyNextFile(now);
  }
  const changed = JSON.stringify(file) !== JSON.stringify(previous);
  return { file, changed };
}
