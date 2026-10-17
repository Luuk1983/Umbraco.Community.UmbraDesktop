import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbraDesktopMediaContext } from './media.context.js';

/**
 * The media service's context. **The alias is published API**: other packages build their own token
 * with this string and nothing else, so it must never be renamed once shipped.
 */
export const UMBRADESKTOP_MEDIA_CONTEXT = new UmbContextToken<UmbraDesktopMediaContext>('UmbraDesktopMediaContext');
