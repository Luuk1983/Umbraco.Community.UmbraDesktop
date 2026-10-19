import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { isFolder } from './media-source.js';
import type { UmbraDesktopMediaSource } from './media-source.js';
import { printLocation } from './location.js';
import type { UmbraDesktopMediaPlace } from './location.js';

/** The Media Manager app's manifest alias, which `openApp` opens a new window of. */
export const UMBRADESKTOP_MEDIA_MANAGER_APP = 'Umbraco.Community.UmbraDesktop.Media.MediaManager';

/**
 * The part of the desktop's window manager this package uses, by its published alias. Declared here
 * rather than imported, as every package reaches the desktop (`docs/developer/desktop-contexts.md` §5).
 */
interface UmbraDesktopWindowManager extends UmbContextMinimal {
  /**
   * Open an app, at a location when one is given.
   * @param alias The app's manifest alias.
   * @param options Where to open it. An older desktop ignores this and opens the app at its start.
   */
  openApp(alias: string, options?: { location?: string }): boolean;
}

/** The desktop's window manager, by its published alias. */
const UMBRADESKTOP_WINDOW_MANAGER = new UmbContextToken<UmbraDesktopWindowManager>('UmbraDesktopWindowManagerContext');

/**
 * One manager window, as the things inside it see it: our actions and conditions, wherever core
 * creates them in the window, find it by asking for this context.
 *
 * Its presence is the answer to "am I in a manager window?", which is how our actions stay out of the
 * Media section (design §1). Provided by the manager element, so a card's menu, a tree item's menu and
 * the selection bar all find the window they are in.
 */
export class UmbraDesktopMediaManagerWindowContext extends UmbContextBase {
  /** Where the window asks the server. */
  #source: UmbraDesktopMediaSource;

  /** The desktop's window manager, once found. Absent outside a desktop, as in a test. */
  #windows?: UmbraDesktopWindowManager;

  /**
   * @param host The manager element.
   * @param source Where the window asks the server.
   */
  constructor(host: UmbControllerHost, source: UmbraDesktopMediaSource) {
    super(host, UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT);
    this.#source = source;
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER, (windows) => (this.#windows = windows));
  }

  /**
   * Point the window at another source, when the element is handed one.
   * @param source The source.
   */
  setSource(source: UmbraDesktopMediaSource): void {
    this.#source = source;
  }

  /**
   * Whether an item opens as a folder.
   * @param unique The item's key.
   * @returns True for a folder.
   */
  async isFolder(unique: string): Promise<boolean> {
    return isFolder(await this.#source.item(unique));
  }

  /**
   * Open a place in a new manager window, as "Open in new window" and a middle-click do.
   * @param place The place.
   * @returns Whether a window opened.
   */
  openInNewWindow(place: UmbraDesktopMediaPlace): boolean {
    return this.#windows?.openApp(UMBRADESKTOP_MEDIA_MANAGER_APP, { location: printLocation(place) }) ?? false;
  }
}

/** The manager window a thing is inside, found by the things core creates in it. */
export const UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT = new UmbContextToken<UmbraDesktopMediaManagerWindowContext>(
  'UmbraDesktopMediaManagerWindowContext',
);
