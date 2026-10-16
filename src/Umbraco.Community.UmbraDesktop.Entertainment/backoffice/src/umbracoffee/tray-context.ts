import { UmbContextToken, type UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';

/**
 * The part of the host's tray context this package uses. A local copy, as `umbradesktop-app.d.ts`
 * copies the manifest types: this package may not import the host's source, since that would pull
 * the desktop's bundle into this one. The alias is the host's public contract (`docs/developer/desktop-apps.md`
 * §9.8), and these three calls are the whole of it. It extends `UmbContextMinimal` only because a
 * context token requires that of whatever it carries; `getHostElement` is Umbraco's plumbing, which
 * the host's context inherits from its base class, and nothing here calls it.
 */
export interface UmbraDesktopTrayContextLike extends UmbContextMinimal {
  /**
   * Open a registered app by alias, exactly as its launcher tile does: a new window, unless the app
   * says `allowMultiple: false`, in which case its open window is brought to the front instead.
   * umbraCoffee says `false`, so for it this opens the window when none is open and otherwise
   * brings the open one forward, leaving it on whatever it shows.
   * @param alias The app's alias.
   * @returns False when this user has no such app.
   */
  openApp(alias: string): boolean;
  /**
   * Switch a tray item on or off for this user, exactly as its switch in Desktop settings does.
   * @param alias The tray item's alias.
   * @param enabled Whether it should be on.
   * @returns False when the alias is not a registered tray item.
   */
  setTrayItemEnabled(alias: string, enabled: boolean): boolean;
  /**
   * Read a tray item's switch: emits the current value on subscribe and again whenever it changes,
   * following Desktop settings live. It is the stored choice, else the item's default, and `false`
   * for an alias that is not a registered tray item.
   *
   * Optional, because a desktop from before this call was public provides a tray context without it.
   * The window's "Remind me" switch is then drawn disabled and points at Desktop settings instead of
   * guessing at a state it cannot read.
   * @param alias The tray item's alias.
   * @returns The switch's state over time.
   */
  trayItemEnabled?(alias: string): Observable<boolean>;
}

/**
 * The host's tray context, by its public alias. Provided by the desktop element, so only something
 * inside the desktop (the cup, the reminder on a desktop toast, the window) ever receives it; outside
 * the desktop nothing answers, and every consumer here treats it as optional.
 */
export const UMBRADESKTOP_TRAY_CONTEXT = new UmbContextToken<UmbraDesktopTrayContextLike>('UmbraDesktopTrayContext');
