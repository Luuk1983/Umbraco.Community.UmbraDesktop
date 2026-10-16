import type { UmbraDesktopPackageSettingsContext } from './package-settings.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * The global context packages reach the desktop through (design §5). **The alias is public API**:
 * packages create their own token with this string, since they cannot import this file.
 */
export const UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT = new UmbContextToken<UmbraDesktopPackageSettingsContext>(
  'UmbraDesktop.PackageSettingsContext',
);
