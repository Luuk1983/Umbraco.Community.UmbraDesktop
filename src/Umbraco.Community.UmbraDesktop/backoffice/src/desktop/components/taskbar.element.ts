import type { UmbraDesktopApp, UmbraDesktopLauncherCategory, UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
import { taskActivation } from '../window-model';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token';
import { css, customElement, html, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';

/**
 * The bottom panel: Umbraco-logo start button (opens a placeholder app launcher),
 * running-window buttons, clock, exit. The launcher is a Phase-2 placeholder for the
 * Phase-3 fullscreen drawer — it lists the grouped catalogue tree.
 */
@customElement('umbradesktop-taskbar')
export class UmbraDesktopTaskbarElement extends UmbLitElement {
  @state()
  private _windows: UmbraDesktopWindow[] = [];

  @state()
  private _tree: UmbraDesktopLauncherCategory[] = [];

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
    this.consumeContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, (ctx) => {
      if (ctx) this.observe(ctx.tree, (tree) => (this._tree = tree));
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

  #launch(app: UmbraDesktopApp) {
    this.#manager?.open(app);
    this.#setLauncherOpen(false);
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

  #renderApp(app: UmbraDesktopApp) {
    return html`
      <button class="launch-item" @click=${() => this.#launch(app)}>
        <umb-icon name=${app.icon}></umb-icon>
        <span>${this.localize.string(app.name)}</span>
      </button>
    `;
  }

  #renderLauncher() {
    if (!this._launcherOpen) return '';
    return html`
      <div class="launcher" style="bottom:${UMBRADESKTOP_TASKBAR_HEIGHT}px">
        <div class="launcher-body">
          ${repeat(
            this._tree,
            (c) => c.category.alias,
            (c) => html`
              <div class="launch-category">
                <div class="launch-header">${this.localize.string(c.category.label)}</div>
                <div class="launch-apps">
                  ${repeat(c.apps, (a) => a.alias, (a) => this.#renderApp(a))}
                </div>
                ${repeat(
                  c.groups,
                  (g) => g.group.alias,
                  (g) => html`
                    <div class="launch-group">
                      <div class="launch-group-label">${this.localize.string(g.group.label)}</div>
                      <div class="launch-apps">
                        ${repeat(g.apps, (a) => a.alias, (a) => this.#renderApp(a))}
                      </div>
                    </div>
                  `,
                )}
              </div>
            `,
          )}
        </div>
        <div class="launcher-footer">
          <uui-button
            class="launcher-exit"
            look="secondary"
            color="danger"
            label="Exit desktop mode"
            @click=${this.#onExit}>
            Exit desktop
          </uui-button>
        </div>
      </div>
    `;
  }

  override render() {
    return html`
      ${this.#renderLauncher()}
      <div class="bar" style="height:${UMBRADESKTOP_TASKBAR_HEIGHT}px">
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
        /* Match the native backoffice header, relocated to the bottom. */
        background: var(--uui-color-header-background);
        color: var(--uui-color-header-contrast);
        box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.25);
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
        color: var(--uui-color-header-contrast);
        cursor: pointer;
      }
      .start umb-icon {
        display: block;
        font-size: 26px;
      }
      .start:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .start.active {
        background: rgba(255, 255, 255, 0.16);
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
        color: var(--uui-color-header-contrast);
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
        color: var(--uui-color-header-contrast-emphasis);
        background: rgba(255, 255, 255, 0.08);
      }
      .task.active {
        color: var(--uui-color-header-contrast-emphasis);
        box-shadow: inset 0 -3px 0 var(--uui-color-current, #f5c1bc);
      }
      .clock {
        flex-shrink: 0;
        padding-right: var(--uui-size-space-2);
        font-size: var(--uui-type-small-size);
        color: var(--uui-color-header-contrast);
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
      }
      .launcher {
        position: absolute;
        left: var(--uui-size-space-3);
        width: 480px;
        height: 70vh;
        display: flex;
        flex-direction: column;
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-4);
        overflow: hidden;
      }
      .launcher-body {
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-4);
      }
      .launcher-footer {
        flex-shrink: 0;
        padding: var(--uui-size-space-3) var(--uui-size-space-4);
        border-top: 1px solid var(--uui-color-border);
      }
      .launcher-exit {
        width: 100%;
      }
      .launch-header {
        font-weight: 700;
        font-size: var(--uui-type-small-size);
        text-transform: uppercase;
        opacity: 0.7;
        margin-bottom: var(--uui-size-space-2);
      }
      .launch-group {
        margin-top: var(--uui-size-space-2);
        padding-left: var(--uui-size-space-3);
      }
      .launch-group-label {
        font-size: var(--uui-type-small-size);
        opacity: 0.6;
        margin-bottom: var(--uui-size-space-1);
      }
      .launch-apps {
        display: flex;
        flex-direction: column;
      }
      .launch-item {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-2) var(--uui-size-space-2);
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: var(--uui-type-small-size);
        text-align: left;
      }
      .launch-item:hover {
        background: var(--uui-color-surface-alt);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-taskbar': UmbraDesktopTaskbarElement;
  }
}
