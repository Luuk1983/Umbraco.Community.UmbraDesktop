/**
 * The source list (`sources.json`): cleaning titles, merging new entries in without disturbing old
 * ones, and refreshing the text of the ones the feed still lists.
 * @module episodes
 */

/**
 * One entry of `sources.json`, the shape the v1 `episodes.json` had (design section 3.1).
 * @typedef {object} Episode
 * @property {string} videoId The YouTube video id.
 * @property {string} title The title without the channel prefix.
 * @property {string} published The upload moment, UTC ISO.
 * @property {string} description The full description.
 */

/**
 * Removes the "umbraCoffee - " channel prefix so the list does not repeat the app's name on every
 * row. A title without the prefix is returned as it came, apart from trimming.
 * @param {string} title The raw title.
 * @returns {string} The title without the prefix.
 */
export function stripPrefix(title) {
  const trimmed = title.trim();
  const stripped = trimmed.replace(/^umbraCoffee\s*[-–—]\s*/i, '');
  return stripped === '' ? trimmed : stripped;
}

/**
 * Normalises any date the feed or a CSV might carry to UTC ISO without milliseconds, the one shape
 * the data files use, so the same instant never produces two different bytes.
 * @param {string} value A date string the `Date` constructor understands.
 * @returns {string} For example `2026-09-25T11:27:38Z`.
 * @throws {Error} When the value is not a date.
 */
export function toIsoUtc(value) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw new Error(`Not a date: ${value}`);
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Adds entries whose id is not yet known. Existing entries are never edited or reordered here:
 * {@link refreshFromFeed} owns text changes, and keeping the two apart keeps each one's result
 * easy to read. Each newcomer goes in before the first existing entry that is older,
 * so newest-first holds without touching the order of what was already there.
 * @param {Episode[]} existing The current list.
 * @param {Array<{videoId: string, title: string, published: string, description?: string}>} entries Candidates, typically the feed.
 * @returns {{ episodes: Episode[], added: string[], changed: boolean }} The merged list, the new ids, and whether anything was added.
 */
export function mergeEpisodes(existing, entries) {
  const known = new Set(existing.map((e) => e.videoId));
  const fresh = [];
  for (const entry of entries) {
    if (known.has(entry.videoId)) continue;
    known.add(entry.videoId);
    fresh.push({
      videoId: entry.videoId,
      title: stripPrefix(entry.title),
      published: toIsoUtc(entry.published),
      description: entry.description ?? '',
    });
  }
  fresh.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));

  const episodes = [...existing];
  for (const episode of fresh) {
    const at = episodes.findIndex((e) => Date.parse(e.published) < Date.parse(episode.published));
    if (at === -1) episodes.push(episode);
    else episodes.splice(at, 0, episode);
  }
  return { episodes, added: fresh.map((e) => e.videoId), changed: fresh.length > 0 };
}

/**
 * Brings the title and description of every already-known episode that is still in the feed up to
 * date, because a host who fixes a description on YouTube should see the fix, and a changed
 * description is what makes an episode's details to do again. `published` is never moved: the list
 * is sorted by it. Entries the feed no longer lists are never touched, since the feed's silence about
 * an old episode says nothing about it. A feed entry with no title keeps the stored one.
 * @param {Episode[]} existing The current list.
 * @param {Array<{videoId: string, title: string, description?: string}>} entries The feed's entries.
 * @returns {{ episodes: Episode[], updated: string[], changed: boolean }} The list (unchanged entries are the same objects), the ids that changed, and whether any did.
 */
export function refreshFromFeed(existing, entries) {
  const feed = new Map(entries.map((entry) => [entry.videoId, entry]));
  const updated = [];
  const episodes = existing.map((episode) => {
    const entry = feed.get(episode.videoId);
    if (!entry) return episode;
    const title = entry.title.trim() === '' ? episode.title : stripPrefix(entry.title);
    const description = entry.description ?? episode.description;
    if (title === episode.title && description === episode.description) return episode;
    updated.push(episode.videoId);
    return { ...episode, title, description };
  });
  return { episodes, updated, changed: updated.length > 0 };
}
