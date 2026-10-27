import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

/**
 * The desktop's package settings context, as this package uses it (#179): a hand-written copy of the
 * part of the host's contract the media guidelines need, because nothing is imported from another
 * package. Accessories' `shared/package-settings.ts` copies more of it.
 */
export interface UmbraDesktopPackageSettingsContext extends UmbContextMinimal {
  /**
   * Open Desktop settings at a package.
   * @param packageName The package's name, as its settings manifests give it.
   * @returns False when no desktop is showing.
   */
  openSettings(packageName: string): boolean;
}

/** The host's token, by its published alias. */
export const UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT = new UmbContextToken<UmbraDesktopPackageSettingsContext>('UmbraDesktop.PackageSettingsContext');

/**
 * This package's name in Desktop settings: the row its settings are under. Plain text, never a
 * localisation key, as the host asks: it is what the boxes are grouped by.
 */
export const MEDIA_PACKAGE_NAME = 'UmbraDesktop Media';
