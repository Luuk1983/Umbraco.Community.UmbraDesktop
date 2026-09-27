import { UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT } from '../notifications/notification-centre.context-token.js';
import type { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import { notificationIconName } from '../notifications/severity.js';
import type { UmbraDesktopToast } from '../notifications/types.js';
import { UMBRADESKTOP_Z_TOASTS } from '../constants.js';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** One toast's timer: the handle, when it started, and how long it had left when it started. */
interface ToastTimer {
  /** The generation it was started for; a new one means a repeat arrived and it starts over. */
  generation: number;
  /** The pending timeout, or undefined while paused. */
  handle?: number;
  /** When the current run started. */
  startedAt: number;
  /** How long the current run was for. */
  remaining: number;
}

/**
 * The desktop's toasts: every notification raised anywhere on the desktop, drawn once.
 *
 * Each toast closes after the duration its sender chose, or stays when the sender asked it to, and
 * the whole stack holds still while the pointer is over it, the way core's own container does, so a
 * message being read does not close under the reader. Clicking a toast takes you to the window that
 * raised it.
 *
 * Placed by the theme: the stack's four offsets and its direction are tokens, so a theme can hang it
 * under a menu bar as easily as over a tray. Design §5.
 */
@customElement('umbradesktop-toasts')
export class UmbraDesktopToastsElement extends UmbLitElement {
  /** The toasts showing, oldest first. */
  @state()
  private _toasts: ReadonlyArray<UmbraDesktopToast> = [];

  /** The centre the toasts come from, and that clicks go back to. */
  #centre?: UmbraDesktopNotificationCentreContext;

  /** Each timed toast's timer, by toast id. */
  #timers = new Map<string, ToastTimer>();

  /** Whether the pointer is over the stack, which holds every timer. */
  #pointerOver = false;

  /** Whether the list behind the clock is open, which hides the stack and holds every timer. */
  @state()
  private _aside = false;

  /**
   * Whether the timers are held, for either reason. Held rather than left running behind the list,
   * so a toast somebody has not seen yet is still there when they close it.
   * @returns True while nothing should time out.
   */
  get #held(): boolean {
    return this.#pointerOver || this._aside;
  }

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT, (centre) => {
      this.#centre = centre;
      if (!centre) return;
      this.observe(centre.toasts, (toasts) => (this._toasts = toasts), '_toasts');
      this.observe(
        centre.listOpen,
        (open) => {
          this._aside = open;
          if (open) this.#pause();
          else this.#resume();
        },
        '_aside',
      );
    });
  }

  /**
   * Start, restart or drop timers so they match the toasts now showing.
   * @param changed The properties this update is for.
   */
  override updated(changed: Map<string, unknown>) {
    super.updated(changed);
    if (!changed.has('_toasts')) return;
    const showing = new Set(this._toasts.map((t) => t.id));
    for (const [id, timer] of this.#timers) {
      if (showing.has(id)) continue;
      window.clearTimeout(timer.handle);
      this.#timers.delete(id);
    }
    for (const toast of this._toasts) {
      const duration = toast.notification.duration;
      const existing = this.#timers.get(toast.id);
      if (existing?.generation === toast.generation) continue;
      window.clearTimeout(existing?.handle);
      this.#timers.delete(toast.id);
      if (duration === null) continue;
      const timer: ToastTimer = { generation: toast.generation, startedAt: 0, remaining: duration };
      this.#timers.set(toast.id, timer);
      if (!this.#held) this.#run(toast.id, timer);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    for (const timer of this.#timers.values()) window.clearTimeout(timer.handle);
    this.#timers.clear();
  }

  /**
   * Set a timer running for whatever it has left.
   * @param id The toast it belongs to.
   * @param timer The timer.
   */
  #run(id: string, timer: ToastTimer) {
    timer.startedAt = Date.now();
    timer.handle = window.setTimeout(() => {
      this.#timers.delete(id);
      this.#centre?.dismiss(id);
    }, timer.remaining);
  }

  /** Hold every timer while the pointer is over the stack. */
  #onPointerEnter = () => {
    this.#pointerOver = true;
    this.#pause();
  };

  /** Let every timer run on once the pointer leaves, unless the list is still holding them. */
  #onPointerLeave = () => {
    this.#pointerOver = false;
    this.#resume();
  };

  /** Stop every running timer, keeping what it had left. */
  #pause() {
    for (const timer of this.#timers.values()) {
      if (timer.handle === undefined) continue;
      window.clearTimeout(timer.handle);
      timer.handle = undefined;
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
    }
  }

  /** Start every stopped timer again, if nothing is still holding them. */
  #resume() {
    if (this.#held) return;
    for (const [id, timer] of this.#timers) if (timer.handle === undefined) this.#run(id, timer);
  }

  /**
   * One toast.
   *
   * Two buttons rather than one clickable box with a close control inside it, because a button
   * inside a button is not a thing HTML allows, and because the two do different things: the body
   * takes you to the window, the cross only takes the toast away.
   * @param toast The toast.
   * @returns Its template.
   */
  #renderToast(toast: UmbraDesktopToast) {
    const n = toast.notification;
    const source = this.localize.string(toast.source);
    return html`<div class="toast" data-color=${n.color} role="status">
      <button class="toast-body" @click=${() => this.#centre?.activate(toast)}>
        <umb-icon class="toast-icon" name=${notificationIconName(n.color)} aria-hidden="true"></umb-icon>
        <span class="toast-text">
          ${n.headline ? html`<strong class="toast-headline">${n.headline}</strong>` : nothing}
          <span class="toast-message">${n.message}</span>
          <span class="toast-meta">
            <span class="toast-source">${source}</span>
            ${toast.count > 1
              ? html`<span class="toast-count" title=${this.localize.term('umbraDesktop_notificationsRepeat', toast.count)}
                  >×${toast.count}</span
                >`
              : nothing}
          </span>
        </span>
      </button>
      <button
        class="toast-close"
        title=${this.localize.term('umbraDesktop_notificationsClose')}
        aria-label=${this.localize.term('umbraDesktop_notificationsClose')}
        @click=${() => this.#centre?.dismiss(toast.id)}>
        <!-- Drawn rather than taken from the icon set: Umbraco's 'icon-remove' is a bin, and this
             button takes a toast off the screen, it deletes nothing. The same cross the window's own
             close control draws. -->
        <svg class="glyph" viewBox="0 0 12 12" aria-hidden="true">
          <line x1="3" y1="3" x2="9" y2="9"></line>
          <line x1="9" y1="3" x2="3" y2="9"></line>
        </svg>
      </button>
    </div>`;
  }

  override render() {
    return html`<div
      class="stack ${this._aside ? 'aside' : ''}"
      aria-live="polite"
      @pointerenter=${this.#onPointerEnter}
      @pointerleave=${this.#onPointerLeave}>
      ${repeat(this._toasts, (t) => t.id, (t) => this.#renderToast(t))}
    </div>`;
  }

  static override styles = [
    css`
      :host {
        display: contents;
      }
      /* Placement is the theme's, all five values of it: the default hangs the stack above the
         taskbar at the trailing edge and grows it upwards, which is where Windows puts them. A theme
         with its bar at the top sets 'top', clears 'bottom' and turns the direction round. The
         stack itself takes no pointer events, so the gap between toasts is still desktop. */
      .stack {
        position: absolute;
        top: var(--umbradesktop-toasts-top, auto);
        right: var(--umbradesktop-toasts-right, var(--uui-size-space-4));
        bottom: var(
          --umbradesktop-toasts-bottom,
          calc(var(--umbradesktop-taskbar-reserve, 50px) + var(--uui-size-space-4))
        );
        left: var(--umbradesktop-toasts-left, auto);
        display: flex;
        flex-direction: var(--umbradesktop-toasts-direction, column-reverse);
        gap: var(--uui-size-space-3);
        width: var(--umbradesktop-toast-width, 360px);
        max-width: calc(100% - 2 * var(--uui-size-space-4));
        pointer-events: none;
        z-index: ${UMBRADESKTOP_Z_TOASTS};
      }
      /* Out of sight while the list behind the clock is open, and out of the accessibility tree with
         it, since 'visibility: hidden' takes both. Hidden rather than unrendered, so the toasts keep
         their place and their timers and come back as they were. */
      .stack.aside {
        visibility: hidden;
      }
      /* The surface is the launcher's by default, because a toast is a small panel over the desktop
         and the launcher is the one panel every theme has already drawn. The severity is an edge
         and an icon, the way the window notice strip carries it, so a toast and a strip saying the
         same thing look like the same kind of thing. Single quotes in these comments, never
         backticks: a backtick would close the template literal. */
      .toast {
        --toast-accent: var(--umbradesktop-notice-info-color, var(--uui-color-default-standalone));
        display: flex;
        align-items: flex-start;
        pointer-events: auto;
        box-sizing: border-box;
        overflow: hidden;
        background: var(--umbradesktop-toast-background, var(--umbradesktop-launcher-background, var(--uui-color-surface)));
        backdrop-filter: var(--umbradesktop-toast-backdrop, var(--umbradesktop-launcher-backdrop, none));
        -webkit-backdrop-filter: var(--umbradesktop-toast-backdrop, var(--umbradesktop-launcher-backdrop, none));
        color: var(--umbradesktop-toast-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
        border: var(--umbradesktop-toast-border, var(--umbradesktop-launcher-border, 1px solid var(--uui-color-border)));
        border-inline-start: var(--umbradesktop-notice-border-width, 4px) solid var(--toast-accent);
        border-radius: var(--umbradesktop-toast-radius, var(--umbradesktop-launcher-radius, var(--uui-border-radius)));
        box-shadow: var(--umbradesktop-toast-shadow, var(--umbradesktop-launcher-shadow, var(--uui-shadow-depth-3)));
        font-size: var(--uui-type-small-size);
      }
      .toast[data-color='positive'] {
        --toast-accent: var(--umbradesktop-toast-positive-color, var(--uui-color-positive-standalone));
      }
      .toast[data-color='warning'] {
        --toast-accent: var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
      }
      .toast[data-color='danger'] {
        --toast-accent: var(--umbradesktop-notice-error-color, var(--uui-color-danger-standalone));
      }
      .toast-body,
      .toast-close {
        font: inherit;
        color: inherit;
        background: none;
        border: 0;
        cursor: pointer;
      }
      .toast-body {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: flex-start;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-3) var(--uui-size-space-2) var(--uui-size-space-3) var(--uui-size-space-4);
        text-align: start;
      }
      .toast-icon {
        flex: none;
        margin-top: 2px;
        color: var(--toast-accent);
      }
      .toast-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .toast-message {
        white-space: pre-line;
      }
      .toast-meta {
        display: flex;
        gap: var(--uui-size-space-2);
        opacity: 0.75;
        font-size: 0.9em;
      }
      .toast-close {
        flex: none;
        display: inline-flex;
        padding: var(--uui-size-space-3);
        opacity: 0.7;
      }
      .toast-close .glyph {
        width: 12px;
        height: 12px;
        stroke: currentColor;
        stroke-width: 1.3;
        stroke-linecap: round;
      }
      /* No hover fill, deliberately. The launcher's hover colour is a selection bar on some themes,
         Windows 98's navy among them, and a fill that needs its own text colour on a surface this
         small is a second token for no gain: the pointer cursor already says the toast is a button. */
      .toast-close:hover {
        opacity: 1;
      }
      .toast-body:focus-visible,
      .toast-close:focus-visible {
        outline: 2px solid var(--uui-color-focus);
        outline-offset: -2px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-toasts': UmbraDesktopToastsElement;
  }
}
