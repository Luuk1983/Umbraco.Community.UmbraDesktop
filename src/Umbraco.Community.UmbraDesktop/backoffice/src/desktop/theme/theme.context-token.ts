import type { UmbraDesktopThemeContext } from './theme.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** Context token for the active chrome theme. */
export const UMBRADESKTOP_THEME_CONTEXT = new UmbContextToken<UmbraDesktopThemeContext>(
  'UmbraDesktopThemeContext',
);
