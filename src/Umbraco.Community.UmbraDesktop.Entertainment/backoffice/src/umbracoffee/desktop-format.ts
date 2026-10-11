/**
 * @file How umbraCoffee writes a time or a date: the way the desktop's taskbar clock does, when the
 * desktop can say how, and in the backoffice language otherwise. In one place so the window's
 * countdown, its episode list and the cup's reminder cannot disagree about which.
 *
 * The desktop has two settings for this, Regional format and Clock (12 or 24 hour), and
 * `this.localize.date` knows about neither. So without this, a user who asked for a 24 hour clock
 * would read "2:30 PM" in the window and "14:30" in the taskbar a few centimetres below it.
 */

import type { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UmbContextToken, type UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';

/**
 * The part of the desktop's settings context umbraCoffee uses. A local copy, for the reason
 * `tray-context.ts` gives: this package may not import the host's source. The alias and both members
 * are the desktop settings context's public API, documented in `docs/developer/desktop-apps.md`.
 *
 * `locale` has been on the desktop's settings context since the Regional format and Clock settings
 * came; `formatDateTime` is newer. So an older desktop provides a context under this
 * alias without the method, which is why it is optional, and umbraCoffee must still write a time
 * there. It extends `UmbContextMinimal` only because a context token requires that of whatever it
 * carries; nothing here calls `getHostElement`.
 */
export interface UmbraDesktopSettingsContextLike extends UmbContextMinimal {
  /**
   * Format a date or time with `Intl.DateTimeFormat` options, exactly as the taskbar clock does: the
   * user's culture, their hour override when the options ask for an hour, and the hour padded to
   * suit the cycle. Absent on an older desktop.
   * @param date The moment.
   * @param options What to show. The 12/24 hour override applies only when these set `hour`, which
   *   is why umbraCoffee's times use {@link UMBRACOFFEE_TIME_OPTIONS} rather than `timeStyle`.
   * @returns The formatted text.
   */
  formatDateTime?(date: Date, options: Intl.DateTimeFormatOptions): string;
  /**
   * Emits whenever the user changes either setting. Its value is the desktop's own and not something
   * to read; it is only the signal to redraw.
   */
  readonly locale: Observable<unknown>;
}

/**
 * The desktop's settings context, by its public alias. Provided by the desktop, so only something
 * inside it (the cup, the window) ever receives it; outside it, as in most of this package's tests,
 * nothing answers, and every consumer here treats it as optional.
 */
export const UMBRADESKTOP_SETTINGS_CONTEXT = new UmbContextToken<UmbraDesktopSettingsContextLike>(
  'UmbraDesktopSettingsContext',
);

/**
 * How umbraCoffee asks for a time of day: the taskbar clock's own options, hours and minutes.
 *
 * Spelled out rather than `timeStyle: 'short'`, because the desktop applies the user's 12/24 hour
 * setting only when the options set `hour`, so a `timeStyle` would quietly ignore it. And never both
 * together, since `Intl.DateTimeFormat` throws on `hour` beside `timeStyle`. Frozen because it is
 * shared by every call.
 */
export const UMBRACOFFEE_TIME_OPTIONS: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * How the window writes a moment with its day, "Friday 30 October 2026, 12:30": for when an episode
 * starts and started, on the line under its title. It sets `hour`, like {@link UMBRACOFFEE_TIME_OPTIONS},
 * so the desktop's 12/24 hour setting applies to it too. Frozen because it is shared by every call.
 */
export const UMBRACOFFEE_DATETIME_OPTIONS: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * The same moment written short, "30 Oct, 12:30", for the list's first row, which has a 180px line.
 * Sets `hour` for the same reason. Frozen because it is shared by every call.
 */
export const UMBRACOFFEE_SHORT_DATETIME_OPTIONS: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Write a date or time the way the desktop's taskbar clock does, when the desktop can say how, and
 * with the backoffice's own `localize.date` otherwise.
 *
 * The method is checked for, not only the context, because an older desktop provides a context
 * under the same alias without it. So this works under every desktop, with the method or without,
 * and outside one entirely.
 * @param desktop The consumed settings context, or undefined when there is none.
 * @param localize The calling element's `this.localize`.
 * @param date The moment.
 * @param options What to show, as `Intl.DateTimeFormat` options: {@link UMBRACOFFEE_TIME_OPTIONS}
 *   for a time.
 * @returns The formatted text.
 */
export function formatUmbraCoffeeDate(
  desktop: UmbraDesktopSettingsContextLike | undefined,
  localize: Pick<UmbLocalizationController, 'date'>,
  date: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return typeof desktop?.formatDateTime === 'function'
    ? desktop.formatDateTime(date, options)
    : localize.date(date, options);
}
