import type { UmbraDesktopTrayContext } from './tray.context.js';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * Context token for the system tray's public face.
 *
 * **The alias is public API.** A package consumes this context by the string alone, through a local
 * token of its own, as Entertainment does, because importing this file would mean importing the
 * desktop's bundle. So `'UmbraDesktopTrayContext'` must never be renamed: a rename breaks every such
 * package silently, their consume simply never resolving.
 */
export const UMBRADESKTOP_TRAY_CONTEXT = new UmbContextToken<UmbraDesktopTrayContext>('UmbraDesktopTrayContext');
