import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_ACTION_EVENT_CONTEXT } from '@umbraco-cms/backoffice/action';
import { UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT } from '@umbraco-cms/backoffice/management-api';
import { UmbEntityUpdatedEvent, UmbRequestReloadStructureForEntityEvent } from '@umbraco-cms/backoffice/entity-action';
import { clearImagingCache } from '@umbraco-cms/backoffice/imaging';

/** The server events this acts on: changes to media items, by anyone. */
const MEDIA_SOURCE = 'Umbraco:CMS:Media';

/** The event types that change what a thumbnail or a list shows. */
const HANDLED_TYPES = ['Updated', 'Trashed', 'Deleted'];

/**
 * How long a burst of events is gathered before it is acted on, in ms. Umbraco sends one event per
 * item (sorting a folder of fifty is fifty `Updated` events at once), and each list reload is a
 * request, so a burst is gathered and each item acted on once.
 */
const BURST_WAIT_MS = 150;

/** What the controller reaches outside itself with. Injectable, so a test needs no server and no address bar. */
export interface UmbraDesktopMediaChangeDeps {
  /** Clears an item's cached thumbnail addresses. */
  clear: (unique: string) => void;
  /** Whether an item page for that media item is open in this page, in the address or a modal. */
  showsItem: (unique: string) => boolean;
  /** How long a burst is gathered, in ms. */
  wait: number;
}

/** The real dependencies: core's thumbnail cache, this page's address, the burst wait above. */
const REAL_DEPS: UmbraDesktopMediaChangeDeps = {
  clear: clearImagingCache,
  // A media item page's address carries its key, in a section (`…/workspace/media/edit/<key>`) and
  // in a modal over another page (`…/modal/umb-modal-workspace/media/edit/<key>`), as the Media
  // Manager's item pane and "Open in Media Library" show it.
  showsItem: (unique) => window.location.pathname.includes(unique),
  wait: BURST_WAIT_MS,
};

/**
 * Keeps one backoffice page's media thumbnails and lists up to date with the server (#137).
 *
 * Core's thumbnails and lists load an item again only when the same page says it changed: core's
 * media workspace dispatches `UmbEntityUpdatedEvent` after its own save, and a thumbnail listens for
 * it. A change made anywhere else (in another window, by the Image Editor, by another person) reaches
 * every page as a server event, which core uses to drop its item caches but not to redraw. So a Media
 * section window went on showing an image's old picture after the Image Editor saved over it, until
 * its folder was opened again.
 *
 * For each media item the server reports, once per burst: its thumbnail addresses are cleared
 * (`clearImagingCache`); an updated one is announced with `UmbEntityUpdatedEvent`, so its thumbnails
 * ask for the new address; a binned or deleted one asks the lists showing it to load again
 * (`UmbRequestReloadStructureForEntityEvent`), so it leaves them. An updated item does not reload the
 * lists: what they show of it besides the picture is its name, and a list reload per item of a sorted
 * folder is the storm the burst wait is there to avoid.
 *
 * **An item page open in this page is never announced to.** Core's media workspace reloads on
 * `UmbEntityUpdatedEvent` and replaces unsaved edits with the server's version; the desktop's
 * server-event router (`conflict/server-event.router.ts`) already reloads a clean one and puts the
 * "changed elsewhere" banner on one with unsaved edits. So that page is left to it.
 *
 * **It must run in the page it serves.** Core checks the event with `instanceof` against its own
 * class, and every frame has its own copy of core's classes, so an event built on the desktop page
 * means nothing in a window's frame. Hence an entry point starts one in each window's frame
 * (`media-change.entrypoint.ts`), and the desktop element starts one on the desktop page. Never in
 * the plain backoffice, whose behaviour stays core's.
 */
export class UmbraDesktopMediaChangeController extends UmbControllerBase {
  /** The page's action event context, where core's thumbnails and lists listen. */
  #events?: EventTarget;

  /** What the controller reaches outside itself with. */
  readonly #deps: UmbraDesktopMediaChangeDeps;

  /** The items of the burst being gathered, by key, and whether each was removed rather than updated. */
  #pending = new Map<string, boolean>();

  /** The timer that ends the burst, while one is being gathered. */
  #timer?: ReturnType<typeof setTimeout>;

  /**
   * @param host Where the page's global contexts are found.
   * @param deps What it reaches outside itself with; the real ones by default.
   */
  constructor(host: UmbControllerHost, deps: UmbraDesktopMediaChangeDeps = REAL_DEPS) {
    super(host);
    this.#deps = deps;
    this.consumeContext(UMB_ACTION_EVENT_CONTEXT, (events) => (this.#events = events ?? undefined));
    this.consumeContext(UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT, (server) => {
      if (!server) return;
      this.observe(
        server.byEventSourcesAndEventTypes([MEDIA_SOURCE], HANDLED_TYPES),
        (event) => event?.key && this.#gather(event.key, event.eventType !== 'Updated'),
        'umbradesktopMediaChanges',
      );
    });
  }

  /** Stop the burst timer along with the controller. */
  override destroy(): void {
    clearTimeout(this.#timer);
    super.destroy();
  }

  /**
   * Add one item to the burst, and start the burst's wait if this is its first.
   * @param unique The item.
   * @param removed Whether it was binned or deleted; once removed in a burst, it stays removed.
   */
  #gather(unique: string, removed: boolean): void {
    this.#pending.set(unique, removed || this.#pending.get(unique) === true);
    this.#timer ??= setTimeout(() => this.#flush(), this.#deps.wait);
  }

  /** Act on the burst, once per item. */
  #flush(): void {
    this.#timer = undefined;
    const burst = [...this.#pending];
    this.#pending.clear();
    for (const [unique, removed] of burst) {
      this.#deps.clear(unique);
      if (this.#deps.showsItem(unique)) continue;
      const entity = { entityType: 'media', unique };
      this.#events?.dispatchEvent(removed ? new UmbRequestReloadStructureForEntityEvent(entity) : new UmbEntityUpdatedEvent(entity));
    }
  }
}
