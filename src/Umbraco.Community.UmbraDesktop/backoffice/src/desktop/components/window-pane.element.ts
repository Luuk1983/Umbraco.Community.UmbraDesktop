import type { UmbraDesktopPane } from '../types.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import { UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS, UMBRADESKTOP_OPEN_HELP_EVENT, UMBRADESKTOP_PATH_HEIGHT } from '../constants.js';
import { startFrameWatches, UmbraDesktopFrameThemeController } from '../frame-watches.js';
import type { UmbraDesktopFrameSink } from '../frame-watches.js';
import { announceWindowFrame, forgetWindowFrame } from '../beside/owner-frames.js';
import { UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT } from '../notifications/notification-centre.context-token.js';
import type { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import './app-host.element.js';
import './loader.element.js';
import { css, customElement, html, keyed, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** What a pane announces when its header is pressed, for the owner window to carry the drag. */
export interface UmbraDesktopPaneDragDetail {
  /** The pane being pulled. */
  paneId: string;
  /** The pointer doing it, which the owner window takes capture of. */
  pointerId: number;
  /** Where the press was, in client coordinates. */
  clientX: number;
  /** Where the press was, in client coordinates. */
  clientY: number;
  /** How far into the pane the press was, so the floating window arrives under the same spot. */
  grabX: number;
  /** How far down the pane the press was, which is somewhere in its header. */
  grabY: number;
}

/**
 * One pane: attached content drawn inside its owner window, beside the owner's own content.
 *
 * A header and a body. The header says what the pane is and carries the three things a pane can do:
 * reload, pop out into a floating window, and close. It has no minimize or maximize, because a pane
 * has no state of its own; it goes wherever its window goes. It is not a titlebar and does not
 * pretend to be one: it is shorter, it cannot be dragged to move the window, and its controls are not
 * summed into any theme's drag-clamp metrics.
 *
 * **Every class inside is prefixed `pane-`,** for the reason `window-path.element` gives: this element
 * adopts the active theme's whole `window` sheet, so a selector a theme wrote for the frame (`.title`,
 * `.ctrl`) would otherwise land on this markup too.
 *
 * The body is an element app, or a backoffice page (#144): a frame on a backoffice route, which gets
 * the frame watches a window's frame gets (`frame-watches.ts`), reports its unsaved changes and its
 * page to the manager under the pane's id, and is announced under that id for whoever routes it.
 * While a page holds unsaved changes, Pop out is greyed and closing or reloading asks, because each
 * of those remounts the frame and would throw the changes away.
 *
 * Design: `docs/design/2026-09-27-attached-windows-design.md` D3.
 */
@customElement('umbradesktop-window-pane')
export class UmbraDesktopWindowPaneElement extends UmbLitElement {
  /** The pane to draw. */
  @property({ attribute: false })
  public pane?: UmbraDesktopPane;

  /** The window the pane belongs to, which the header's actions act on. */
  @property({ attribute: false })
  public ownerId?: string;

  /**
   * Whether the owner window is inactive, which puts a catcher over the body. An inactive frame
   * swallows the pointer event that should focus its window, and a pane's content usually holds one,
   * so it needs the same catcher the window's own body has.
   */
  @property({ type: Boolean })
  public inactive = false;

  /** The chrome theme in force, handed to the content the way a window hands it to its app. */
  @property({ attribute: false })
  public themeId = '';

  /**
   * Bumped by reload, and the key the body is committed under, so a reload throws the content away
   * and mounts it afresh. For attached content that is exactly a reload: it fetches what it shows
   * when it connects.
   */
  @state()
  private _generation = 0;

  /**
   * Whether a page body is still booting, which covers it so the backoffice's own header never
   * flashes into view, exactly as a window covers its frame. Lowered once the header is stripped, or
   * after the window's deadline.
   */
  @state()
  private _loading = true;

  /** The window manager, for the header's actions. */
  #manager?: UmbraDesktopWindowManagerContext;

  /** Where a page's notifications go instead of into its frame. */
  #notifications?: UmbraDesktopNotificationCentreContext;

  /** Stops the page frame's watches; replaced on every load, called on disconnect. */
  #stopFrameWatches?: () => void;

  /** The pane id the page frame was last announced under, to take back on disconnect. */
  #announced?: string;

  /** Keeps a page on the desktop's light or dark theme, as a window's frame is kept. */
  #frameTheme = new UmbraDesktopFrameThemeController(
    this,
    () => this.#frame()?.contentDocument ?? undefined,
    () => this.#frame()?.contentWindow?.location.reload(),
  );

  constructor() {
    super();
    new UmbraDesktopThemeStyles(this, 'window');
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (manager) => (this.#manager = manager));
    this.consumeContext(UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT, (centre) => (this.#notifications = centre ?? undefined));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stopFrameWatches?.();
    this.#stopFrameWatches = undefined;
    if (this.#announced) forgetWindowFrame(this.#announced);
    this.#announced = undefined;
  }

  /**
   * The page body's frame, when the pane draws one.
   * @returns The frame, or undefined for an element body.
   */
  #frame(): HTMLIFrameElement | undefined {
    return (this.renderRoot?.querySelector('iframe.pane-content') as HTMLIFrameElement | null) ?? undefined;
  }

  /**
   * A page body loaded, or loaded again: start its watches and announce it, as a window does for
   * its own frame. The pane's id is read now, so every report lands on the pane this frame belongs to.
   * @param event The frame's load event.
   */
  #onFrameLoad = (event: Event): void => {
    const iframe = event.target as HTMLIFrameElement;
    const pane = this.pane;
    const ownerId = this.ownerId;
    if (!pane || !ownerId) return;
    this.#stopFrameWatches = startFrameWatches(iframe, this.#frameSink(ownerId, pane), [
      'chrome',
      'dirty',
      'location',
      'help',
      'notifications',
      'theme',
    ]);
    this.#announced = pane.id;
    announceWindowFrame(pane.id, iframe);
    window.setTimeout(() => (this._loading = false), UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS);
  };

  /**
   * Where a page frame's watches report: the manager, under the pane's id.
   * @param ownerId The owner window.
   * @param pane The pane.
   * @returns The sink.
   */
  #frameSink(ownerId: string, pane: UmbraDesktopPane): UmbraDesktopFrameSink {
    const centre = this.#notifications;
    return {
      chromeProfile: pane.app.chromeProfile,
      narrow: true,
      loaded: () => (this._loading = false),
      applyTheme: () => this.#frameTheme.apply(),
      setDirty: (dirty) => this.#manager?.setPaneDirty(ownerId, pane.id, dirty),
      setLocation: (location) => this.#manager?.setPaneLocation(ownerId, pane.id, location),
      // Under the pane's own id, so server events reach the page as they reach a window's.
      setSubjects: (subjects) => this.#manager?.setSubjects(pane.id, subjects),
      openHelp: (target) =>
        this.dispatchEvent(new CustomEvent(UMBRADESKTOP_OPEN_HELP_EVENT, { detail: { target }, bubbles: true, composed: true })),
      // No centre, no watcher, for the reason the window gives: a watcher hides the frame's own toasts.
      notifications: centre ? { centre, sourceId: pane.id, source: () => this.pane?.app.name ?? '' } : undefined,
    };
  }

  /**
   * Close the pane: at once when it holds nothing, after core's discard dialog when its page holds
   * unsaved changes. Clean closes stay synchronous, as they always were.
   */
  #onClose = (): void => {
    const pane = this.pane;
    if (!pane || !this.ownerId || !this.#manager) return;
    if (pane.dirty) void this.#manager.requestCloseAttached(this.ownerId, pane.id);
    else this.#manager.closeAttached(this.ownerId, pane.id);
  };

  /** Reload the content by remounting it, asking first when its page holds unsaved changes. */
  #onReload = async (): Promise<void> => {
    const pane = this.pane;
    if (pane?.dirty && this.ownerId && this.#manager) {
      if (!(await this.#manager.confirmDiscardAttached(this.ownerId, pane.id))) return;
    }
    if (pane?.app.content.kind === 'iframe') this._loading = true;
    this._generation += 1;
  };

  /**
   * Start pulling the pane out by its header.
   *
   * Only announced, never carried out here: the pane is removed the moment it undocks, and a drag
   * held by an element that is no longer in the document stops dead. So the owner window, which
   * outlives the pane, takes the pointer and does the rest. A press on one of the header's buttons
   * is a click, not a drag, and never reaches here.
   * @param e The pointer press on the header.
   */
  #onHeaderDown = (e: PointerEvent) => {
    if (!this.pane || (e.target as HTMLElement).closest?.('.pane-button')) return;
    // A press that may become a drag must not also start a text selection, or tearing the pane off
    // drags a selection across everything in the window under the pointer. Cancelling the press is
    // what stops the browser beginning one; the header's user-select only stops its own text.
    e.preventDefault();
    const box = this.getBoundingClientRect();
    this.dispatchEvent(
      new CustomEvent<UmbraDesktopPaneDragDetail>('umbradesktop-pane-drag', {
        detail: {
          paneId: this.pane.id,
          pointerId: e.pointerId,
          clientX: e.clientX,
          clientY: e.clientY,
          grabX: e.clientX - box.left,
          grabY: e.clientY - box.top,
        },
        bubbles: true,
        composed: true,
      }),
    );
  };

  override render() {
    const pane = this.pane;
    if (!pane) return nothing;
    const content = pane.app.content;
    return html`
      <div class="pane-header" @pointerdown=${this.#onHeaderDown}>
        <umb-icon class="pane-icon" name=${pane.app.icon}></umb-icon>
        <span class="pane-title">${this.localize.string(pane.app.name)}</span>
        <button class="pane-button pane-reload" type="button" title="Reload" aria-label="Reload" @click=${this.#onReload}>
          <svg class="pane-glyph" viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3"></path></svg>
        </button>
        <!-- Greyed rather than hidden while the page holds unsaved changes, with the reason as its
             title: popping out remounts the frame, which would lose them. -->
        <button
          class="pane-button pane-popout"
          type="button"
          ?disabled=${!!pane.dirty}
          title=${pane.dirty ? this.localize.term('umbraDesktop_attachedUnsaved') : 'Pop out'}
          aria-label="Pop out"
          @click=${() => this.ownerId && this.#manager?.undock(this.ownerId, pane.id)}>
          <!-- Picture in picture: a frame with a small filled window in its corner, which says "make
               this a window of its own". Deliberately not the arrow-out-of-a-box a browser uses for a
               new tab, which the preview's own toolbar uses for exactly that. -->
          <svg class="pane-glyph" viewBox="0 0 16 16">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1"></rect>
            <rect class="pane-glyph-fill" x="8" y="7.5" width="5" height="4.5"></rect>
          </svg>
        </button>
        <button
          class="pane-button pane-close"
          type="button"
          title="Close"
          aria-label="Close"
          @click=${this.#onClose}>
          <svg class="pane-glyph" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"></path></svg>
        </button>
      </div>
      <div class="pane-body">
        ${content.kind === 'element'
          ? keyed(
              this._generation,
              html`<umbradesktop-app-host
                class="pane-content"
                data-umbradesktop-theme=${this.themeId || nothing}
                .alias=${pane.app.alias}
                .props=${content.props}
                .load=${content.element}></umbradesktop-app-host>`,
            )
          : keyed(this._generation, html`<iframe class="pane-content" src=${content.url} @load=${this.#onFrameLoad}></iframe>`)}
        ${this.inactive ? html`<div class="pane-catcher"></div>` : nothing}
        ${content.kind === 'iframe' && this._loading
          ? html`<div class="pane-loading"><umbradesktop-loader></umbradesktop-loader></div>`
          : nothing}
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        background: var(--umbradesktop-pane-background, var(--umbradesktop-window-background, var(--uui-color-surface)));
      }
      /* The header sits on the same row as the owner's path strip, directly beside it, so it is
         drawn as that strip's continuation: its height, and its tokens as the fallback for its own.
         The height is the theme's pathbarHeight, which is also what the window sizing pays for the
         strip at. A header 2px taller than the path beside it was the first thing that made the pane
         look pasted on. */
      .pane-header {
        flex: none;
        display: flex;
        align-items: center;
        gap: 4px;
        box-sizing: border-box;
        height: var(--umbradesktop-path-height, ${UMBRADESKTOP_PATH_HEIGHT}px);
        padding: 0 4px 0 var(--umbradesktop-path-padding, 8px);
        background: var(--umbradesktop-pane-header-background, var(--umbradesktop-path-background, var(--uui-color-surface-alt)));
        border-bottom: var(
          --umbradesktop-pane-header-border,
          var(--umbradesktop-path-border-bottom, 1px solid var(--uui-color-divider))
        );
        color: var(--umbradesktop-pane-header-text, var(--umbradesktop-path-text, var(--uui-color-text)));
        cursor: grab;
        user-select: none;
        font-size: var(--umbradesktop-pane-header-font-size, var(--umbradesktop-path-font-size, 12px));
      }
      .pane-icon {
        flex: none;
        font-size: 1.2em;
      }
      .pane-title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-weight: 600;
      }
      /* Toolbar buttons, drawn as the strip's other buttons are: the Dock button and the path
         strip's Preview share these tokens. Sized off the strip, so a theme with a 22px strip gets
         buttons that fit in it. */
      .pane-button {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: calc(var(--umbradesktop-path-height, ${UMBRADESKTOP_PATH_HEIGHT}px) - 6px);
        border: 0;
        border-radius: var(--umbradesktop-strip-button-radius, 3px);
        padding: 0;
        background: none;
        color: inherit;
        cursor: pointer;
      }
      .pane-button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .pane-button:hover:not(:disabled) {
        background: var(
          --umbradesktop-strip-button-hover-background,
          var(--umbradesktop-path-link-hover-background, var(--uui-color-surface-emphasis))
        );
        color: var(--umbradesktop-strip-button-hover-text, inherit);
        box-shadow: var(--umbradesktop-strip-button-hover-shadow, none);
      }
      .pane-glyph {
        width: 12px;
        height: 12px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.5;
      }
      .pane-glyph-fill {
        fill: currentColor;
        stroke: none;
      }
      .pane-body {
        position: relative;
        flex: 1;
        min-height: 0;
        display: flex;
      }
      .pane-content {
        flex: 1;
        min-width: 0;
        border: 0;
        width: 100%;
        height: 100%;
      }
      .pane-catcher {
        position: absolute;
        inset: 0;
      }
      .pane-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--umbradesktop-pane-background, var(--umbradesktop-window-background, var(--uui-color-surface)));
      }
    `,
  ];
}

export default UmbraDesktopWindowPaneElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window-pane': UmbraDesktopWindowPaneElement;
  }
}
