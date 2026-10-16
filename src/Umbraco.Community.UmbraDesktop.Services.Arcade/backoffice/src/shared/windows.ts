import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

/** The one window-manager member the Arcade uses, published by the host (`docs/developer/desktop-contexts.md`). */
export interface DesktopWindows extends UmbContextMinimal {
  /** Open an app by alias, as the launcher would. @param alias The app. @returns Whether it opened or focused a window. */
  openApp(alias: string): boolean;
}

/** The host's window manager, by its published alias; nothing is imported from the host. */
export const DESKTOP_WINDOWS = new UmbContextToken<DesktopWindows>('UmbraDesktopWindowManagerContext');
