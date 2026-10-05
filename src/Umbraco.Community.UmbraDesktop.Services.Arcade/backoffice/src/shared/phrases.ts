import type { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import type { UmbraDesktopGameLeaderboard } from '../games/game-manifest.js';
import { AREA } from './area.js';
import { MINUTE_MS, formatScore } from './format.js';

/**
 * Everything the Arcade says about a rank, a rule, a unit or a gap, in one module, so the result
 * card, the panel, the hub and the toasts cannot word the same thing two ways.
 *
 * Each function takes the caller's localizer (an element's `this.localize`, or the context's own) so
 * the words follow the backoffice language, and each falls back to English when the dictionary is
 * missing, as every Arcade string does.
 */

/** The part of Umbraco's localization controller the phrases use. */
export type Localize = Pick<UmbLocalizationController, 'termOrDefault' | 'lang' | 'string'>;

/**
 * Fill `{0}`, `{1}` and so on, the way Umbraco fills a dictionary term. Needed for the fallback:
 * `termOrDefault` returns its default untouched when the key is missing (17.7.0,
 * `localization.controller.js`), so a fallback with placeholders would show them raw.
 * @param template The text with placeholders.
 * @param args The values, by position.
 * @returns The filled text; a placeholder without a value stays as it is.
 */
export function fill(template: string, args: ReadonlyArray<unknown>): string {
  return template.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = args[Number(index)];
    return value === undefined ? match : String(value);
  });
}

/**
 * One of the Arcade's sentences: the dictionary's when it has the key, otherwise the English given
 * here, filled in either case.
 * @param localize The localizer.
 * @param key The key within the `umbraDesktopArcade` area.
 * @param english The English, with `{0}` placeholders.
 * @param args The values.
 * @returns The sentence.
 */
export function say(localize: Localize, key: string, english: string, ...args: unknown[]): string {
  return localize.termOrDefault(`${AREA}_${key}`, fill(english, args), ...(args as never[]));
}

/** The plural categories an ordinal can fall in, as `Intl.PluralRules` names them. */
export type OrdinalCategory = 'one' | 'two' | 'few' | 'other';

/**
 * Which ordinal form a rank takes in a language: English has four (1st, 2nd, 3rd, 4th), Dutch one (3e).
 * @param rank The rank.
 * @param lang A BCP 47 language tag, such as the backoffice's.
 * @returns The category, `other` for anything the language does not distinguish or cannot be read.
 */
export function ordinalCategory(rank: number, lang: string): OrdinalCategory {
  let category: string;
  try {
    category = new Intl.PluralRules(lang, { type: 'ordinal' }).select(rank);
  } catch {
    category = 'other';
  }
  return category === 'one' || category === 'two' || category === 'few' ? category : 'other';
}

/** The dictionary key and English form per ordinal category. */
const ORDINALS: Record<OrdinalCategory, { key: string; english: string }> = {
  one: { key: 'ordinalOne', english: '{0}st' },
  two: { key: 'ordinalTwo', english: '{0}nd' },
  few: { key: 'ordinalFew', english: '{0}rd' },
  other: { key: 'ordinalOther', english: '{0}th' },
};

/**
 * A rank in words: "3rd", "3e".
 *
 * The plural rules come from the dictionary's `ordinalRules`, not the backoffice language: the
 * words come from the dictionary too, and a language the Arcade has no dictionary for gets the
 * English words, which need the English rules ("2nd", not German's "2th").
 * @param localize The localizer.
 * @param rank The rank, from 1.
 * @returns The ordinal.
 */
export function rankText(localize: Localize, rank: number): string {
  const { key, english } = ORDINALS[ordinalCategory(rank, say(localize, 'ordinalRules', 'en'))];
  return say(localize, key, english, rank);
}

/** The rule per board shape: which key and which English. */
const RULES: Record<string, { key: string; english: string }> = {
  'lower:time': { key: 'ruleFastest', english: 'Fastest time wins' },
  'higher:points': { key: 'ruleHighest', english: 'Highest score wins' },
  'lower:points': { key: 'ruleLowest', english: 'Lowest score wins' },
  'higher:time': { key: 'ruleLongest', english: 'Longest time wins' },
};

/**
 * How to win on a board: the game's own rule when its manifest has one, otherwise derived from the
 * board's `better` and `format`.
 * @param localize The localizer.
 * @param board The board's shape.
 * @param gameRule The game manifest's `rule`: a `#` key or a literal.
 * @returns The rule.
 */
export function ruleText(localize: Localize, board: Pick<UmbraDesktopGameLeaderboard, 'better' | 'format'>, gameRule?: string): string {
  if (gameRule) return localize.string(gameRule);
  const { key, english } = RULES[`${board.better}:${board.format}`];
  return say(localize, key, english);
}

/**
 * The unit after a number: seconds under a minute, nothing for m:ss (which says it), points for points.
 * @param localize The localizer.
 * @param format The board's format.
 * @param value The value: points, or milliseconds.
 * @returns The unit, or an empty string.
 */
export function unitText(localize: Localize, format: 'points' | 'time', value: number): string {
  if (format === 'points') return say(localize, 'unitPoints', 'points');
  return value < MINUTE_MS ? say(localize, 'unitSeconds', 'sec') : '';
}

/**
 * A value with its unit, for a sentence: "3.0 sec", "1,520 points", "1:02".
 * @param localize The localizer.
 * @param format The board's format.
 * @param value The value.
 * @returns The text.
 */
export function scoreText(localize: Localize, format: 'points' | 'time', value: number): string {
  const unit = unitText(localize, format, value);
  const number = formatScore(format, value, localize.lang());
  return unit ? `${number} ${unit}` : number;
}

/**
 * Who to chase and by how much: "3.0 sec behind Bram" (design P10).
 * @param localize The localizer.
 * @param format The board's format.
 * @param mine The player's best.
 * @param above The player directly above.
 * @returns The sentence.
 */
export function chaseText(localize: Localize, format: 'points' | 'time', mine: number, above: { displayName: string; value: number }): string {
  return say(localize, 'chase', '{0} behind {1}', scoreText(localize, format, Math.abs(mine - above.value)), above.displayName);
}
