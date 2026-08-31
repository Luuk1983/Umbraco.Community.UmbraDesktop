import type { UmbraDesktopSettingsContext } from './settings.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** Context token for the desktop settings store. */
export const UMBRADESKTOP_SETTINGS_CONTEXT = new UmbContextToken<UmbraDesktopSettingsContext>(
  'UmbraDesktopSettingsContext',
);
