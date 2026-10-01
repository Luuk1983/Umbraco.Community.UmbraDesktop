import type { UmbraDesktopHelpContext } from './help.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** The desktop's Help context: `open(target)` for the desktop's own code (Help design §6.2). */
export const UMBRADESKTOP_HELP_CONTEXT = new UmbContextToken<UmbraDesktopHelpContext>('UmbraDesktopHelpContext');
