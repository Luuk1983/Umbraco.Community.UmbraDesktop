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
  return formatDateTime(now, settings, locales, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Format any date or time the way this user has asked for it: {@link formatClock}'s rules for any
 * set of `Intl` options, which is what the settings context publishes to apps.
 *
 * The culture is the user's choice, backoffice or browser, as for the clock. The hour cycle is
 * applied only when `options` asks for an hour, since a date with no time in it has no hour to
 * override, and the hour's padding is derived from the cycle that resolved, for the reason
 * {@link formatClock} gives. Any `hour` in `options` is replaced by that derived one.
 * @param now The moment to format.
 * @param settings The user's locale preference.
 * @param locales The cultures currently known.
 * @param options What to show, as `Intl.DateTimeFormat` options.
 * @returns The formatted date or time.
 */
export function formatDateTime(
  now: Date,
  settings: UmbraDesktopLocaleSettings,
  locales: UmbraDesktopClockLocales,
  options: Intl.DateTimeFormatOptions,
): string {
  const locale = clockLocale(settings, locales);
  if (options.hour === undefined) return new Intl.DateTimeFormat(locale, options).format(now);
  const withCycle: Intl.DateTimeFormatOptions = { ...options, hour: 'numeric' };
  if (settings.hourCycle !== 'auto') withCycle.hourCycle = settings.hourCycle;
  // Asked rather than assumed: 'auto' means the culture decides, and a fixed cycle still has to be
  // read back because h11 and h12 pad differently from h23 and h24.
  const resolved = new Intl.DateTimeFormat(locale, withCycle).resolvedOptions().hourCycle;
  const hour = resolved === 'h11' || resolved === 'h12' ? 'numeric' : '2-digit';
  return new Intl.DateTimeFormat(locale, { ...withCycle, hour }).format(now);
}

/**
 * How long until the next whole minute, in milliseconds.
 *
 * The taskbar clock shows hours and minutes, and it sits a few centimetres from the operating
 * system's own clock. Two clocks that turn the minute over at different moments read as one of them
 * being broken, and a fixed interval can never avoid that at any frequency: it turns over wherever
 * it happens to be in its own cycle, which is up to that whole interval late.
 *
 * Measured from the moment it is handed rather than from when a timer meant to fire, so error never
 * accumulates. A tab that was throttled in the background, a laptop that slept, a clock the user
 * put right or a daylight-saving change all land the same way: the next wait is computed from what
 * the clock says now, so one late tick costs one late minute rather than permanently shifting the
 * phase.
 *
 * Never returns zero, which would re-arm a timer with no delay and spin. `% 60000` works on the
 * epoch rather than on local time because every time zone offset is a whole number of minutes, so
 * the epoch's minute boundaries and the wall clock's are the same instants.
 * @param now The moment to measure from.
 * @returns Milliseconds until the next minute boundary, from 1 to 60000.
 */
export function msUntilNextMinute(now: Date): number {
  return 60000 - (now.getTime() % 60000) || 60000;
}
