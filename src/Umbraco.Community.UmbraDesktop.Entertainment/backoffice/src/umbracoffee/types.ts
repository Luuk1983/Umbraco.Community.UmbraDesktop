/**
 * What umbraCoffee's two data files contain, as types and runtime checks, and what the store hands
 * out once it has read them.
 *
 * The shapes are design §3's JSON, with `episodes.json` at version 2 (v2 plan, addendum 2026-10-01:
 * summaries and guests in place of the descriptions). They are written out here rather than generated
 * because the files are two small documents on a GitHub branch and there is no client to generate.
 */

/** Someone the episode had on, as the details step read them from the description. */
export interface UmbraCoffeeGuest {
  /** The guest's name as written for them, accents and all. */
  name: string;
  /** Who they were there for (a company, a project), or null when the description did not say. */
  affiliation: string | null;
}

/** One entry of `episodes.json` version 2. */
export interface UmbraCoffeeEpisode {
  /** YouTube's id for the video, which is also what the embed, the chat and the thumbnail are addressed by. */
  videoId: string;
  /** The episode's title, without the "umbraCoffee - " prefix the Action strips. */
  title: string;
  /** ISO time the feed gives. For a stream that can be the upload moment, a day off at worst (design E8). */
  published: string;
  /** A sentence or two on what the episode covers. Empty when there is none yet: the details step lags the feed. */
  summary: string;
  /** The guests by name, in the order the description gave them. Empty when none were named. */
  guests: UmbraCoffeeGuest[];
  /** True when the description says there were guests without naming them. */
  guestsUnnamed: boolean;
  /** True when the details step was not sure of what it read. The app shows the episode as it is either way. */
  uncertain: boolean;
}

/** The episode in `next-episode.json`: upcoming or live. An ended stream is not current; it is an episode. */
export interface UmbraCoffeeCurrent {
  /** YouTube's id for the video. */
  videoId: string;
  /** The episode's title as YouTube shows it. */
  title: string;
  /** Upcoming or live. */
  state: 'upcoming' | 'live';
  /** ISO time it is scheduled to start; null or absent when YouTube gave none. */
  scheduledStart?: string | null;
  /** ISO time it actually started; null or absent while upcoming. */
  actualStart?: string | null;
}

/** `episodes.json` (design §3.1, version 2 from the addendum). */
export interface UmbraCoffeeEpisodesFile {
  /** The format version; the client reads only 2. The data branch never carries a 1 again. */
  version: 2;
  /** When the Action last wrote the list, ISO. */
  generatedAt: string;
  /** Newest first. */
  episodes: UmbraCoffeeEpisode[];
}

/** `next-episode.json` (design §3.2). */
export interface UmbraCoffeeNextFile {
  /** The format version; the client reads only 1. */
  version: 1;
  /** When the Action last confirmed `episode`, ISO. Written on every run while `episode` is set. */
  updatedAt: string;
  /** What is upcoming or live, or null when nothing is: its normal state. */
  episode: UmbraCoffeeCurrent | null;
}

/**
 * What the store holds: both files, or the snapshot, and how it got them.
 */
export interface UmbraCoffeeData {
  /** The episodes, newest first. From `episodes.json`, or the last good list, or the shipped snapshot. */
  episodes: UmbraCoffeeEpisode[];
  /** `null` when the file said nothing is coming up, and also when the file could not be read (then `offline` is set). */
  current: UmbraCoffeeCurrent | null;
  /** `next-episode.json`'s `updatedAt`, epoch ms; undefined when there is no file answer. */
  currentUpdatedAt?: number;
  /** True when either file could not be fetched or was not valid: the window says so and the cup hides (design E6). */
  offline: boolean;
  /** When the episode list was generated (or the snapshot taken), ISO; for "Showing episodes up to ...". */
  episodesAsOf: string | null;
  /** When this browser received this data, epoch ms by its own clock. */
  receivedAt: number;
}

/**
 * Whether a value is an optional string: absent, null or text.
 * @param value The field.
 * @returns True when it can be read as an optional string.
 */
function isOptionalString(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

/**
 * Whether one entry of an episode's `guests` is a guest. `affiliation` must be present, as text or
 * null, because the file always writes it and an absent one means a writer that does not follow it.
 * @param value The entry.
 * @returns True when it can be shown and searched.
 */
function isGuest(value: unknown): value is UmbraCoffeeGuest {
  const g = value as Partial<UmbraCoffeeGuest> | null;
  return typeof g?.name === 'string' && (g.affiliation === null || typeof g.affiliation === 'string');
}

/**
 * Whether one entry of `episodes` is an episode. Every version 2 field is required: the file is
 * rebuilt whole by one tool, so a missing field is a wrong file rather than an older one.
 * @param value The entry.
 * @returns True when every field the window, the list and the search read is there.
 */
export function isEpisode(value: unknown): value is UmbraCoffeeEpisode {
  const e = value as Partial<UmbraCoffeeEpisode> | null;
  return (
    typeof e?.videoId === 'string' &&
    typeof e.title === 'string' &&
    typeof e.published === 'string' &&
    typeof e.summary === 'string' &&
    Array.isArray(e.guests) &&
    e.guests.every(isGuest) &&
    typeof e.guestsUnnamed === 'boolean' &&
    typeof e.uncertain === 'boolean'
  );
}

/**
 * Whether `episode` is a current episode. Its `state` is checked by value, not only by type, because a
 * state the client has no rule for (an `ended` from a newer format, say) must not reach the schedule.
 * @param value The `episode` field.
 * @returns True when it can be used.
 */
function isCurrent(value: unknown): value is UmbraCoffeeCurrent {
  const c = value as Partial<UmbraCoffeeCurrent> | null;
  return (
    typeof c?.videoId === 'string' &&
    typeof c.title === 'string' &&
    (c.state === 'upcoming' || c.state === 'live') &&
    isOptionalString(c.scheduledStart) &&
    isOptionalString(c.actualStart)
  );
}

/**
 * Whether a fetched body is an `episodes.json`. The body crosses a network, so the shape is checked
 * rather than trusted: anything else is treated like no answer at all, which the store already survives.
 * Version 1 (descriptions, no summaries) is refused like any other: only 2 is ever on the branch now.
 * @param value The parsed body.
 * @returns True when it can be used.
 */
export function isEpisodesFile(value: unknown): value is UmbraCoffeeEpisodesFile {
  const v = value as Partial<UmbraCoffeeEpisodesFile> | null;
  return (
    !!v && v.version === 2 && typeof v.generatedAt === 'string' && Array.isArray(v.episodes) && v.episodes.every(isEpisode)
  );
}

/**
 * Whether a fetched body is a `next-episode.json`. An `episode` in a state the client has no rule for
 * makes the whole file invalid rather than "nothing current", so it counts as no answer and the window
 * says offline instead of quietly claiming there is nothing on.
 * @param value The parsed body.
 * @returns True when it can be used.
 */
export function isNextEpisodeFile(value: unknown): value is UmbraCoffeeNextFile {
  const v = value as Partial<UmbraCoffeeNextFile> | null;
  return (
    !!v && v.version === 1 && typeof v.updatedAt === 'string' && v.episode !== undefined && (v.episode === null || isCurrent(v.episode))
  );
}
