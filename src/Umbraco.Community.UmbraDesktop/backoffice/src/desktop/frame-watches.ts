import type { UmbraDesktopChromeProfile } from './types.js';
import { injectChromeStyles } from './chrome-injector.js';
import { watchWorkspaceDirtyState } from './dirty-watcher.js';
import type { UmbraDesktopWorkspaceSubject } from './dirty-watcher.js';
import { watchFrameUploads } from './progress/upload-watcher.js';
import type { UmbraDesktopTask } from './progress/progress.js';
import { watchNotifications } from './notifications/notification-watcher.js';
import type { UmbraDesktopNotificationCentreContext } from './notifications/notification-centre.context.js';
import { resolveThemeSync, syncThemeStylesheet } from './iframe-theme.js';
import type { UmbraDesktopThemeManifest } from './iframe-theme.js';
import { UMBRADESKTOP_OPEN_HELP_EVENT } from './constants.js';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_THEME_CONTEXT, UMB_THEME_LIGHT_ALIAS } from '@umbraco-cms/backoffice/themes';

/**
 * The watches a backoffice frame gets, whichever element draws it (#144, plan task 2.1).
 *
 * A window's body was the only backoffice frame on the desktop, so it held all of this itself. A pane
 * can now hold one too (a media item beside its Media Manager window), and it needs the same chrome
 * stripping, theme, unsaved-changes, notification and Help handling. One copy here rather than a
 * second in the pane, because these watches are subtle and two copies drift. The window keeps the
 * two that only a window has: the path strip and the views beside the editor.
 */

/** One of the watches a frame can get. */
export type UmbraDesktopFrameWatch = 'chrome' | 'theme' | 'dirty' | 'location' | 'notifications' | 'help' | 'uploads';

/**
 * Where a frame's watches report. Each watch calls only its own members, so a caller fills in what
 * it asked for and leaves the rest out.
 */
export interface UmbraDesktopFrameSink {
  /** How much of the backoffice's chrome to strip, for the `chrome` watch. */
  chromeProfile?: UmbraDesktopChromeProfile;
  /**
   * Whether the frame sits beside a window rather than filling one, for the `chrome` watch (#144).
   * Core gives its app element a minimum width of 920px, so a narrower frame lays out at 920 and
   * cuts off its right side: the Save button and the workspace's views. Attached content is narrower
   * than that by design, so the watch lifts the minimum there. A window of its own keeps it.
   */
  narrow?: boolean;
  /** The header is stripped, so the frame may be shown. Called once per start, by `chrome`. */
  loaded?(): void;
  /** Bring the frame onto the desktop's light or dark theme; called once on start, by `theme`. */
  applyTheme?(): void;
  /**
   * Whether the frame holds unsaved changes, from `dirty`. Reset to false on start: the frame was
   * just loaded from the server.
   * @param dirty Whether it does.
   */
  setDirty?(dirty: boolean): void;
  /**
   * What the frame's workspaces show, from `dirty`. Reset to none on start.
   * @param subjects The subjects.
   */
  setSubjects?(subjects: ReadonlyArray<UmbraDesktopWorkspaceSubject>): void;
  /**
   * How often a document in the frame has had a new saved version, from `dirty`.
   * @param saves The count.
   */
  setSaves?(saves: number): void;
  /**
   * The page the frame is on, as a path on this site, from `location`: on start and on each route.
   * @param location The path, with any query and hash.
   */
  setLocation?(location: string): void;
  /**
   * Core's uploads in flight in the frame, from `uploads`. Reset to none on start.
   * @param tasks The uploads.
   */
  setTasks?(tasks: ReadonlyArray<UmbraDesktopTask>): void;
  /**
   * Something in the frame asked for Help, from `help`.
   * @param target The Help target it named.
   */
  openHelp?(target: string): void;
  /**
   * Where the frame's notifications go, for `notifications`. Without it the watch does not start,
   * because a watcher hides the frame's own toasts and must have somewhere to show them.
   */
  notifications?: {
    /** The desktop's notification centre. */
    centre: UmbraDesktopNotificationCentreContext;
    /** The id the frame registers under, where a notification can be raised again. */
    sourceId: string;
    /** The name the centre shows as the source; read when a notification arrives. */
    source: () => string;
  };
}

/** The running watches of each frame, so a second start stops the first. */
const running = new WeakMap<HTMLIFrameElement, () => void>();

/**
 * Start the named watches on a freshly loaded frame, stopping whatever was watching it before.
 *
 * Called on every load, because a reload replaces the frame's document and window and the previous
 * watches' listeners with them. Keyed by the frame element, which a reload keeps.
 * @param iframe The loaded frame.
 * @param sink Where the watches report.
 * @param which The watches to start.
 * @returns Stops every watch this call started.
 */
export function startFrameWatches(
  iframe: HTMLIFrameElement,
  sink: UmbraDesktopFrameSink,
  which: ReadonlyArray<UmbraDesktopFrameWatch>,
): () => void {
  running.get(iframe)?.();
  const stops: Array<() => void> = [];
  const doc = iframe.contentDocument;
  const frame = iframe.contentWindow;
  const wants = new Set(which);

  if (wants.has('chrome')) {
    injectChromeStyles(iframe, sink.chromeProfile ?? 'bare', () => sink.loaded?.());
    if (doc && sink.narrow) allowNarrow(doc);
  }
  if (doc && wants.has('uploads')) {
    // A reload replaces the document and every upload in it, so whatever the old frame reported is
    // over: cleared here rather than left for a watcher that will never hear from that frame again.
    sink.setTasks?.([]);
    stops.push(watchFrameUploads(doc, (tasks) => sink.setTasks?.(tasks)));
  }
  if (doc && wants.has('dirty')) {
    sink.setDirty?.(false);
    // Subjects cleared too. A reload replaces the frame's document, so the previous subjects' getters
    // close over a dead realm, and before the new watcher's first report a server event could match
    // a document the frame is no longer showing.
    sink.setSubjects?.([]);
    stops.push(
      watchWorkspaceDirtyState(doc, (state) => {
        sink.setDirty?.(state.dirty);
        sink.setSubjects?.(state.subjects);
        sink.setSaves?.(state.saves);
      }),
    );
  }
  if (frame && doc && wants.has('location')) stops.push(watchLocation(frame, sink));
  if (frame && wants.has('help')) stops.push(watchHelp(frame, sink));
  if (doc && wants.has('notifications') && sink.notifications) stops.push(watchFrameNotifications(doc, sink.notifications));
  if (wants.has('theme')) sink.applyTheme?.();

  const stop = () => {
    for (const each of stops.splice(0)) each();
    if (running.get(iframe) === stop) running.delete(iframe);
  };
  running.set(iframe, stop);
  return stop;
}

/** The id of the rule that lifts the backoffice's minimum width in a frame beside a window. */
const NARROW_STYLE_ID = 'umbradesktop-injected-narrow';

/**
 * Let a frame's backoffice lay out narrower than its own minimum. A rule in the document beats core's
 * `:host` rule on its app element, which is how core's style is overridden without touching it.
 * @param doc The frame's document.
 */
function allowNarrow(doc: Document): void {
  if (doc.getElementById(NARROW_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = NARROW_STYLE_ID;
  style.textContent = 'umb-app { min-width: 0 !important; }';
  (doc.head ?? doc.documentElement).appendChild(style);
}

/**
 * Route a frame to a page through its own history, as a link click inside it would.
 *
 * A route change rather than a load, so the frame keeps the backoffice it has booted. The push is
 * what core's router guards: a workspace holding unsaved changes refuses it and asks, inside the
 * frame, with core's own dialog, and routes there itself if the editor discards. The `popstate` is
 * what makes the router render the new entry, so it is sent only when the push moved the frame: sent
 * after a refused push, it makes the router navigate again, and core closes its dialog on that
 * (measured in a real backoffice, 2026-10-17).
 * @param iframe The frame.
 * @param path The page, as a path on this site.
 */
export function routeFrame(iframe: HTMLIFrameElement, path: string): void {
  const frame = iframe.contentWindow;
  if (!frame) return;
  const before = frame.location.href;
  frame.history.pushState(null, '', path);
  if (frame.location.href !== before) frame.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Follow the page the frame is on: once now, then on each of the router's `changestate` events and
 * the browser's `popstate`. The address, not the workspace's structure, because the address is what
 * gets back there.
 * @param frame The frame's window.
 * @param sink Where to report.
 * @returns Stops following.
 */
function watchLocation(frame: Window, sink: UmbraDesktopFrameSink): () => void {
  const report = () => {
    let location: string;
    try {
      const { pathname, search, hash } = frame.location;
      location = pathname + search + hash;
    } catch {
      // The frame has gone cross-origin, which a backoffice frame never does. Nothing to record.
      return;
    }
    if (location.startsWith('/')) sink.setLocation?.(location);
  };
  report();
  frame.addEventListener('changestate', report);
  frame.addEventListener('popstate', report);
  return () => {
    frame.removeEventListener('changestate', report);
    frame.removeEventListener('popstate', report);
  };
}

/**
 * Pass requests for Help made inside the frame on (Help design D9). An event stops at the frame's
 * window, and the desktop's Help context cannot be reached from in there, so the target string is
 * carried across; the detail object belongs to the frame's realm and is not.
 * @param frame The frame's window.
 * @param sink Where to report.
 * @returns Stops passing them on.
 */
function watchHelp(frame: Window, sink: UmbraDesktopFrameSink): () => void {
  const forward = (event: Event) => {
    const target = (event as CustomEvent<{ target?: unknown }>).detail?.target;
    if (typeof target !== 'string') return;
    event.stopPropagation();
    sink.openHelp?.(target);
  };
  frame.addEventListener(UMBRADESKTOP_OPEN_HELP_EVENT, forward);
  return () => frame.removeEventListener(UMBRADESKTOP_OPEN_HELP_EVENT, forward);
}

/**
 * Take the frame's notifications over, so they show once on the desktop rather than inside the
 * frame, and register the frame as where a notification can be raised again.
 * @param doc The frame's document.
 * @param target Where they go.
 * @returns Stops the watcher and takes the frame off the centre's list.
 */
function watchFrameNotifications(doc: Document, target: NonNullable<UmbraDesktopFrameSink['notifications']>): () => void {
  const { centre, sourceId } = target;
  const watch = watchNotifications(doc, {
    // The source's name as the catalogue has it, possibly a `#key`: the centre localizes it when it
    // is drawn, so an entry follows a language change rather than keeping the one it arrived in.
    onRaised: (notification) => centre.raise(notification, { sourceId, source: target.source() }),
    onClosed: (key) => centre.closed(sourceId, key),
  });
  const unregister = centre.registerSource(sourceId, watch);
  return () => {
    unregister();
    watch.stop();
  };
}

/**
 * Keeps a backoffice frame on the desktop's light or dark theme, for a window or a pane.
 *
 * A frame only takes its theme from its own head, and Umbraco's theme context reads the stored alias
 * once, when it boots, so a frame open when the theme changed would stay on the old one until it was
 * reloaded. Swapping the same stylesheet link Umbraco itself swaps costs nothing; reloading would cost
 * an editor anything unsaved, which is far too much for a display preference.
 */
export class UmbraDesktopFrameThemeController extends UmbControllerBase {
  /** The backoffice light/dark theme in force, as `UMB_THEME_CONTEXT` reports it. */
  #alias: string = UMB_THEME_LIGHT_ALIAS;

  /** Every registered `theme` extension, so a theme's stylesheet can be looked up by alias. */
  #themes: ReadonlyArray<UmbraDesktopThemeManifest> = [];

  /**
   * The alias the frame was last brought in line with. Undefined until the first sync, which is what
   * keeps a frame that booted on a JS-loaded theme from reloading itself on sight, and, since a
   * reload comes back through the load handler, from doing so forever.
   */
  #synced?: string;

  /** The frame's document, when there is one to reach. */
  #frameDocument: () => Document | undefined;

  /** Reloads the frame, for a theme whose CSS cannot be mirrored. */
  #reload: () => void;

  /**
   * @param host The element drawing the frame.
   * @param frameDocument Gives the frame's document, or undefined while there is none.
   * @param reload Reloads the frame silently.
   */
  constructor(host: UmbControllerHost, frameDocument: () => Document | undefined, reload: () => void) {
    super(host);
    this.#frameDocument = frameDocument;
    this.#reload = reload;
    this.consumeContext(UMB_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.theme, (alias) => {
        this.#alias = alias || UMB_THEME_LIGHT_ALIAS;
        this.apply();
      });
    });
    this.observe(umbExtensionsRegistry.byType('theme'), (themes) => {
      this.#themes = themes;
      this.apply();
    });
  }

  /**
   * Put the frame on the theme in force. Does nothing without a frame document, which is also what
   * keeps an element body from ever being reloaded by a theme change.
   */
  apply(): void {
    const doc = this.#frameDocument();
    if (!doc) return;
    const sync = resolveThemeSync(this.#themes, this.#alias);
    if (sync.mirrorable) {
      syncThemeStylesheet(doc, sync);
    } else if (this.#synced !== undefined && this.#synced !== this.#alias) {
      // A theme whose CSS is a loader function has no link to copy. Reloading hands the job to the
      // frame's own theme context, which loads it exactly as it would on a fresh boot.
      this.#reload();
    }
    this.#synced = this.#alias;
  }
}
