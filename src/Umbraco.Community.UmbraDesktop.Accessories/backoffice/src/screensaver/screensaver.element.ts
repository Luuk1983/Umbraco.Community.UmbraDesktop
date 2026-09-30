import { SAVERS } from './savers.js';
import type { Random, Saver } from './savers.js';
import { SCREENSAVER_MAX_STEP_MS, SCREENSAVER_WAKE_DISTANCE_PX } from './constants.js';
import type { AccessoriesScreensaverId } from '../settings/settings.js';

/**
 * Where the frame loop gets its frames. The browser's animation frames, which is what a screensaver
 * wants: they stop in a hidden tab, so a screensaver nobody can see costs nothing.
 */
export interface FrameScheduler {
  /** Ask for one frame. */
  request(callback: FrameRequestCallback): number;
  /** Withdraw a request. */
  cancel(handle: number): void;
}

/** The browser's animation frames. */
const ANIMATION_FRAMES: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** The events that end the screensaver, whatever the pointer did. */
const WAKE_EVENTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;

/**
 * One screensaver, running: a canvas and a frame loop.
 *
 * Two uses, one element. **Full screen** (the default) it covers everything, hides the pointer, takes
 * focus, and removes itself at the first key, click, scroll or real mouse movement, announcing that
 * with a `dismiss` event. With **`preview`** it fills its parent instead and never dismisses itself,
 * which is the little monitor in the Screen Saver window.
 *
 * A plain custom element rather than a Lit one: it has no template to render, only a canvas to draw
 * on, and it is appended straight to `document.body`, outside every Umbraco context.
 */
export class ScreensaverElement extends HTMLElement {
  /** Which saver runs. Changing it restarts the picture. */
  static observedAttributes = ['saver'];

  /** Where the savers' randomness comes from. `Math.random` unless a test says otherwise. */
  random: Random = Math.random;

  /**
   * Where frames come from. Animation frames unless a test says otherwise, which it must: the test
   * runner opens several pages at once, and Chrome gives a page in the background no frames at all.
   */
  frames: FrameScheduler = ANIMATION_FRAMES;

  /** The canvas the saver draws on. */
  #canvas = document.createElement('canvas');

  /** The running saver, rebuilt when the size or the choice changes. */
  #saver?: Saver;

  /** The pending animation frame. */
  #frame?: number;

  /** When the last frame was drawn. */
  #last?: number;

  /** Where the pointer first was, for telling a real movement from a knocked desk. */
  #origin?: { x: number; y: number };

  /** Keeps the canvas the size of the element. */
  #resize = new ResizeObserver(() => this.#fit());

  /** Build the shadow root once. */
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; background: #000; }
      :host(:not([preview])) { position: fixed; inset: 0; z-index: 2147483000; cursor: none; outline: none; }
      :host([preview]) { position: absolute; inset: 0; }
      canvas { display: block; width: 100%; height: 100%; }
    `;
    root.append(style, this.#canvas);
  }

  /** Which saver runs. */
  get saver(): AccessoriesScreensaverId {
    const value = this.getAttribute('saver');
    return value && value in SAVERS ? (value as AccessoriesScreensaverId) : 'starfield';
  }

  /** Whether this is the preview in the monitor rather than the real thing. */
  get preview(): boolean {
    return this.hasAttribute('preview');
  }

  /** Start drawing, and in full screen take focus and listen for the person coming back. */
  connectedCallback(): void {
    this.#resize.observe(this);
    this.#fit();
    this.#frame = this.frames.request(this.#draw);
    if (this.preview) return;
    this.tabIndex = -1;
    // Focus leaves whatever field it was in, so a key pressed to wake the desktop wakes it, rather
    // than typing a letter into a content editor behind the screensaver.
    this.focus({ preventScroll: true });
    for (const type of WAKE_EVENTS) window.addEventListener(type, this.dismiss, true);
    window.addEventListener('pointermove', this.#onMove, true);
  }

  /** Stop drawing and listening. */
  disconnectedCallback(): void {
    this.#resize.disconnect();
    if (this.#frame !== undefined) this.frames.cancel(this.#frame);
    this.#frame = undefined;
    for (const type of WAKE_EVENTS) window.removeEventListener(type, this.dismiss, true);
    window.removeEventListener('pointermove', this.#onMove, true);
  }

  /** A different saver: start its picture afresh. */
  attributeChangedCallback(): void {
    this.#saver = undefined;
    this.#fit();
  }

  /**
   * Take the screensaver away, and say so. Does nothing to a preview. Public, so the watcher can end
   * it for activity it hears somewhere this element cannot, inside an iframe.
   * @param event The event that woke the desktop, which is swallowed so a click on the screensaver
   *   does not also click whatever is behind it.
   */
  dismiss = (event?: Event): void => {
    if (this.preview || !this.isConnected) return;
    if (event && event.type !== 'keydown') event.preventDefault();
    event?.stopPropagation();
    this.remove();
    this.dispatchEvent(new CustomEvent('dismiss'));
  };

  /**
   * A pointer movement: remember where it started, and wake only once it has moved far enough.
   * @param event The pointermove.
   */
  #onMove = (event: PointerEvent): void => {
    if (!this.#origin) {
      this.#origin = { x: event.clientX, y: event.clientY };
      return;
    }
    if (Math.hypot(event.clientX - this.#origin.x, event.clientY - this.#origin.y) > SCREENSAVER_WAKE_DISTANCE_PX) {
      this.dismiss(event);
    }
  };

  /** Size the canvas to the element, one canvas pixel per CSS pixel, and start the saver on it. */
  #fit(): void {
    const width = Math.max(1, Math.round(this.clientWidth));
    const height = Math.max(1, Math.round(this.clientHeight));
    if (this.#saver && this.#canvas.width === width && this.#canvas.height === height) return;
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#saver = SAVERS[this.saver](width, height, this.random);
  }

  /**
   * One frame: move the saver on by the time since the last, capped, and draw it.
   * @param now The frame's timestamp.
   */
  #draw = (now: number): void => {
    const elapsed = this.#last === undefined ? 0 : Math.min(now - this.#last, SCREENSAVER_MAX_STEP_MS);
    this.#last = now;
    const context = this.#canvas.getContext('2d');
    if (this.#saver && context) {
      this.#saver.step(elapsed);
      this.#saver.draw(context);
    }
    this.#frame = this.frames.request(this.#draw);
  };
}

if (!customElements.get('umbradesktop-screensaver')) customElements.define('umbradesktop-screensaver', ScreensaverElement);

declare global {
  interface HTMLElementTagNameMap {
    /** Registered above; declared so queries type-check. */
    'umbradesktop-screensaver': ScreensaverElement;
  }
}
