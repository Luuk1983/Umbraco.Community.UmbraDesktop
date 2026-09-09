import { createServerEventRouter, type UmbraDesktopServerEvent } from './server-event.router.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT } from '@umbraco-cms/backoffice/management-api';

/**
 * Connects Umbraco's live change notifications to the desktop's windows.
 *
 * Consumed **once, in the desktop's own document**, not once per frame. The context is a
 * `globalContext`, so there is one instance per backoffice document, and every window is a
 * backoffice document already holding its own hub connection: consuming it per window would
 * multiply a connection count that is already a known problem, to learn the same facts several
 * times over.
 *
 * Everything this class does beyond plumbing lives in `server-event.router.ts`, which is why this
 * file has no tests of its own: there is nothing here that can be wrong without the context itself
 * being wrong.
 */
export class UmbraDesktopServerEventController extends UmbControllerBase {
  /** The router this feeds. */
  #router: ReturnType<typeof createServerEventRouter>;

  /**
   * @param host The desktop element.
   * @param manager The window manager, which is both the window source and the flag sink.
   */
  constructor(host: UmbControllerHost, manager: UmbraDesktopWindowManagerContext) {
    super(host);
    this.#router = createServerEventRouter({
      windows: () => manager.getWindows(),
      subjectsOf: (id) => manager.subjectsOf(id),
      setServerState: (id, patch) => manager.setServerState(id, patch),
      setRefreshing: (id, refreshing) => manager.setRefreshing(id, refreshing),
    });
    this.consumeContext(UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT, (context) => {
      if (!context) return;
      this.observe(
        context.events,
        (event) => {
          if (event) void this.#router.handleEvent(event as UmbraDesktopServerEvent);
        },
        'observeServerEvents',
      );
    });
  }
}
