import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

/**
 * The desktop's package settings context, as this package uses it: a hand-written copy of the host's
 * contract, for the reason `umbradesktop-app.d.ts` gives. Only the members used here.
 */
export interface UmbraDesktopPackageSettingsStore {
  /** The stored value, parsed; undefined until read or when nothing is stored. */
  readonly value: unknown;
  /** Why the value may not be the stored one. */
  readonly status?: 'unread' | 'unsaved';
  /**
   * Change it: applies at once, stored in the background.
   * @param value The new value, anything JSON can keep.
   */
  set(value: unknown): void;
  /**
   * Be told about changes, from this page or another tab, and about status changes, which call the
   * listener with the value as it stands.
   * @param listener Called with the value.
   * @returns A function that stops the calls.
   */
  subscribe(listener: (value: unknown) => void): () => void;
}

/**
 * The context itself, on top of the `getHostElement` every Umbraco context has and `UmbContextToken`
 * requires.
 */
export interface UmbraDesktopPackageSettingsContext extends UmbContextMinimal {
  /**
   * The signed-in user's settings for a user-data group of this package's.
   * @param key The group.
   * @returns The page's one store for it; undefined only for a key the desktop refuses.
   */
  store(key: string): UmbraDesktopPackageSettingsStore | undefined;
  /**
   * Open Desktop settings at a package.
   * @param packageName The package's name, as its settings manifests give it.
   * @returns False when no desktop is showing.
   */
  openSettings(packageName: string): boolean;
}

/** The host's token, by its published alias. */
export const UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT = new UmbContextToken<UmbraDesktopPackageSettingsContext>(
  'UmbraDesktop.PackageSettingsContext',
);

/** This package's name in Desktop settings: the row its settings are under. */
export const ACCESSORIES_PACKAGE_NAME = 'UmbraDesktop Accessories';
