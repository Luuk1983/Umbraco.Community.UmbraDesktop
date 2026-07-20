import type { UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_APPS } from '../apps';
import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { css, customElement, html, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The bottom panel: Umbraco-logo start button, running-window buttons, clock. */
@customElement('umbradesktop-taskbar')
export class UmbraDesktopTaskbarElement extends UmbLitElement {
  @state()
  private _windows: UmbraDesktopWindow[] = [];

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
  }

  #tick() {
    this._clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // TODO (Phase 3): open the fullscreen app drawer instead of the hard-coded app.
  #onStart() {
    this.#manager?.open(UMBRADESKTOP_APPS[0]);
  }

  override render() {
    return html`
      <div class="bar" style="height:${UMBRADESKTOP_TASKBAR_HEIGHT}px">
        <button class="start" title="Open" @click=${this.#onStart}>
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
                <span>${w.app.name}</span>
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
      .start:hover {
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
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-taskbar': UmbraDesktopTaskbarElement;
  }
}
