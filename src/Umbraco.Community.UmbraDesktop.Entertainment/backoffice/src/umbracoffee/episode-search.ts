import type { UmbraCoffeeEpisode } from './types.js';

/**
 * The episode list's search (v2 plan, addenda 2026-10-01), as plain functions over the whole
 * archive. The list holds every episode in memory already (about 349, with no descriptions since
 * version 2), so there is no index to build and nothing to ask a server: a pass over the array per
 * keystroke is far below a frame.
 *
 * One field finds titles, summaries and guest names alike. It replaced a guest dropdown, which at
 * 142 guests was too long a list to be the faster way to a name; typing the name is.
 *
 * Kept out of the element so the rules (what counts as a match, what a row marks, which guest a row
 * leads with) are tested without rendering, and so the element is only how they are shown.
 */

/** One run of a text as a row draws it: either a match, which is marked, or the text around one. */
export interface UmbraCoffeeMarkedPart {
  /** The text, exactly as it was written. */
  text: string;
  /** Whether this run is a match. */
  mark: boolean;
}

/** Unicode's combining diacritical marks, which `normalize('NFD')` splits off a letter like "ë". */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * One piece of text folded for comparison without touching its spacing: decomposed, its accents
 * dropped and lowercased. {@link foldForSearch} is this plus the spacing; {@link markMatches} needs
 * it without, so a folded letter still lines up with the letter it came from.
 * @param text The text.
 * @returns The folded text.
 */
function foldLetters(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * Text folded for comparison: decomposed, its accents dropped, lowercased and its runs of whitespace
 * made single spaces, so "daniel" finds "Daniël" and "  Sam   Smith " is "sam smith". Letters that are
 * not a base letter plus a mark ("ø", "ß") stay as they are.
 * @param text The text.
 * @returns The folded text.
 */
export function foldForSearch(text: string): string {
  return foldLetters(text).replace(/\s+/g, ' ').trim();
}

/**
 * The words of a search, folded, blanks dropped.
 * @param query What was typed.
 * @returns The words.
 */
function wordsOf(query: string): string[] {
  return foldForSearch(query)
    .split(' ')
    .filter((word) => word !== '');
}

/**
 * Each episode's searchable text, folded once and kept for as long as the episode object lives. The
 * store hands out the same objects until the next answer, so typing does not refold the archive.
 */
const haystacks = new WeakMap<UmbraCoffeeEpisode, string>();

/**
 * What a search looks in for one episode: the title, the summary and the guests' names, folded. Not
 * the affiliation: it names a company, and searching "Umbraco" would then find every HQ guest's
 * episodes rather than the episodes about it.
 * @param episode The episode.
 * @returns The folded text.
 */
function haystack(episode: UmbraCoffeeEpisode): string {
  let text = haystacks.get(episode);
  if (text === undefined) {
    text = foldForSearch([episode.title, episode.summary, ...episode.guests.map((g) => g.name)].join('\n'));
    haystacks.set(episode, text);
  }
  return text;
}

/**
 * The episodes that match a search, in the archive's own order (newest first).
 * @param episodes The archive.
 * @param query What was typed. Every word in it must appear somewhere in an episode's title, summary
 *   or guest names; an empty or blank query matches everything.
 * @returns The matches. The archive itself when nothing filters, so an unfiltered list costs nothing.
 */
export function matchEpisodes(episodes: UmbraCoffeeEpisode[], query: string): UmbraCoffeeEpisode[] {
  const words = wordsOf(query);
  if (words.length === 0) return episodes;
  return episodes.filter((episode) => {
    const text = haystack(episode);
    return words.every((word) => text.includes(word));
  });
}

/**
 * A text cut into runs, the places a search's words appear in it marked, the way the mock marks a
 * match in a row. Compared folded, as the search is, but cut on the text as written: the folded text
 * is built letter by letter with each folded letter remembering which written letter it came from, so
 * "daniel" marks the "Daniël" on the page and not a shifted one.
 *
 * Every word is marked wherever it appears, and runs that touch or overlap become one, so "spo spook"
 * marks "Spook" once.
 * @param text The text as written.
 * @param query What was typed.
 * @returns The runs, in order. One unmarked run when nothing matches.
 */
export function markMatches(text: string, query: string): UmbraCoffeeMarkedPart[] {
  const words = wordsOf(query);
  if (words.length === 0 || text === '') return [{ text, mark: false }];
  let folded = '';
  const from: Array<{ start: number; end: number }> = [];
  let at = 0;
  for (const letter of text) {
    const fold = foldLetters(letter);
    for (let i = 0; i < fold.length; i++) from.push({ start: at, end: at + letter.length });
    folded += fold;
    at += letter.length;
  }
  const ranges: Array<[number, number]> = [];
  for (const word of words) {
    for (let found = folded.indexOf(word); found >= 0; found = folded.indexOf(word, found + 1)) {
      ranges.push([from[found]!.start, from[found + word.length - 1]!.end]);
    }
  }
  if (ranges.length === 0) return [{ text, mark: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  const parts: UmbraCoffeeMarkedPart[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), mark: false });
    parts.push({ text: text.slice(start, end), mark: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), mark: false });
  return parts;
}

/**
 * The guests' names a row shows, in the episode's order, except that while searching the ones the
 * search found come first: a row cut to two names would otherwise hide the very name that put it in
 * the results. Blank names are left out.
 * @param episode The episode.
 * @param query What was typed, or an empty string.
 * @returns The names.
 */
export function guestNamesFor(episode: UmbraCoffeeEpisode, query: string): string[] {
  const names = episode.guests.map((g) => g.name.replace(/\s+/g, ' ').trim()).filter((name) => name !== '');
  const words = wordsOf(query);
  if (words.length === 0) return names;
  const found = (name: string) => {
    const folded = foldForSearch(name);
    return words.some((word) => folded.includes(word));
  };
  return [...names.filter(found), ...names.filter((name) => !found(name))];
}
