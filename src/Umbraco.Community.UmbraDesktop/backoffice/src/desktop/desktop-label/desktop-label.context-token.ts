import type { UmbraDesktopLabelContext } from './desktop-label.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** Context token for the desktop label, provided by the desktop and consumed by the Site settings. */
export const UMBRADESKTOP_DESKTOP_LABEL_CONTEXT = new UmbContextToken<UmbraDesktopLabelContext>(
  'UmbraDesktopLabelContext',
);
