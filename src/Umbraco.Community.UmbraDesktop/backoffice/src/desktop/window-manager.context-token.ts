import type { UmbraDesktopWindowManagerContext } from './window-manager.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** Context token for the desktop window manager. */
export const UMBRADESKTOP_WINDOW_MANAGER_CONTEXT =
  new UmbContextToken<UmbraDesktopWindowManagerContext>('UmbraDesktopWindowManagerContext');
