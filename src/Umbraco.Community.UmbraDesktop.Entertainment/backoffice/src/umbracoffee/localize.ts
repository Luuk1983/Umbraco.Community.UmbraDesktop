import type { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';

/**
 * How umbraCoffee's three elements (the window, the cup and the reminder) read their words, in one
 * place so the area and the fallback rule cannot drift between them.
 */

/** Localisation area this package's dictionaries live under. */
export const AREA = 'umbraDesktopEntertainment';

/**
 * A term from this package's dictionary, with the English as the fallback so a backoffice where the
 * dictionary failed to load still reads as words. The fallback is passed already filled in, because
 * `termOrDefault` substitutes `%0%` in a term it found and never in the default.
 * @param localize The calling element's `this.localize`.
 * @param key The key under this package's area.
 * @param fallback The English, with any arguments already in it.
 * @param args The arguments for the dictionary's `%0%`, `%1%`.
 * @returns The text.
 */
export function umbraCoffeeTerm(
  localize: Pick<UmbLocalizationController, 'termOrDefault'>,
  key: string,
  fallback: string,
  ...args: Array<string | number>
): string {
  return localize.termOrDefault(`${AREA}_${key}`, fallback, ...args);
}
