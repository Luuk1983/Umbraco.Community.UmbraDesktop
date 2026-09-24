import './screensaver.element.js';
import type { ScreensaverElement } from './screensaver.element.js';
import { SCREENSAVER_CHECK_INTERVAL_MS, SCREENSAVER_FRAME_SCAN_INTERVAL_MS } from './constants.js';
import type { AccessoriesSettingsSource } from '../settings/settings.source.js';

/** Everything that means somebody is at the desktop. */
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'input'] as const;

/**
 * Whether the page is showing the desktop, from its address: the desktop section's path is
 * `/section/umbradesktop`, the host's `WebAppManifestBuilder.SectionPathname`. An address rather
 * than a search for the desktop element, because the check runs every second and the address is free.
 * @returns True on the desktop.
 */
export function onDesktop(): boolean {
  return /\/section\/umbradesktop(\/|$)/.test(location.pathname);
}

/**
 * Every iframe in the document, including those inside shadow roots, which is where the desktop's
 * windows keep theirs.
 * @param root Where to look.
 * @param found Accumulates the frames.
 * @returns The frames.
 */
function framesIn(root: Document | ShadowRoot, found: HTMLIFrameElement[] = []): HTMLIFrameElement[] {
  for (const element of root.querySelectorAll('*')) {
    if (element instanceof HTMLIFrameElement) found.push(element);
    if (element.shadowRoot) framesIn(element.shadowRoot, found);
  }
  return found;
}

/** What a watcher needs from the world. Injected, so a test can drive the clock and the page. */
export interface ScreensaverWatcherOptions {
  /** The screensaver's settings, followed as they change. */
  settings: AccessoriesSettingsSource;
  /** The time, in ms. `Date.now` unless a test says otherwise. */
  now?: () => number;
  /** Whether the desktop is showing. {@link onDesktop} unless a test says otherwise. */
  onDesktop?: () => boolean;
  /**
   * Whether the page can be seen. The document's visibility unless a test says otherwise, which it
   * must: the test runner opens several pages at once, and Chrome reports some of them hidden.
   */
  visible?: () => boolean;
}

/**
 * Starts the screensaver when the desktop has been left alone for the chosen time.
 *
 * **It listens inside the desktop's iframe windows as well as the page.** Most windows are
 * backoffice pages in same-origin iframes, and an event inside one never reaches the page around it,
 * so a watcher that listened only to the page would start the screensaver over someone busy typing
 * in a content window. Every few seconds it looks for frames it has not heard from, and listens to
 * each new document, since a frame that navigates gets a new one. A cross-origin frame cannot be
 * listened to and is skipped; the desktop has none of its own.
 *
 * Activity heard inside a frame also ends a running screensaver, which the screensaver itself cannot
 * hear from where it is.
 */
export class ScreensaverWatcher {
  /** When somebody last did anything. */
  #lastActivity: number;

  /** The screensaver currently showing, if any. */
  #showing?: ScreensaverElement;

  /** The check timer. */
  #timer?: number;

  /** When the frames were last searched. */
  #lastScan = -Infinity;

  /** Documents already listened to. */
  #heard = new WeakSet<Document>();

  /** Whether the watcher is running. */
  #running = false;

  /** Every listener added, with the window it is on, so {@link stop} can take them all off again. */
  #listeners: { target: Window; listener: () => void }[] = [];

  #now: () => number;
  #onDesktop: () => boolean;
  #visible: () => boolean;

  /** @param options What the watcher needs. */
  constructor(private readonly options: ScreensaverWatcherOptions) {
    this.#now = options.now ?? Date.now;
    this.#onDesktop = options.onDesktop ?? onDesktop;
    this.#visible = options.visible ?? (() => document.visibilityState !== 'hidden');
    this.#lastActivity = this.#now();
  }

  /** Begin watching. */
  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#lastActivity = this.#now();
    this.#listen(window);
    this.#timer = window.setInterval(() => this.tick(), SCREENSAVER_CHECK_INTERVAL_MS);
  }

  /** Stop watching, and take down a screensaver that is showing. */
  stop(): void {
    this.#running = false;
    window.clearInterval(this.#timer);
    for (const { target, listener } of this.#listeners) {
      // A frame that has since been removed has no window to take listeners off, and needs none.
      try {
        for (const type of ACTIVITY_EVENTS) target.removeEventListener(type, listener, true);
      } catch {
        // Gone.
      }
    }
    this.#listeners = [];
    this.#heard = new WeakSet();
    this.#showing?.remove();
    this.#showing = undefined;
  }

  /**
   * Look: listen to any new frames, and start the screensaver if everything says so. Called every
   * second by the timer, and by hand in tests.
   */
  tick(): void {
    if (!this.#running) return;
    const now = this.#now();
    if (now - this.#lastScan >= SCREENSAVER_FRAME_SCAN_INTERVAL_MS) {
      this.#lastScan = now;
      this.#scanFrames();
    }
    const { enabled, saver, waitMinutes } = this.options.settings.value.screensaver;
    if (!enabled || this.#showing?.isConnected || !this.#onDesktop()) return;
    // One started by hand from Preview is not this watcher's, but it is still a screensaver running.
    if (document.body.querySelector(':scope > umbradesktop-screensaver:not([preview])')) return;
    // A hidden tab has nobody to show a screensaver to, and would only burn battery drawing one.
    if (!this.#visible()) return;
    if (now - this.#lastActivity < waitMinutes * 60_000) return;
    const element = document.createElement('umbradesktop-screensaver');
    element.setAttribute('saver', saver);
    element.addEventListener('dismiss', () => (this.#lastActivity = this.#now()));
    document.body.appendChild(element);
    this.#showing = element;
  }

  /**
   * Somebody did something: note when, and wake the desktop if a screensaver is up.
   * @param source The window the activity happened in. Activity on the page itself is the
   *   screensaver's own to judge (it ignores a knocked desk); activity in a frame, which it cannot
   *   hear, is passed on here. Known from which listener fired rather than read off the event,
   *   because only some activity events carry a `view`.
   */
  #onActivity(source: Window): void {
    this.#lastActivity = this.#now();
    if (this.#showing?.isConnected && source !== window) this.#showing.dismiss();
  }

  /**
   * Listen for activity in one window.
   * @param target The window.
   */
  #listen(target: Window): void {
    const listener = (): void => this.#onActivity(target);
    this.#listeners.push({ target, listener });
    for (const type of ACTIVITY_EVENTS) target.addEventListener(type, listener, { capture: true, passive: true });
  }

  /** Listen in every same-origin frame whose current document has not been heard from yet. */
  #scanFrames(): void {
    for (const frame of framesIn(document)) {
      let frameDocument: Document | null = null;
      try {
        frameDocument = frame.contentDocument;
      } catch {
        // Cross-origin: nothing to listen to.
      }
      if (!frameDocument || this.#heard.has(frameDocument) || !frame.contentWindow) continue;
      this.#heard.add(frameDocument);
      this.#listen(frame.contentWindow);
    }
  }
}
