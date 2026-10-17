import type { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import en from '../localization/en.js';
import { AREA } from './area.js';

/** A key of this package's dictionary. */
export type WordKey = keyof (typeof en)['umbraDesktopServicesMedia'];

/**
 * Fill `%0%`, `%1%` and so on with arguments, as the backoffice's own terms are filled.
 * @param text The text.
 * @param args What goes in each slot.
 * @returns The filled text.
 */
export function fill(text: string, args: ReadonlyArray<unknown>): string {
  return text.replace(/%(\d+)%/g, (whole, index) => (Number(index) < args.length ? String(args[Number(index)]) : whole));
}

/**
 * This package's words, through the backoffice's localization with the English dictionary as the
 * fallback, so a backoffice where the dictionary failed to load still renders words.
 *
 * The fallback is read from `en.ts` rather than written out a second time beside each call, which
 * is how the other packages do it: the File page says many more things than one dialog does, and
 * two copies of each sentence would drift. `termOrDefault` returns its default unfilled, so the
 * fallback is filled here.
 * @param localize The element's localization controller.
 * @returns A function from a key and its arguments to the words.
 */
export function wordsOf(localize: UmbLocalizationController): (key: WordKey, ...args: unknown[]) => string {
  return (key, ...args) =>
    localize.termOrDefault(`${AREA}_${key}`, null, ...args) ?? fill(en.umbraDesktopServicesMedia[key], args);
}
