import { UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT } from '../notifications/notification-centre.context-token.js';
import type { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import { notificationIconName } from '../notifications/severity.js';
import { UMBRADESKTOP_DESKTOP_SOURCE_ID, type UmbraDesktopScrollbackEntry } from '../notifications/types.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The scrollback behind the taskbar clock: the last twenty notifications, newest first, each with who
 * raised it, what it said, how many times and when it last did.
 *
 * Deliberately a list and nothing more. No read state, no dismiss, no muting, no clearing, all of
 * which the issue ruled out: an entry leaves by rolling off. Clicking one takes you to the window that
 * raised it, and an entry whose window has since closed stays drawn but disabled, which is how this
 * package treats an option that does not apply rather than hiding it.
 *
 * Drawn on the launcher's surface tokens, because it is the same kind of panel the launcher is.
 *
 * @fires activated - An entry was clicked and acted on, so the taskbar can close the panel.
 */
@customElement('umbradesktop-scrollback')
export class UmbraDesktopScrollbackElement extends UmbLitElement {
  /**
   * How to write a time, handed down by the taskbar so an entry's time is written exactly as the
   * clock beside it is, in the format this user asked for.
   */
  @property({ attribute: false })
  formatTime: (epochMs: number) => string = (ms) => new Date(ms).toLocaleTimeString();

  /** The scrollback, newest first. */
  @state()
  private _entries: ReadonlyArray<UmbraDesktopScrollbackEntry> = [];

  /** The ids of the windows open now, for telling a live entry from one whose window has gone. */
  @state()
  private _open: ReadonlySet<string> = new Set();

  /** The centre the entries come from, and that clicks go back to. */
  #centre?: UmbraDesktopNotificationCentreContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT, (centre) => {
      this.#centre = centre;
      if (centre) this.observe(centre.entries, (entries) => (this._entries = entries), '_entries');
    });
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (manager) => {
      if (manager) this.observe(manager.windows, (list) => (this._open = new Set(list.map((w) => w.id))), '_open');
    });
  }

  /**
   * Whether clicking an entry can do anything: the desktop's own always can, a window's only while
   * that window is open. Design §3.3.
   * @param entry The entry.
   * @returns True when it can be acted on.
   */
  #live(entry: UmbraDesktopScrollbackEntry): boolean {
    return entry.sourceId === UMBRADESKTOP_DESKTOP_SOURCE_ID || this._open.has(entry.sourceId);
  }

  /**
   * Act on an entry and say so.
   * @param entry The entry clicked.
   */
  #activate(entry: UmbraDesktopScrollbackEntry) {
    this.#centre?.activate(entry);
    this.dispatchEvent(new CustomEvent('activated', { bubbles: true, composed: true }));
  }

  /**
   * One entry.
   * @param entry The entry.
   * @returns Its template.
   */
  #renderEntry(entry: UmbraDesktopScrollbackEntry) {
    const live = this.#live(entry);
    const repeat = this.localize.term('umbraDesktop_notificationsRepeat', entry.count);
    return html`<button
      class="entry"
      data-color=${entry.color}
      ?disabled=${!live}
      title=${live ? nothing : this.localize.term('umbraDesktop_notificationsGone')}
      @click=${() => this.#activate(entry)}>
      <umb-icon class="entry-icon" name=${notificationIconName(entry.color)} aria-hidden="true"></umb-icon>
      <span class="entry-text">
        ${entry.headline ? html`<strong class="entry-headline">${entry.headline}</strong>` : nothing}
        <span class="entry-message">${entry.message}</span>
        <span class="entry-meta">
          <span class="entry-source">${this.localize.string(entry.source)}</span>
          ${entry.count > 1 ? html`<span class="entry-count" title=${repeat}>×${entry.count}</span>` : nothing}
          <time datetime=${new Date(entry.lastSeen).toISOString()}>${this.formatTime(entry.lastSeen)}</time>
        </span>
      </span>
    </button>`;
  }

  override render() {
    return html`<section class="panel" aria-label=${this.localize.term('umbraDesktop_notificationsTitle')}>
      <header class="header">
        <h2 class="title">${this.localize.term('umbraDesktop_notificationsTitle')}</h2>
        <button class="clear" ?disabled=${this._entries.length === 0} @click=${() => this.#centre?.clear()}>
          ${this.localize.term('umbraDesktop_notificationsClear')}
        </button>
      </header>
      ${this._entries.length === 0
        ? html`<p class="empty">${this.localize.term('umbraDesktop_notificationsEmpty')}</p>`
        : html`<div class="entries">
            ${repeat(this._entries, (e) => e.id, (e) => this.#renderEntry(e))}
          </div>`}
    </section>`;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      .panel {
        box-sizing: border-box;
        width: var(--umbradesktop-toast-width, 360px);
        max-width: calc(100vw - 2 * var(--uui-size-space-3));
        max-height: min(560px, 70vh);
        display: flex;
        flex-direction: column;
        margin-bottom: var(--uui-size-space-2);
        overflow: hidden;
        background: var(--umbradesktop-launcher-background, var(--uui-color-surface));
        backdrop-filter: var(--umbradesktop-launcher-backdrop, none);
        -webkit-backdrop-filter: var(--umbradesktop-launcher-backdrop, none);
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
        border: var(--umbradesktop-launcher-border, 1px solid var(--uui-color-border));
        border-radius: var(--umbradesktop-scrollback-radius, var(--umbradesktop-launcher-radius, var(--uui-border-radius)));
        box-shadow: var(--umbradesktop-launcher-shadow, var(--uui-shadow-depth-3));
        font-size: var(--uui-type-small-size);
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-3) var(--uui-size-space-3) var(--uui-size-space-2) var(--uui-size-space-4);
      }
      .title {
        margin: 0;
        font-size: var(--uui-type-default-size);
        font-weight: 700;
      }
      /* A flat text button on the panel's own surface, the way the launcher's footer buttons are,
         rather than a bordered form button pasted onto somebody's Start menu. Disabled rather than
         hidden when there is nothing to clear. */
      .clear {
        padding: var(--uui-size-space-1) var(--uui-size-space-3);
        border: 0;
        border-radius: var(--umbradesktop-launcher-card-radius, var(--uui-border-radius));
        background: none;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      .clear:hover:not(:disabled) {
        background: var(--umbradesktop-launcher-hover-background, rgba(0, 0, 0, 0.05));
        color: var(--umbradesktop-scrollback-hover-text, inherit);
      }
      .clear:focus-visible {
        outline: 2px solid var(--uui-color-focus);
        outline-offset: -2px;
      }
      .clear:disabled {
        cursor: default;
        opacity: 0.5;
      }
      .empty {
        margin: 0;
        padding: var(--uui-size-space-2) var(--uui-size-space-4) var(--uui-size-space-5);
        opacity: 0.75;
      }
      .entries {
        overflow-y: auto;
        padding: 0 var(--uui-size-space-2) var(--uui-size-space-2);
      }
      /* The severity carried the way the toast carries it, an icon in the severity colour, so the
         list and the toast it came from look like the same thing. Single quotes in these comments,
         never backticks: a backtick would close the template literal. */
      .entry {
        --entry-accent: var(--umbradesktop-notice-info-color, var(--uui-color-default-standalone));
        display: flex;
        align-items: flex-start;
        gap: var(--uui-size-space-3);
        width: 100%;
        padding: var(--uui-size-space-3);
        border: 0;
        border-radius: var(--umbradesktop-launcher-card-radius, var(--uui-border-radius));
        background: none;
        color: inherit;
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      .entry[data-color='positive'] {
        --entry-accent: var(--umbradesktop-toast-positive-color, var(--uui-color-positive-standalone));
      }
      .entry[data-color='warning'] {
        --entry-accent: var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
      }
      .entry[data-color='danger'] {
        --entry-accent: var(--umbradesktop-notice-error-color, var(--uui-color-danger-standalone));
      }
      /* The launcher's hover fill, and a text colour to go with it. On most themes that fill is a
         faint tint and the text stays as it is; on Windows 98 it is the navy selection bar, which the
         launcher pairs with white text in its own sheet, and this is the token that lets a theme say
         the same thing here. */
      .entry:hover:not(:disabled) {
        background: var(--umbradesktop-launcher-hover-background, rgba(0, 0, 0, 0.05));
        color: var(--umbradesktop-scrollback-hover-text, inherit);
      }
      .entry:focus-visible {
        outline: 2px solid var(--uui-color-focus);
        outline-offset: -2px;
      }
      /* Disabled, not hidden: the message is still worth reading, there is just nowhere to go. */
      .entry:disabled {
        cursor: default;
        opacity: 0.6;
      }
      .entry-icon {
        flex: none;
        margin-top: 2px;
        color: var(--entry-accent);
      }
      .entry-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .entry-message {
        white-space: pre-line;
      }
      .entry-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--uui-size-space-2);
        opacity: 0.75;
        font-size: 0.9em;
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-scrollback': UmbraDesktopScrollbackElement;
  }
}
