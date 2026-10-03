import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbraDesktopArcadeContext } from './arcade.context.js';

/**
 * The Arcade's context. **The alias is published API**: game packages build their own token with
 * this string and nothing else (design D4), so it must never be renamed once shipped.
 */
export const UMBRADESKTOP_ARCADE_CONTEXT = new UmbContextToken<UmbraDesktopArcadeContext>('UmbraDesktopArcadeContext');
