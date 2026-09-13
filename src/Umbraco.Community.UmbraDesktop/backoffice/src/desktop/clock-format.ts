import type { UmbraDesktopLocaleSettings } from './settings/types';

/**
 * Formatting a time the way the user asked for it, as a pure function over a date and two settings
 * — no taskbar, no contexts, no timer. Which is what makes the matrix in `clock-format.test.ts` a
 * matrix rather than a set of rendered components, and what lets midnight and noon be tested at
 * all without waiting for either.
 *
 * Written as "how this desktop formats a time" rather than "what the taskbar shows", because the
 * same pair of settings is what any future date, number or relative time on this desktop should be
 * answering to. The clock is simply the first reader.
 */

/**
 * The cultures a clock can be asked to use.
 *
 * One field rather than two. "Match my browser" has no tag to name: the browser's culture *is*
 * `Intl`'s default, so that branch passes `undefined` and lets the runtime answer, exactly as the
 * `toLocaleTimeString([])` this replaced did. Naming one here would be a second source of truth
 * that could disagree with the runtime.
 */
export interface UmbraDesktopClockLocales {
  /**
   * The backoffice culture, e.g. `en-us`. Absent until the current user has loaded.
   *
   * Already lowercased and with its region intact when it comes from `this.localize.lang()`, which
   * reads the value the localization registry derived with `Intl.Locale(...).baseName`.
   */
  backoffice?: string;
}

/**
 * Which locale tag to hand `Intl`, or `undefined` for the runtime default.
 *
 * `undefined` is not a failure here. It is the answer for two different good reasons: it is what
 * "match my browser" *means* to `Intl`, and it is the safe stand-in while the backoffice culture is
 * still loading. A clock that rendered nothing until the current-user request came back would flash
 * an empty taskbar on every boot, which is a worse answer than a right-looking one that corrects
 * itself a moment later.
 * @param settings The user's locale preference.
 * @param locales The cultures currently known.
 * @returns A locale tag, or undefined for the runtime default.
 */
export function clockLocale(
  settings: UmbraDesktopLocaleSettings,
  locales: UmbraDesktopClockLocales,
): string | undefined {
  if (settings.source === 'browser') return undefined;
  return locales.backoffice || undefined;
}

/**
 * Format a time the way this user has asked for it.
 *
 * The hour cycle is overridden and the **locale is left alone**, rather than substituting a locale
 * that happens to be 12 or 24 hour. That is what keeps Dutch rendering "p.m.", Danish keeping its
 * dot, Japanese using its own words and Korean putting the marker first. A user asking for 12 hour
 * is not asking to be moved to America.
 *
 * The hour padding is **derived** from the cycle the formatter actually resolved, rather than typed
 * per option. A 12-hour clock reading "02:30 PM" is not one any OS ships, and hard-coding
 * `hour: '2-digit'` is how this package shipped one.
 *
 * `hourCycle` rather than `hour12`: the two were checked against en-US, nl, ja and ko and agree, and
 * this one states the intent more precisely. Note the pair are mutually exclusive in `Intl` — set
 * both and the cycle is ignored — which is the other reason only one of them appears here.
 * @param now The moment to format.
 * @param settings The user's locale preference.
 * @param locales The cultures currently known.
 * @returns The formatted time.
 */
export function formatClock(
  now: Date,
  settings: UmbraDesktopLocaleSettings,
  locales: UmbraDesktopClockLocales,
): string {
  const locale = clockLocale(settings, locales);
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (settings.hourCycle !== 'auto') options.hourCycle = settings.hourCycle;
  // Asked rather than assumed: 'auto' means the culture decides, and a fixed cycle still has to be
  // read back because h11 and h12 pad differently from h23 and h24.
  const resolved = new Intl.DateTimeFormat(locale, options).resolvedOptions().hourCycle;
  const hour = resolved === 'h11' || resolved === 'h12' ? 'numeric' : '2-digit';
  return new Intl.DateTimeFormat(locale, { ...options, hour }).format(now);
}
