import { createServerEventRouter, type UmbraDesktopServerEvent } from './server-event.router.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT } from '@umbraco-cms/backoffice/management-api';

/**
 * Connects Umbraco's live change notifications to the desktop's windows.
 *
 * Consumed **once, in the desktop's own document**, not once per frame, because the desktop is the
 * only place that knows what every window is showing. A frame could only ever route events to
 * itself, so per-frame consumption would learn the same facts N times and still need this.
 *
 * Not, as this comment used to claim, to hold down a connection count. That was measured under
 * issue #36 and is a non-problem: the hub is a WebSocket, and those have their own per-host budget
 * of 255, entirely separate from the ~6 concurrent HTTP requests a browser allows per origin. The
 * frames each keep their own hub connection regardless of what this class does, and must, because
 * 25 of Umbraco's client caches invalidate off that same feed. Suppressing it in a frame would
 * trade an invisible saving for silently stale data.
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
