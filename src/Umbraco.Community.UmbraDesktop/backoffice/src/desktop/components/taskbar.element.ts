import type { UmbraDesktopWindow } from '../types';
import { taskActivation } from '../window-model';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import './launcher.element.js';
import { UMBRADESKTOP_SETTINGS_MODAL } from '../settings/modal-tokens.js';
import { css, customElement, html, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal, umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_SEARCH_MODAL } from '@umbraco-cms/backoffice/search';
import { UMB_CURRENT_USER_MODAL } from '@umbraco-cms/backoffice/current-user';

/**
 * The bottom panel: Umbraco-logo start button (opens the app launcher), running-window
 * buttons, clock, exit. The launcher panel itself (search/favourites/recent/grouped
 * tiles/footer) is `<umbradesktop-launcher>`, mounted here — this element owns the start
 * button, the panel's open/close + dismissal wiring, and every modal the panel asks for.
 *
 * Modal ownership lives here rather than in the launcher deliberately: the launcher is
 * unmounted on the first pointer down outside it, and Umbraco resolves a modal's contexts
 * through the element that opened it. A modal owned by the launcher would silently lose its
 * context origin the moment you clicked inside it. The taskbar lives as long as the desktop,
 * so it is a safe origin.
 */
@customElement('umbradesktop-taskbar')
export class UmbraDesktopTaskbarElement extends UmbLitElement {
  @state()
  private _windows: UmbraDesktopWindow[] = [];

  @state()
  private _launcherOpen = false;

  @state()
  private _clock = '';

  #manager?: UmbraDesktopWindowManagerContext;
  #timer?: number;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
      if (ctx) this.observe(ctx.windows, (list) => (this._windows = list));
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this.#tick();
    this.#timer = window.setInterval(() => this.#tick(), 15000);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#timer) window.clearInterval(this.#timer);
    this.#setLauncherOpen(false);
  }

  #tick() {
    this._clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  #toggleLauncher() {
    this.#setLauncherOpen(!this._launcherOpen);
  }

  /**
   * Handle a click on a running-window taskbar button: minimize it if it is already the active
   * window, otherwise bring it to the front (restoring it if minimized). See `taskActivation`.
   * @param w The window whose taskbar button was clicked.
   */
  #onTaskClick(w: UmbraDesktopWindow) {
    if (!this.#manager) return;
    if (taskActivation(w) === 'minimize') this.#manager.setState(w.id, 'minimized');
    else this.#manager.focus(w.id);
  }

  /**
   * Open or close the launcher, wiring up the dismiss listeners to match. While open we listen
   * for a pointer down outside the launcher/start button, a window blur (a click landing inside
   * an iframe window steals focus without bubbling a pointer event to us), and the Escape key —
   * any of which closes the launcher. Listeners are removed as soon as it closes.
   * @param open Whether the launcher should be open.
   */
  #setLauncherOpen(open: boolean) {
    if (open === this._launcherOpen) return;
    this._launcherOpen = open;
    if (open) {
      // Capture phase so we see the pointer down before anything inside can stop it.
      document.addEventListener('pointerdown', this.#onOutsidePointerDown, true);
      document.addEventListener('keydown', this.#onLauncherKeydown);
      window.addEventListener('blur', this.#onWindowBlur);
    } else {
      document.removeEventListener('pointerdown', this.#onOutsidePointerDown, true);
      document.removeEventListener('keydown', this.#onLauncherKeydown);
      window.removeEventListener('blur', this.#onWindowBlur);
    }
  }

  /** Close the launcher when a pointer goes down outside both the launcher panel and start button. */
  #onOutsidePointerDown = (e: PointerEvent) => {
    const path = e.composedPath();
    const launcher = this.shadowRoot?.querySelector('.launcher');
    const start = this.shadowRoot?.querySelector('.start');
    if ((launcher && path.includes(launcher)) || (start && path.includes(start))) return;
    this.#setLauncherOpen(false);
  };

  /** Close the launcher on Escape. */
  #onLauncherKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.#setLauncherOpen(false);
  };

  /** Close the launcher when focus leaves the window (e.g. a click landing inside an iframe). */
  #onWindowBlur = () => {
    this.#setLauncherOpen(false);
  };

  /**
   * Close the launcher, then open a modal owned by this element.
   *
   * The launcher is dismissed first for both reasons: picking something from a start menu should
   * dismiss it, and it removes the outside-pointer listener that would otherwise unmount the
   * launcher mid-interaction.
   * @param modal The modal token to open.
   */
  async #openFromLauncher(modal: Parameters<typeof umbOpenModal>[1]) {
    this.#setLauncherOpen(false);
    await umbOpenModal(this, modal).catch(() => undefined);
  }

  /** Open the native backoffice search modal. */
  #onSearch = () => this.#openFromLauncher(UMB_SEARCH_MODAL);

  /** Open the native current-user modal (profile, MFA, etc.). */
  #onProfile = () => this.#openFromLauncher(UMB_CURRENT_USER_MODAL);

  /** Open the desktop settings dialog (wallpaper today, more later). */
  #onSettings = () => this.#openFromLauncher(UMBRADESKTOP_SETTINGS_MODAL);

  /** Confirm, then leave the Desktop section for the classic backoffice. */
  #onExit = async () => {
    try {
      await umbConfirmModal(this, {
        headline: 'Exit desktop mode',
        content: 'Return to the classic Umbraco backoffice? Your open windows will be closed.',
        confirmLabel: 'Exit',
        cancelLabel: 'Stay',
        color: 'danger',
      });
    } catch {
      return; // cancelled
    }
    const path = window.location.pathname.replace(/\/section\/.*$/, '/section/content');
    window.history.pushState(null, '', path);
  };

  #renderLauncher() {
    if (!this._launcherOpen) return '';
    return html`
      <umbradesktop-launcher
        class="launcher"
        @launched=${() => this.#setLauncherOpen(false)}
        @search=${this.#onSearch}
        @profile=${this.#onProfile}
        @settings=${this.#onSettings}
        @exit=${this.#onExit}></umbradesktop-launcher>
    `;
  }

  override render() {
    return html`
      ${this.#renderLauncher()}
      <div class="bar">
        <div class="cluster">
          <button
            class="start ${this._launcherOpen ? 'active' : ''}"
            title="Open apps"
            aria-label="Open apps"
            @click=${this.#toggleLauncher}>
            <umb-icon name="icon-umbraco"></umb-icon>
          </button>
          <div class="running">
            ${repeat(
              this._windows,
              (w) => w.id,
              (w) => html`
                <button
                  class="task ${w.active ? 'active' : ''}"
                  title=${this.localize.string(w.app.name)}
                  @click=${() => this.#onTaskClick(w)}>
                  <umb-icon name=${w.app.icon}></umb-icon>
                  <span class="task-label">${this.localize.string(w.app.name)}</span>
                </button>
              `,
            )}
          </div>
        </div>
        <div class="clock">${this._clock}</div>
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        position: relative;
        display: block;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: 0 var(--uui-size-space-2);
        height: var(--umbradesktop-taskbar-height, 50px);
        margin: var(--umbradesktop-taskbar-margin, 0);
        border-radius: var(--umbradesktop-taskbar-radius, 0);
        /* A distinctly darker plane than the wallpaper, frosted over it. This used to be
           --uui-color-header-background, which is the same navy family as most of the shipped
           wallpapers, so the bar dissolved into them. Going deeper and translucent separates it
           from any background, light or dark, while the navy cast keeps it on-brand. The blur
           needs something behind it to work, which is why the wallpaper is painted edge to edge
           and continues underneath the bar. */
        background: var(--umbradesktop-taskbar-background, rgba(16, 20, 46, 0.72));
        backdrop-filter: var(--umbradesktop-taskbar-backdrop, blur(18px) saturate(140%));
        -webkit-backdrop-filter: var(--umbradesktop-taskbar-backdrop, blur(18px) saturate(140%));
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        border-top: var(--umbradesktop-taskbar-border-top, 1px solid rgba(255, 255, 255, 0.14));
        box-shadow: var(--umbradesktop-taskbar-shadow, 0 -4px 18px rgba(0, 0, 0, 0.4));
      }
      /* Without backdrop-filter the translucency only muddies the bar, so go fully opaque. */
      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .bar {
          background: var(--umbradesktop-taskbar-background-opaque, #0f1330);
        }
      }
      /* Start + running windows travel together, so a theme can centre them as one group
         (Windows 11, macOS) while the clock stays pinned to its own edge. */
      .cluster {
        display: flex;
        align-items: stretch;
        height: 100%;
        flex: 1;
        min-width: 0;
      }
      /* The start button carries the Umbraco mark, full bar height so its hover fills the
         whole bar, centered and high-contrast on the dark background. */
      .start {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        flex-shrink: 0;
        padding: 0 var(--uui-size-space-4);
        border: none;
        background: transparent;
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        cursor: pointer;
      }
      .start umb-icon {
        display: block;
        font-size: 26px;
      }
      .start:hover {
        background: var(--umbradesktop-start-hover-background, rgba(255, 255, 255, 0.12));
      }
      .start.active {
        background: var(--umbradesktop-start-active-background, rgba(255, 255, 255, 0.16));
      }
      /* Running windows: compact horizontal taskbar buttons that keep the native tab
         language — icon + label, with the active window carrying the coral "current"
         underline (an inset box-shadow, so it never shifts layout). Buttons fill the full
         bar height so the underline sits on the bottom edge and hover covers top-to-bottom.
         Minimized windows look like any other inactive window, as on Windows/KDE. */
      .running {
        display: flex;
        align-items: stretch;
        height: 100%;
        gap: var(--uui-size-space-1);
        flex: 1;
        min-width: 0;
        overflow: hidden;
        margin-left: var(--uui-size-space-1);
      }
      .task {
        display: inline-flex;
        align-items: center;
        height: 100%;
        gap: var(--uui-size-space-2);
        max-width: 200px;
        min-width: 0;
        padding: 0 var(--uui-size-space-3);
        border: none;
        background: transparent;
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        cursor: pointer;
        font-family: inherit;
        font-size: calc(var(--uui-type-small-size) + 1px);
        box-shadow: inset 0 -3px 0 transparent;
        transition:
          box-shadow 120ms,
          color 120ms,
          background-color 120ms;
      }
      .task umb-icon {
        flex-shrink: 0;
        font-size: 18px;
        /* Umbraco icon glyphs carry transparent padding inside their box, making the space
           before the icon read wider than the space after the label; pull it back to balance. */
        margin-left: -2px;
      }
      .task-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        /* Lato sits high in its line box; nudge the label down ~1px so it optically
           centers against the icon and the start button. */
        transform: translateY(1px);
      }
      .task:hover {
        color: var(--umbradesktop-taskbar-text-emphasis, var(--uui-color-header-contrast-emphasis));
        background: var(--umbradesktop-taskbar-hover-background, rgba(255, 255, 255, 0.08));
      }
      .task.active {
        color: var(--umbradesktop-taskbar-text-emphasis, var(--uui-color-header-contrast-emphasis));
        box-shadow: inset 0 -3px 0 var(--umbradesktop-task-active-marker, var(--uui-color-current, #f5c1bc));
      }
      .clock {
        flex-shrink: 0;
        padding-right: var(--uui-size-space-2);
        font-size: var(--uui-type-small-size);
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
      }
      /* Positioning only — the panel's own surface (background/border/shadow/size) is
         owned by <umbradesktop-launcher> itself. */
      .launcher {
        position: absolute;
        left: var(--umbradesktop-launcher-left, var(--uui-size-space-3));
        bottom: var(--umbradesktop-launcher-bottom, var(--umbradesktop-taskbar-reserve, 50px));
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-taskbar': UmbraDesktopTaskbarElement;
  }
}
