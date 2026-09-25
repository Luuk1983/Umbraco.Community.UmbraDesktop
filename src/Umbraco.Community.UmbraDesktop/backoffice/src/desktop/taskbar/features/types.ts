import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import type { UmbraDesktopApp } from '../../types';

/**
 * Which end of the taskbar a feature's elements belong to.
 *
 * `launcher` is the launching half, beside the launcher button: everything there opens something.
 * `tray` is the reporting half, beside the clock, where the health indicator (#22) and a
 * hide-the-clock toggle belong. Windows keeps the same separation — taskbar items against system
 * tray icons — and the reason is that the two speak different languages: a launcher-side element
 * calls `open()`, a tray element reports state. Nothing fills `tray` yet, and this issue must not:
 * the region exists so that when it does arrive it arrives as an entry here rather than as a second
 * mechanism with its own settings shape.
 *
 * A feature's {@link UmbraDesktopTaskbarFeature.weight} orders it *within* its region, never
 * globally, so the two orders stay independent.
 */
export type UmbraDesktopTaskbarRegion = 'launcher' | 'tray';

/**
 * A region as Desktop settings shows it: a heading over that end's switches, and a line saying what
 * that end of the taskbar is.
 *
 * The heading is not decoration. Without it the screen opens on a switch labelled "AI chat" with no
 * statement anywhere of what it is a setting *about*, which is how it read the first time somebody
 * else opened it. It is also the seam the system tray's settings drop into rather than arriving as
 * a second screen — Windows groups the same two, taskbar items above system tray icons.
 *
 * A region with no features draws no heading, so declaring the tray's name now costs an empty
 * section nothing and lets the first tray feature appear without a change to the screen.
 */
export interface UmbraDesktopTaskbarRegionInfo {
  /** The region this describes. */
  id: UmbraDesktopTaskbarRegion;
  /** Localization key for the group heading. */
  labelKey: string;
  /** Localization key for the line under the heading: what this end of the taskbar is for. */
  descriptionKey: string;
}

/**
 * Whether a feature can be used on this install, and why not when it cannot.
 *
 * The reason is a localization key rather than a sentence because only one surface ever shows it:
 * Desktop settings, which lists every feature always and disables the ones that cannot be switched
 * on. The taskbar itself shows nothing and says nothing — the two surfaces have one rule each and
 * are allowed to disagree.
 */
export type UmbraDesktopFeatureAvailability = { available: true } | { available: false; reasonKey: string };

/**
 * Everything a feature is handed in order to answer for itself and to draw.
 *
 * Assembled by the taskbar from the contexts it already consumes, so a feature never reaches for a
 * context of its own: that is what keeps a feature a folder of pure-ish functions rather than an
 * element with a lifecycle.
 */
export interface UmbraDesktopTaskbarFeatureContext {
  /**
   * Every app this user may launch, in launcher order.
   *
   * Already gated: the app catalogue resolves entries against the user's permitted sections before
   * anything here sees them, which is why no feature needs permission logic of its own.
   */
  apps: ReadonlyArray<UmbraDesktopApp>;
  /** Aliases of the user's pinned apps, in pin order — the launcher's list, not a second one. */
  pinned: ReadonlyArray<string>;
  /**
   * Whether a curated catalogue `ref` is registered on this install, regardless of whether this
   * user may reach it. The one thing {@link apps} cannot answer, and the difference between "the
   * package is not installed" and "you cannot reach it".
   * @param ref The referenced manifest's alias.
   * @returns True when something has registered that alias.
   */
  isRefRegistered(ref: string): boolean;
  /**
   * Launch an app, exactly as the launcher's tile does.
   * @param app The app to open.
   */
  open(app: UmbraDesktopApp): void;
  /**
   * Resolve a localization key or a literal to a display string.
   * @param value The key or literal.
   * @returns The string to show.
   */
  localize(value: string): string;
  /** Whether the page is full screen right now, as the browser reports it. */
  fullscreen: boolean;
  /** Whether the browser allows this page to go full screen at all. */
  canFullscreen: boolean;
  /** Take the page full screen, or bring it back when it already is. */
  toggleFullscreen(): void;
}

/**
 * One fixed feature on the taskbar: a thing the user switches on or off in Desktop settings, which
 * contributes zero or more elements to its region's row.
 *
 * **A registry of features, not of buttons.** What a feature renders is its own business — the AI
 * chat is one button, pinned apps is a button per pin, and a search feature would be an input — so
 * a feature contributing several elements, or none, is the normal case rather than a special one.
 * An app alias is therefore never part of this contract; it is a detail inside one feature.
 *
 * **Curated, not an extension point**, the same way the themes, the settings categories and the app
 * catalogue are: a feature is a folder plus one entry in `index.ts`, and a package cannot add
 * itself. The order is the shell's and the user cannot change it, as on Windows, which is what
 * makes a position on the row worth building muscle memory for.
 */
export interface UmbraDesktopTaskbarFeature {
  /**
   * Stable id. Also the key this feature's on/off choice is stored under, so it outlives any label
   * change and must outlive any rename — a changed id reads as a feature the user has never had an
   * opinion about, which silently resets their choice.
   */
  id: string;
  /** Which end of the taskbar this feature's elements belong to. */
  region: UmbraDesktopTaskbarRegion;
  /** Sort weight within the region (ascending). Never tied — see `features.test.ts`. */
  weight: number;
  /** Localization key for the feature's name in Desktop settings. */
  labelKey: string;
  /**
   * Localization key for the line under the name: what the feature puts on the taskbar.
   *
   * Shown **always**, including under a control that is disabled, with the
   * {@link UmbraDesktopFeatureAvailability} reason added beneath it rather than in its place. The
   * reason replaced it at first, on the reasoning that why-not is the more urgent of the two — but
   * a switch labelled "AI chat" above nothing but "Umbraco AI is not installed" never says what the
   * chat would have put on the taskbar, and somebody reading a disabled switch is usually deciding
   * whether to go and install the thing it needs.
   */
  descriptionKey: string;
  /**
   * Whether the feature is on for a user who has never said otherwise.
   *
   * Both shipped features are on. Someone who installed the AI package wanting the chat is the safe
   * assumption, someone who pinned an app wanted it close, and a feature that ships switched off is
   * mostly never found.
   */
  defaultEnabled: boolean;
  /**
   * Whether this feature can be used on this install.
   *
   * Drives two different things from one answer: whether the row draws it at all, and what Desktop
   * settings says beside a control it has disabled.
   * @param context The taskbar's view of the world.
   * @returns The verdict, with a reason key when it is negative.
   */
  availability(context: UmbraDesktopTaskbarFeatureContext): UmbraDesktopFeatureAvailability;
  /**
   * This feature's contribution to its region's row.
   *
   * May be empty, which is the normal state of the pinned apps feature until the user pins
   * something: a feature can be switched on and contribute nothing.
   * @param context The taskbar's view of the world.
   * @returns The elements to draw, in the order they should appear.
   */
  render(context: UmbraDesktopTaskbarFeatureContext): TemplateResult[];
}
