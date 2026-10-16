import type { UmbraDesktopSearchContext } from './search.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** The desktop's search sources, for the launcher's search and anything that searches later (design §8). */
export const UMBRADESKTOP_SEARCH_CONTEXT = new UmbContextToken<UmbraDesktopSearchContext>('UmbraDesktopSearchContext');
