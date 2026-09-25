import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';

/**
 * The part of the desktop's settings context an app may use: formatting dates and times the way the
 * user has asked the desktop to, as its taskbar clock does. `docs/desktop-apps.md` §7.1 is the
 * contract.
 *
 * Declared here rather than imported, for the reason `umbradesktop-app.d.ts` in the Entertainment
 * package gives for the manifest type: the host ships built JavaScript, not TypeScript, and nothing
 * is imported from it. Umbraco resolves a context by its alias, so a token with the same alias finds
 * the desktop's context, and this interface names only the two members the contract makes public,
 * on top of the `getHostElement` every Umbraco context has and `UmbContextToken` requires.
 */
export interface DesktopDateTime extends UmbContextMinimal {
  /**
   * Format a date or time with `Intl.DateTimeFormat` options, exactly as the taskbar clock does.
   * @param date The moment.
   * @param options What to show.
   * @returns The formatted text.
   */
  formatDateTime(date: Date, options: Intl.DateTimeFormatOptions): string;
  /** Emits whenever the user changes how dates and times are formatted. Observe it and redraw. */
  readonly locale: Observable<unknown>;
}

/** The desktop's settings context, by the alias the contract publishes. */
export const DESKTOP_SETTINGS_CONTEXT = new UmbContextToken<DesktopDateTime>('UmbraDesktopSettingsContext');
