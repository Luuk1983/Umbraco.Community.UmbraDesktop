import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbMediaDetailRepository } from '@umbraco-cms/backoffice/media';

/**
 * What the Image Editor tells the desktop it shows (#176), through the desktop's
 * `umbradesktop-app-subject` event (`docs/developer/desktop-apps.md` §7.8): the media item it has
 * open. The desktop then tells it when somebody else saves that item, the way it tells a backoffice
 * window: a clean editor reopens the new file, a dirty one gets the changed-elsewhere banner.
 */

/** The event's name, as the desktop publishes it. */
export const APP_SUBJECT_EVENT = 'umbradesktop-app-subject';

/** A copy of the desktop's `UmbraDesktopAppSubject`, since nothing is imported between packages. */
export interface EditorSubject {
  /** Always `media`. */
  entityType: 'media';
  /** The item's key. */
  unique: string;
  /** The update date the editor holds: what it opened, or last saved. */
  version(): string | null | undefined;
  /** The item's update date on the server now; rejects with a 404 cause when it is gone. */
  serverVersion(): Promise<string | null | undefined>;
  /** Open the item again, throwing the editor's own work on it away. */
  reload(): Promise<void>;
}

/** How the editor reads an item's update date on the server. */
export type ServerVersionOf = (host: UmbControllerHost, unique: string) => Promise<string | null | undefined>;

/**
 * The real read: the item's detail through core's media repository, its one variant's update date.
 * An item the server says is gone rejects with that status as the cause, which is how the desktop
 * tells "deleted" from "could not ask"; any other failure answers undefined, which the desktop takes
 * as nothing known.
 * @param host The editor.
 * @param unique The item.
 * @returns Its update date.
 */
export const backofficeServerVersion: ServerVersionOf = async (host, unique) => {
  const { data, error } = await new UmbMediaDetailRepository(host).requestByUnique(unique);
  if (data) return data.variants[0]?.updateDate ?? undefined;
  const status = (error as { status?: number } | undefined)?.status;
  // Assigned rather than passed to the constructor, which this package's ES2020 library does not type.
  if (status === 404) throw Object.assign(new Error('The media item is gone.'), { cause: { status } });
  return undefined;
};
