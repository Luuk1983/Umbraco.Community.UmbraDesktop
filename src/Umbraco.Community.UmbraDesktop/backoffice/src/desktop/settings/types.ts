/** Types for the desktop settings feature. */

/**
 * Where a wallpaper comes from. `none` keeps the gradient the desktop has always shipped, so
 * turning wallpapers on never takes an option away.
 */
export type UmbraDesktopWallpaperRef =
  | { kind: 'none' }
  | { kind: 'builtin'; id: string }
  | { kind: 'media'; unique: string };

/**
 * Where the desktop takes the culture it formats dates and times with.
 *
 * `backoffice` is the user's Umbraco language, which is what every date Umbraco itself renders
 * already uses: `UmbLocalizationController.date()` formats with the backoffice culture. `browser`
 * is the runtime default, which is what the clock read before this setting existed.
 *
 * Deliberately not called `system`. The browser ignores the OS regional format, which is the very
 * setting a Windows user means when they say their system is on 24 hour, so an option with that
 * name would send them to the one choice that keeps giving them AM/PM.
 */
export type UmbraDesktopLocaleSource = 'backoffice' | 'browser';

/**
 * The user's clock override. `auto` leaves the hour cycle to the culture; the other two force it
 * while leaving the rest of the culture alone, so the separator and the meridiem stay native.
 *
 * `h12`/`h23` rather than `12`/`24` because they are the `Intl.DateTimeFormatOptions` values they
 * are passed to unchanged, and a mapping table between the two would only be somewhere to make a
 * mistake.
 */
export type UmbraDesktopClockCycle = 'auto' | 'h12' | 'h23';

/**
 * How the desktop formats dates and times: which culture, and whether the clock overrides that
 * culture's hour cycle.
 *
 * Two fields rather than one list of four options, which is how every OS splits it — macOS and iOS
 * pair a Region picker with a separate 24-hour toggle. A single list cannot express "my backoffice
 * culture, but 24 hour", which is exactly what a Danish speaker on an untouched `en-US` install
 * needs.
 */
export interface UmbraDesktopLocaleSettings {
  /** Which culture to format with. */
  source: UmbraDesktopLocaleSource;
  /** Whether to override that culture's hour cycle. */
  hourCycle: UmbraDesktopClockCycle;
}

/**
 * When the desktop reopens the windows a user had open.
 *
 * - `off`: never. Nothing about the windows is kept anywhere.
 * - `session`: after a refresh, Exit and back, or signing in again in the same tab. Kept in the
 *   tab's `sessionStorage`, so it ends with the tab and two tabs never touch each other's windows.
 *   The default, because nobody expects F5 to close everything they had open.
 * - `persistent`: also after the browser has been closed. The tab still works from its own copy;
 *   `localStorage` is written as well, and read only by a tab that has no copy yet.
 *
 * Three values rather than a boolean plus a checkbox, because `off` and `persistent` are not
 * two ends of one switch: the middle one is where nearly everybody belongs.
 */
export type UmbraDesktopReopenWindows = 'off' | 'session' | 'persistent';

/**
 * One group on a launcher the user has arranged.
 *
 * A group that came from the catalogue keeps the catalogue group's alias as its `id` and a `null`
 * label, so its name is looked up (see `launcher/group-labels.ts`) and follows the backoffice
 * language. Only a group the user named carries literal text.
 */
export interface UmbraDesktopLauncherLayoutGroup {
  /** A catalogue group alias, or `custom-…` for a group the user created. */
  id: string;
  /** `null` to look the name up by `id`; otherwise the user's own text. */
  label: string | null;
  /**
   * App aliases in the user's order. Never pruned: an alias this user cannot open right now is
   * skipped when the launcher is drawn and comes back in the same place when they can.
   */
  apps: string[];
}

/**
 * The user's changes to the launcher, and only those (design D2).
 *
 * Absent until the user first changes a group, so a launcher nobody has arranged is always the
 * catalogue's own grouping and follows it when a release regroups apps. New apps are placed by
 * `launcher/resolve-launcher.ts`, not stored here, which is what lets them keep arriving (D3).
 */
export interface UmbraDesktopLauncherLayout {
  /** The user's groups, in their order. */
  groups: UmbraDesktopLauncherLayoutGroup[];
  /** Apps the user took off the launcher. They wait in the palette and in All apps. */
  removed: string[];
  /** Catalogue groups the user deleted, so their new apps wait in the palette instead of returning. */
  deletedGroups: string[];
}

/**
 * One user's desktop settings, as persisted. Versioned from the start so a future shape change
 * has somewhere to hang a migration rather than silently discarding preferences.
 */
export interface UmbraDesktopSettings {
  /** Payload version. Anything unrecognised is treated as unreadable and reset. */
  v: 1;
  /** The user's chosen wallpaper. */
  wallpaper: UmbraDesktopWallpaperRef;
  /** Id of the user's chosen chrome theme. */
  theme: string;
  /**
   * Aliases of the apps pinned to Favourites, in pin order.
   *
   * Read by two surfaces now rather than one: the launcher's Pinned hero, and the taskbar's pinned
   * apps feature when it is switched on. Both go through `resolvePinned`, so neither has its own
   * idea of what a pin means or which order they come in.
   */
  pinned: string[];

  /**
   * Which fixed taskbar features this user has switched on or off, keyed by feature id.
   *
   * Holds **only** the features the user has an opinion about. One absent from the map takes the
   * feature's own default, which is what lets a feature added in a later release arrive switched on
   * for somebody whose payload predates it rather than reading as one they had switched off. See
   * `taskbar/features/enabled.ts`.
   *
   * One property rather than a boolean per feature, so that adding a feature stays a folder plus
   * one registry entry and never touches this file or the parser. Ids that no feature claims are
   * kept rather than pruned: the registry drops what it cannot match when it reads the map, and
   * discarding them here would mean running an older build once silently resets a newer build's
   * features.
   */
  taskbarFeatures: Record<string, boolean>;
  /**
   * Whether landing on the backoffice root should open the desktop instead of the section the
   * backoffice would otherwise pick.
   *
   * Lives here beside the other per-user preferences, even though it is read at a very different
   * moment: everything else is read once the desktop mounts, while this is read during boot, before
   * anything has been painted. One payload keeps a user's desktop in one place; the boot path pays
   * for that by reading the payload itself rather than going through the settings context, which is
   * provided by the desktop element and so does not exist yet at that point.
   */
  bootIntoDesktop: boolean;
  /**
   * When the desktop reopens the windows this user had open: never, after a refresh of the same tab,
   * or also after the browser has been closed. See {@link UmbraDesktopReopenWindows}.
   *
   * Stored here, on the account, so the choice follows the user. The layout itself never does: it
   * is kept in the browser (`windows/layout-persistence.ts`), because it changes whenever a window
   * moves and belongs to one screen.
   */
  reopenWindows: UmbraDesktopReopenWindows;
  /**
   * Whether changing the theme should also change the wallpaper to the one that theme declares.
   *
   * Off by default. Switching it on is the user asking for their wallpaper to be managed, which is
   * why choosing a wallpaper by hand switches it back off again: picking an image is about as
   * explicit as a person gets, and the alternative is silently discarding that choice the next time
   * they try a theme.
   */
  wallpaperFollowsTheme: boolean;

  /**
   * How the desktop formats dates and times.
   *
   * Defaults to the backoffice culture, so the shell agrees with the backoffice it wraps rather
   * than with the browser. On a default install those two disagree: `DefaultUILanguage` is `en-US`,
   * so Umbraco already prints AM/PM on every date it renders, while a clock reading the browser
   * showed whatever the browser's language happened to be.
   */
  locale: UmbraDesktopLocaleSettings;

  /**
   * The user's changes to the launcher. Absent means never arranged: the launcher is the catalogue's
   * grouping. Optional rather than defaulted, and the payload stays at `v: 1`, for the reason
   * `parseSettings` gives: an unknown optional field costs an older build nothing (design D14).
   */
  layout?: UmbraDesktopLauncherLayout;
}

/** What the desktop element needs in order to paint a wallpaper. */
export interface UmbraDesktopResolvedWallpaper {
  /** URL of the image to paint, or `null` to fall back to the gradient. */
  url: string | null;
  /** Colour painted underneath the image while it decodes, or `null` when there is no image. */
  averageColour: string | null;
}
