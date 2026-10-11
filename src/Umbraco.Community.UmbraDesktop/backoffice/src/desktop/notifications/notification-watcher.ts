import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { findShadowRootWith, injectStyle } from '../chrome-injector.js';
import { aliasesOf, requestContextFrom } from '../frame-context.js';
import { readNotificationHandler } from './read-handler.js';
import type { UmbraDesktopNotification, UmbraDesktopNotificationSource } from './types.js';

/**
 * Takes one document's notifications over: listens to its notification context, reports every
 * notification raised in it, and hides the toasts it would otherwise draw itself.
 *
 * One watcher per document: every window's frame, and the desktop's own backoffice. Design §4.
 */

/** The container core renders its toasts in. It lives in the shell's shadow root. */
const CONTAINER_SELECTOR = 'umb-backoffice-notification-container';

/** Style-element id for the rule hiding a watched document's toasts. */
const HIDE_STYLE_ID = 'umbradesktop-notifications-hidden';

/**
 * The attribute on a toast the desktop raised again in its own document, on purpose, so the element
 * it carries can be used. The one toast the hiding rule lets through.
 */
export const UMBRADESKTOP_REPLAYED_ATTRIBUTE = 'umbradesktop-replayed';

/**
 * How often, and for how long, to look for the container. The same cadence `injectChromeStyles`
 * polls for the shell at, for longer: a watcher that gives up leaves the document drawing its own
 * toasts, which loses nothing, but a slow boot that outlasted the window's reveal should still be
 * taken over.
 */
const POLL_INTERVAL_MS = 100;
const POLL_TRIES = 300;

/** Taken from the token, so a rename in core breaks the import rather than silently matching nothing. */
const [CONTEXT_ALIAS, API_ALIAS] = aliasesOf(UMB_NOTIFICATION_CONTEXT);

/**
 * The hiding rule, injected into the container's own shadow root.
 *
 * Each toast rather than the container, design §3.2: hiding the container would hide the one toast
 * the desktop raises again for its actions too. The container's popover is never touched, so there
 * is no question of a top-layer element and `display: none`. A hidden toast still runs its own open
 * and close timers, so it leaves its context's list on schedule.
 * @returns A CSS string.
 */
export function buildHiddenToastsCss(): string {
  return `
    uui-toast-notification:not([${UMBRADESKTOP_REPLAYED_ATTRIBUTE}]) { display: none !important; }
  `;
}

/** What this module needs of core's notification context. */
interface NotificationContextLike {
  /** Every live handler, emitted on each change and once straight away on subscribe. */
  notifications: { subscribe(next: (handlers: ReadonlyArray<unknown>) => void): { unsubscribe(): void } };
  /** Raise a notification. */
  peek(color: string, options: { elementName?: string; data?: unknown; duration?: number | null }): { key: string; element?: HTMLElement };
}

/**
 * Whether a context answer is one this module can use.
 * @param instance What the provider handed over.
 * @returns True when it has the two members this needs.
 */
function isNotificationContext(instance: unknown): instance is NotificationContextLike {
  const c = instance as Partial<NotificationContextLike> | null;
  return typeof c?.notifications?.subscribe === 'function' && typeof c?.peek === 'function';
}

/** What this module needs of one of core's handlers to close it: its own 'close()' and its toast. */
interface ReportedHandler {
  /** Core's close: settles the sender's 'onClose()' and starts the toast's close sequence. */
  close?: () => void;
  /** The toast element core built for it. */
  element?: HTMLElement;
}

/** What a watcher tells its owner. */
export interface UmbraDesktopNotificationCallbacks {
  /** A notification was raised, or was already on screen when watching began. */
  onRaised(notification: UmbraDesktopNotification): void;
  /** A notification left its context's list: it closed, or its sender closed it. */
  onClosed?(key: string): void;
}

/** How a watcher treats the document it watches, beyond hiding and reporting. */
export interface UmbraDesktopNotificationWatchOptions {
  /**
   * Which of the handlers it reported, still in the list when it stops, to close before the hiding
   * rule is lifted. Asked of each one's notification as it was reported. Added 2026-09-28.
   *
   * For the desktop's own document only, which outlives the desktop, and there only for what the
   * desktop drew with its own element: leaving the desktop lifts the rule, and such a notification
   * would then turn up again in the classic backoffice with buttons that reach for a desktop that has
   * gone. A plain one is left to carry over, because it still means what it says there: core's
   * offline notice while still offline, or an error that asked to stay.
   *
   * Not for a window's frame. A frame's watcher stops when its frame loads a new document or leaves
   * the page with its window, and either way the document it watched goes with it: there is nothing
   * left to turn up.
   */
  closeOnStop?: (notification: UmbraDesktopNotification) => boolean;
}

/** A running watcher. */
export interface UmbraDesktopNotificationWatch extends UmbraDesktopNotificationSource {
  /**
   * Stop listening and lift the hiding rule, first closing those it reported that it was asked to
   * ({@link UmbraDesktopNotificationWatchOptions.closeOnStop}).
   */
  stop(): void;
}

/**
 * Watch a document's notifications.
 *
 * **Observe first, suppress second**, which the issue decided and which is the only failure here
 * worse than the bug being fixed. The hiding rule goes in only after the subscription is live, so
 * there is no moment in which a notification can be raised, drawn invisibly and closed unseen.
 * Anything already on screen when the subscription starts is reported like a new one, so it moves
 * from the window to the desktop rather than disappearing.
 *
 * The context is asked for **from the container**, not from the document root. A context request
 * travels up the tree, and the container consumes this context itself, so it is a descendant of the
 * provider and its request reaches it. `frame-context.ts` explains why a probe at the root does not.
 * The provide event that module listens for is no use here either: the notification context is
 * provided during boot, before any `load` handler of ours has attached.
 * @param doc The document to watch: a frame's, or the desktop's own.
 * @param callbacks What to tell the owner.
 * @param options How to treat the document when it stops.
 * @returns The running watcher.
 */
export function watchNotifications(
  doc: Document,
  callbacks: UmbraDesktopNotificationCallbacks,
  options: UmbraDesktopNotificationWatchOptions = {},
): UmbraDesktopNotificationWatch {
  const win = doc.defaultView;
  let context: NotificationContextLike | undefined;
  let subscription: { unsubscribe(): void } | undefined;
  let hiddenIn: ShadowRoot | undefined;
  let timer: number | undefined;
  let stopped = false;
  /** Keys of the handlers in the list, as of its last emission. */
  let present = new Set<string>();
  /**
   * The handlers this watcher reported that are still in the list, by key: the originals of what
   * the desktop is showing, and so the ones it may close ({@link UmbraDesktopNotificationSource.close},
   * and on stop when asked). Never a replayed one, which is shown on purpose, nor one the reader
   * could not read and so never reported. Held only while they are in the list, and only by this
   * watcher, which goes when its document does. Each with the notification it was reported as, which
   * is what {@link UmbraDesktopNotificationWatchOptions.closeOnStop} is asked about.
   */
  const reported = new Map<string, { handler: ReportedHandler; notification: UmbraDesktopNotification }>();
  /**
   * Set while this watcher is raising something again itself, so the handler that produces is not
   * reported as new. Core's state emits synchronously inside `peek`, which is what makes a flag
   * enough; the key is also added after the call returns, in case a future core defers the emission.
   */
  let replaying = false;
  const replayed = new Set<string>();

  /**
   * Take in one emission of the context's list.
   * @param handlers Every live handler.
   */
  const onList = (handlers: ReadonlyArray<unknown>) => {
    const next = new Set<string>();
    for (const handler of handlers) {
      const key = (handler as { key?: unknown })?.key;
      if (typeof key !== 'string') continue;
      next.add(key);
      if (present.has(key)) continue;
      if (replaying) {
        replayed.add(key);
        continue;
      }
      if (replayed.has(key)) continue;
      const notification = readNotificationHandler(handler);
      if (!notification) continue;
      reported.set(key, { handler: handler as ReportedHandler, notification });
      callbacks.onRaised(notification);
    }
    for (const key of present) {
      if (next.has(key)) continue;
      replayed.delete(key);
      reported.delete(key);
      callbacks.onClosed?.(key);
    }
    present = next;
  };

  /**
   * One attempt at taking the document over.
   * @returns True once there is nothing left to do.
   */
  const tick = (): boolean => {
    if (stopped) return true;
    const root = findShadowRootWith(doc, CONTAINER_SELECTOR);
    const container = root?.querySelector(CONTAINER_SELECTOR) as HTMLElement | null | undefined;
    const containerRoot = container?.shadowRoot;
    if (!container || !containerRoot) return false;
    requestContextFrom(container, CONTEXT_ALIAS, API_ALIAS, (instance) => {
      if (!isNotificationContext(instance)) return false;
      context = instance;
      return true;
    });
    if (!context) return false;
    subscription = context.notifications.subscribe(onList);
    // Only now, with the subscription live. See the function's doc.
    injectStyle(containerRoot, doc, HIDE_STYLE_ID, buildHiddenToastsCss());
    hiddenIn = containerRoot;
    return true;
  };

  /**
   * Close one reported handler in the document, the way its sender would. Its toast is hidden where
   * it stands first: core's close runs an animation before the toast leaves the list, and on stop
   * the hiding rule is lifted straight after, so without this it would flash up while it went. The
   * close sequence is timers, not transitions, so a hidden toast still finishes it (design §3.2).
   * Guarded, because it is someone else's object and a throw here would stop the rest.
   *
   * One edge UUI leaves: a toast closed before its opening animation frame has run (raised and
   * closed within the same frame) never fires 'closed', because 'uui-toast-notification' only
   * dispatches it at the end of a close that follows an open. Core's container removes a handler
   * from the list on that event, so this one stays in the list. The sender's 'onClose()' has still
   * settled, and the inline hide below keeps it invisible even with the rule lifted. The cost is a
   * handler left in the list, which a watcher started later (the desktop entered again) reports as
   * already on screen.
   * @param key The handler's key.
   */
  const closeReported = (key: string) => {
    const handler = reported.get(key)?.handler;
    if (!handler) return;
    reported.delete(key);
    try {
      handler.element?.style.setProperty('display', 'none', 'important');
      handler.close?.();
    } catch {
      // A handler that cannot be closed is left to its own timer, as it was before this existed.
    }
  };

  if (win && !tick()) {
    let tries = 0;
    timer = win.setInterval(() => {
      if (tick() || (tries += 1) > POLL_TRIES) {
        win.clearInterval(timer);
        timer = undefined;
      }
    }, POLL_INTERVAL_MS);
  }

  return {
    reraise(notification) {
      if (!context || stopped) return;
      replaying = true;
      let handler: { key: string; element?: HTMLElement } | undefined;
      try {
        handler = context.peek(notification.color, {
          elementName: notification.element?.name,
          data: notification.element?.data ?? { headline: notification.headline, message: notification.message },
          duration: notification.duration,
        });
      } finally {
        replaying = false;
      }
      if (!handler) return;
      replayed.add(handler.key);
      present.add(handler.key);
      handler.element?.setAttribute(UMBRADESKTOP_REPLAYED_ATTRIBUTE, '');
    },
    close(key) {
      if (stopped) return;
      closeReported(key);
    },
    stop() {
      stopped = true;
      if (timer !== undefined) win?.clearInterval(timer);
      // Unsubscribed first, so the closes below are not reported back to a desktop that is leaving.
      subscription?.unsubscribe();
      // Before the rule is lifted, or they would show for a moment in the document. See the option.
      if (options.closeOnStop) {
        for (const [key, { notification }] of [...reported]) if (options.closeOnStop(notification)) closeReported(key);
      }
      reported.clear();
      hiddenIn?.getElementById(HIDE_STYLE_ID)?.remove();
      hiddenIn = undefined;
      context = undefined;
    },
  };
}
