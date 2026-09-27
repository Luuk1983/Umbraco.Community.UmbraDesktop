import { noticeIconName } from '../notices/notices.js';
import type { UmbraDesktopNotificationColor } from './types.js';

/**
 * The icon a notification of a given severity is drawn with, on a toast and in the scrollback.
 *
 * Warnings and errors ask the window notices for theirs, so a warning on a toast and a warning on a
 * window's strip are the same glyph and cannot drift apart. The other two are the ones core's own
 * layouts would lead a reader to expect.
 * @param color The notification's severity.
 * @returns An Umbraco icon name.
 */
export function notificationIconName(color: UmbraDesktopNotificationColor): string {
  if (color === 'danger') return noticeIconName('error') ?? 'icon-wrong';
  if (color === 'warning') return noticeIconName('warning') ?? 'icon-alert';
  if (color === 'positive') return 'icon-check';
  return 'icon-info';
}
