import type { UmbraDesktopApp, UmbraDesktopLauncherCategory, UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
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
  }

  #tick() {
    this._clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  #toggleLauncher() {
    this._launcherOpen = !this._launcherOpen;
  }

  #launch(app: UmbraDesktopApp) {
    this.#manager?.open(app);
    this._launcherOpen = false;
  }

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
        ${repeat(
          this._tree,
          (c) => c.category.alias,
          (c) => html`
            <div class="launch-category">
              <div class="launch-header">${this.localize.string(c.category.label)}</div>
              <div class="launch-apps">${c.apps.map((a) => this.#renderApp(a))}</div>
              ${c.groups.map(
                (g) => html`
                  <div class="launch-group">
                    <div class="launch-group-label">${this.localize.string(g.group.label)}</div>
                    <div class="launch-apps">${g.apps.map((a) => this.#renderApp(a))}</div>
                  </div>
                `,
              )}
            </div>
          `,
        )}
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
                @click=${() => this.#manager?.focus(w.id)}>
                <umb-icon name=${w.app.icon}></umb-icon>
                <span>${this.localize.string(w.app.name)}</span>
              </button>
            `,
          )}
        </div>
        <uui-button
          class="exit"
          compact
          look="secondary"
          label="Exit desktop mode"
          @click=${this.#onExit}>
          Exit
        </uui-button>
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
        padding: 0 var(--uui-size-space-3);
        background: var(--uui-color-header-surface, var(--uui-color-surface-alt));
        border-top: 1px solid var(--uui-color-border);
      }
      .start {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 20px;
      }
      .start:hover,
      .start.active {
        background: var(--uui-color-surface);
      }
      .running {
        display: flex;
        gap: var(--uui-size-space-1);
        flex: 1;
        overflow: hidden;
      }
      .task {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        max-width: 180px;
        padding: var(--uui-size-space-1) var(--uui-size-space-3);
        border: 1px solid transparent;
        border-radius: var(--uui-border-radius, 3px);
        background: var(--uui-color-surface);
        cursor: pointer;
        font-size: var(--uui-type-small-size);
        white-space: nowrap;
      }
      .task.active {
        border-color: var(--uui-color-selected);
      }
      .clock {
        font-size: var(--uui-type-small-size);
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
      }
      .launcher {
        position: absolute;
        left: var(--uui-size-space-3);
        width: 320px;
        max-height: 60vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-4);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-4);
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
