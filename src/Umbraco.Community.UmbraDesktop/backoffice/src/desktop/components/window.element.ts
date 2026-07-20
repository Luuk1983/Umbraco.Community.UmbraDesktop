import type { UmbraDesktopWindow } from '../types';
import { injectChromeStyles } from '../chrome-injector';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * A single draggable desktop window hosting a backoffice iframe. Presentational
 * state comes from the `window` property; all mutations go through the manager.
 */
@customElement('umbradesktop-window')
export class UmbraDesktopWindowElement extends UmbLitElement {
  @property({ attribute: false })
  window?: UmbraDesktopWindow;

  @state()
  private _dragging = false;

  #manager?: UmbraDesktopWindowManagerContext;
  #startPointer = { x: 0, y: 0 };
  #startRect = { x: 0, y: 0 };

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
    });
  }

  #onIframeLoad(e: Event) {
    const iframe = e.target as HTMLIFrameElement;
    if (this.window) injectChromeStyles(iframe, this.window.app.chromeProfile);
  }

  #onTitlePointerDown = (e: PointerEvent) => {
    if (!this.window || this.window.state === 'maximized') return;
    this._dragging = true;
    this.#startPointer = { x: e.clientX, y: e.clientY };
    this.#startRect = { x: this.window.rect.x, y: this.window.rect.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  #onTitlePointerMove = (e: PointerEvent) => {
    if (!this._dragging || !this.window) return;
    const dx = e.clientX - this.#startPointer.x;
    const dy = e.clientY - this.#startPointer.y;
    this.#manager?.move(this.window.id, this.#startRect.x + dx, Math.max(0, this.#startRect.y + dy));
  };

  #onTitlePointerUp = (e: PointerEvent) => {
    this._dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  #onFocus = () => {
    if (this.window) this.#manager?.focus(this.window.id);
  };

  override render() {
    const w = this.window;
    if (!w) return null;
    const maximized = w.state === 'maximized';
    const style = maximized
      ? `left:0; top:0; width:100%; height:100%; z-index:${w.z};`
      : `left:${w.rect.x}px; top:${w.rect.y}px; width:${w.rect.w}px; height:${w.rect.h}px; z-index:${w.z};`;
    return html`
      <div
        class="frame ${w.active ? 'active' : ''}"
        style=${style}
        ?hidden=${w.state === 'minimized'}
        @pointerdown=${this.#onFocus}>
        <div
          class="titlebar"
          @pointerdown=${this.#onTitlePointerDown}
          @pointermove=${this.#onTitlePointerMove}
          @pointerup=${this.#onTitlePointerUp}>
          <span class="title"><umb-icon name=${w.app.icon}></umb-icon> ${w.app.name}</span>
          <span class="controls" @pointerdown=${(e: PointerEvent) => e.stopPropagation()}>
            <uui-button
              compact
              label="Minimize"
              @click=${() => this.#manager?.setState(w.id, 'minimized')}>&#x2013;</uui-button>
            <uui-button
              compact
              label="Maximize"
              @click=${() => this.#manager?.setState(w.id, maximized ? 'normal' : 'maximized')}>
              &#x25A1;</uui-button>
            <uui-button
              compact
              color="danger"
              label="Close"
              @click=${() => this.#manager?.close(w.id)}>&#x2715;</uui-button>
          </span>
        </div>
        <iframe class="body" src=${w.app.url} @load=${this.#onIframeLoad}></iframe>
      </div>
    `;
  }

  static override styles = [
    css`
      .frame {
        position: absolute;
        display: flex;
        flex-direction: column;
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-3);
        overflow: hidden;
        min-width: 320px;
        min-height: 200px;
      }
      .frame.active {
        border-color: var(--uui-color-selected);
        box-shadow: var(--uui-shadow-depth-5);
      }
      .titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-1) var(--uui-size-space-3);
        background: var(--uui-color-surface-alt);
        border-bottom: 1px solid var(--uui-color-border);
        cursor: move;
        user-select: none;
      }
      .title {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        font-weight: 700;
        font-size: var(--uui-type-small-size);
      }
      .controls {
        display: inline-flex;
        gap: var(--uui-size-space-1);
      }
      .body {
        flex: 1;
        border: none;
        width: 100%;
        background: var(--uui-color-background);
      }
      [hidden] {
        display: none !important;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window': UmbraDesktopWindowElement;
  }
}
