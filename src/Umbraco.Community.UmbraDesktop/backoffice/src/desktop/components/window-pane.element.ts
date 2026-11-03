import type { UmbraDesktopPane } from '../types.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import {
  UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS,
  UMBRADESKTOP_OPEN_HELP_EVENT,
  UMBRADESKTOP_PATH_HEIGHT,
  UMBRADESKTOP_PATH_LINE,
} from '../constants.js';
import { startFrameWatches, UmbraDesktopFrameThemeController } from '../frame-watches.js';
import type { UmbraDesktopFrameSink } from '../frame-watches.js';
import { announceWindowFrame, forgetWindowFrame } from '../beside/owner-frames.js';
import { UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT } from '../notifications/notification-centre.context-token.js';
import type { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import { panelIcon } from './panel-icon.js';
import { UMBRADESKTOP_STRIP_BUTTON_PADDING, UMBRADESKTOP_STRIP_ICON_BOX } from './strip-button.js';
import './app-host.element.js';
import './loader.element.js';
import { css, customElement, html, keyed, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Sent by a pane's hide button, cancelable: the owner window that cancels it slides the pane back in, then closes it. */
export const UMBRADESKTOP_PANE_HIDE_EVENT = 'umbradesktop-pane-hide';

/** Sent by a pane's pop-out button, cancelable: the owner window that cancels it notes where the pane was, then pops it out. */
export const UMBRADESKTOP_PANE_POPOUT_EVENT = 'umbradesktop-pane-popout';

/** Which pane a header action is about. */
export interface UmbraDesktopPaneActionDetail {
  /** The pane. */
  paneId: string;
}

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
 * A header and a body. The header says what the pane is and carries what a pane can do: reload, pop
 * out into a floating window, and hide, which slides it back into its window. Hide is on every pane;
 * the control that opened it steps out of the path strip while it is docked. Never a close cross:
 * under the window's own, it read as a second close. It has no minimize or maximize, because a pane
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

  /**
   * Whether the pane is still sliding out of its window, set by the window for the length of the
   * slide. Hide keeps the opening icon until then, so the button that opened the pane is seen to
   * ride out with it before it turns round.
   */
  @property({ type: Boolean })
  public opening = false;

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
   * Put the pane away from its hide button, asking first when its page holds unsaved changes.
   *
   * Handed to the owner window as an event, because the window is what slides the pane back in
   * before it goes, and only it can: the pane is removed the moment it closes. A window that claims
   * the event closes it once the slide is done; anywhere nothing claims it, it closes at once.
   */
  #onHide = async (): Promise<void> => {
    const pane = this.pane;
    const ownerId = this.ownerId;
    if (!pane || !ownerId || !this.#manager) return;
    if (pane.dirty && !(await this.#manager.confirmDiscardAttached(ownerId, pane.id))) return;
    if (this.#announce(UMBRADESKTOP_PANE_HIDE_EVENT, pane.id)) this.#manager.closeAttached(ownerId, pane.id);
  };

  /**
   * Pop the pane out into a window. Announced first, for the reason {@link #onHide} gives: the owner
   * notes where the pane was, so the window it becomes can lift off from there.
   */
  #onPopout = (): void => {
    const pane = this.pane;
    if (!pane || !this.ownerId) return;
    if (this.#announce(UMBRADESKTOP_PANE_POPOUT_EVENT, pane.id)) this.#manager?.undock(this.ownerId, pane.id);
  };

  /**
   * Tell the owner window what the header was asked to do.
   * @param type The event.
   * @param paneId The pane.
   * @returns True when nothing claimed it, so the pane should act on its own.
   */
  #announce(type: string, paneId: string): boolean {
    return this.dispatchEvent(
      new CustomEvent<UmbraDesktopPaneActionDetail>(type, { detail: { paneId }, bubbles: true, composed: true, cancelable: true }),
    );
  }

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

  /**
   * The hide button, on every pane, last in the header, at the edge the pane slides out to. The
   * control that opened the pane, Preview or a view's button, steps out of the path strip while the
   * pane is docked, and this is where it went: it rides the edge out with the pane still pointing
   * out, and turns to point back in once the pane is open. So every pane is put away the same way,
   * whatever opened it. The panel icon, never a cross, which right under the window's own close read
   * as a second close.
   * @param pane The pane.
   * @returns The button.
   */
  #renderHide(pane: UmbraDesktopPane) {
    const icon = panelIcon(!this.opening, pane.side);
    return html`<button class="pane-button pane-hide" type="button" title="Hide" aria-label="Hide" @click=${this.#onHide}>
      <umb-icon name=${icon.name} style="rotate:${icon.rotate}"></umb-icon>
    </button>`;
  }

  override render() {
    const pane = this.pane;
    if (!pane) return nothing;
    const content = pane.app.content;
    return html`
      <div class="pane-header" @pointerdown=${this.#onHeaderDown}>
        <umb-icon class="pane-icon" name=${pane.app.icon}></umb-icon>
        <span class="pane-title">${this.localize.string(pane.app.name)}</span>
        <button class="pane-button pane-reload" type="button" title="Reload" aria-label="Reload" @click=${this.#onReload}>
          <umb-icon name="icon-refresh"></umb-icon>
        </button>
        <!-- Greyed rather than hidden while the page holds unsaved changes, with the reason as its
             title: popping out remounts the frame, which would lose them. Umbraco's own pop-out,
             the pair of the Dock button's pop-in; the preview's toolbar keeps icon-out for a new
             tab, which is a browser's, not the desktop's. -->
        <button
          class="pane-button pane-popout"
          type="button"
          ?disabled=${!!pane.dirty}
          title=${pane.dirty ? this.localize.term('umbraDesktop_attachedUnsaved') : 'Pop out'}
          aria-label="Pop out"
          @click=${this.#onPopout}>
          <umb-icon name="icon-window-popout"></umb-icon>
        </button>
        <!-- Hide is set apart from pop out, which also takes the pane away but into a window, so a
             reach for one does not land on the other. -->
        <span class="pane-divider" aria-hidden="true"></span>
        ${this.#renderHide(pane)}
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
        /* The same at both ends, as the path strip beside it is, so the title starts as far in as
           Hide ends. Hide ran to the pane's edge at first, as a titlebar's close does, and the
           header's two ends did not match. */
        padding: 0 var(--umbradesktop-path-padding, 8px);
        /* A size container, for the buttons' padding: see strip-button.ts. */
        container-type: size;
        background: var(--umbradesktop-pane-header-background, var(--umbradesktop-path-background, var(--uui-color-surface-alt)));
        border-bottom: var(
          --umbradesktop-pane-header-border,
          var(--umbradesktop-path-border-bottom, ${UMBRADESKTOP_PATH_LINE}px solid var(--uui-color-border))
        );
        color: var(--umbradesktop-pane-header-text, var(--umbradesktop-path-text, var(--uui-color-text)));
        cursor: grab;
        user-select: none;
        font-size: var(--umbradesktop-pane-header-font-size, var(--umbradesktop-path-font-size, 13px));
      }
      .pane-icon {
        flex: none;
        font-size: var(--umbradesktop-strip-icon-size, 16px);
      }
      .pane-title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        /* Regular, as the path strip beside it is: in bold it read as a heading over the pane rather
           than as the strip's continuation. */
        font-weight: normal;
        /* A word is centred on its capitals rather than its line box (text-box trim), so it sits on the same
           centre line as the icons beside it. A line box carries the font's room above the letters as well
           as below, and a word centred by it sat 1.7px above its icons, measured on the drawn pixels in a
           live strip. Trimmed to cap height and baseline, the box is the word, whatever the theme's font.
           The padding gives descenders room inside the clip the ellipsis needs, equally above and
           below so the centre stays on the capitals. */
        text-box: trim-both cap alphabetic;
        padding-block: 0.3em;
      }
      /* Toolbar buttons, drawn as the strip's other buttons are: the Dock button and the path
         strip's Preview share these tokens. The strip's full height, with a 16px icon padded the
         same on every side, so they come out square: the 24 by 22 they were before was under WCAG's
         24px minimum and drew a 16px icon at 12. Full height costs the strip nothing, since its
         height is the theme's metric either way. */
      .pane-button {
        flex: none;
        align-self: stretch;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: var(--umbradesktop-strip-button-radius, 3px);
        padding: 0 ${UMBRADESKTOP_STRIP_BUTTON_PADDING};
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
      .pane-button umb-icon {
        flex: none;
        font-size: var(--umbradesktop-strip-icon-size, 16px);
        width: ${UMBRADESKTOP_STRIP_ICON_BOX};
        height: ${UMBRADESKTOP_STRIP_ICON_BOX};
      }
      /* Between reload and pop out: a hairline the strip's divider colour, short of the strip's
         height so it reads as a separator inside the strip rather than a border across it. */
      .pane-divider {
        flex: none;
        align-self: center;
        width: 1px;
        height: 50%;
        margin: 0 2px;
        background: var(--umbradesktop-pane-divider, color-mix(in srgb, currentColor 25%, transparent));
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
