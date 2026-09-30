import type { UmbraDesktopNotificationCentreContext } from './notification-centre.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/**
 * Context token for the notification centre, provided by the desktop and consumed by every window
 * (to register its frame as a source), the toast stack and the taskbar clock.
 */
export const UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT = new UmbContextToken<UmbraDesktopNotificationCentreContext>(
  'UmbraDesktopNotificationCentreContext',
);
