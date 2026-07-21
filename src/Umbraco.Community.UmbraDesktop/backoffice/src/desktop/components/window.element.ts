import type { Rect, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopResizeEdges } from '../window-model';
import { resizeRect } from '../window-model';
import { injectChromeStyles } from '../chrome-injector';
import { UMBRADESKTOP_WINDOW_MIN_SIZE } from '../constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The eight resize handles: direction (for the cursor class) + which edges each pulls. */
const RESIZE_HANDLES: ReadonlyArray<{ dir: string; edges: UmbraDesktopResizeEdges }> = [
  { dir: 'n', edges: { top: true } },
  { dir: 's', edges: { bottom: true } },
  { dir: 'e', edges: { right: true } },
  { dir: 'w', edges: { left: true } },
  { dir: 'ne', edges: { top: true, right: true } },
  { dir: 'nw', edges: { top: true, left: true } },
  { dir: 'se', edges: { bottom: true, right: true } },
  { dir: 'sw', edges: { bottom: true, left: true } },
];

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

  @state()
  private _loading = true;

  #manager?: UmbraDesktopWindowManagerContext;
  #startPointer = { x: 0, y: 0 };
  #startRect = { x: 0, y: 0 };
  #resizing = false;
  #resizeEdges: UmbraDesktopResizeEdges = {};
  #resizeStartPointer = { x: 0, y: 0 };
  #resizeStartRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
    });
  }

  #onIframeLoad(e: Event) {
    const iframe = e.target as HTMLIFrameElement;
    if (!this.window) return;
    // Keep the loader up until the header is actually stripped, so the booting
    // backoffice (with its own header) never flashes into view.
    injectChromeStyles(iframe, this.window.app.chromeProfile, () => (this._loading = false));
    // Safety net: reveal anyway if the shell never reports ready.
    window.setTimeout(() => (this._loading = false), 12000);
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

  #onResizeDown = (e: PointerEvent, edges: UmbraDesktopResizeEdges) => {
    if (!this.window || this.window.state !== 'normal') return;
    e.stopPropagation();
    this.#manager?.focus(this.window.id);
    this.#resizing = true;
    this.#resizeEdges = edges;
    this.#resizeStartPointer = { x: e.clientX, y: e.clientY };
    this.#resizeStartRect = { ...this.window.rect };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  #onResizeMove = (e: PointerEvent) => {
    if (!this.#resizing || !this.window) return;
    const dx = e.clientX - this.#resizeStartPointer.x;
    const dy = e.clientY - this.#resizeStartPointer.y;
    const rect = resizeRect(this.#resizeStartRect, this.#resizeEdges, dx, dy, UMBRADESKTOP_WINDOW_MIN_SIZE);
    this.#manager?.resize(this.window.id, rect);
  };

  #onResizeUp = (e: PointerEvent) => {
    this.#resizing = false;
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
          <span class="title"><umb-icon name=${w.app.icon}></umb-icon> ${this.localize.string(w.app.name)}</span>
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
        <div class="bodywrap">
          <iframe class="body" src=${w.app.url} @load=${this.#onIframeLoad}></iframe>
          ${!w.active
            ? html`<div class="focus-catcher" @pointerdown=${this.#onFocus}></div>`
            : ''}
          ${this._loading ? html`<div class="loading"><uui-loader></uui-loader></div>` : ''}
        </div>
        ${w.state === 'normal'
          ? RESIZE_HANDLES.map(
              (rh) => html`<div
                class="rh rh-${rh.dir}"
                @pointerdown=${(e: PointerEvent) => this.#onResizeDown(e, rh.edges)}
                @pointermove=${this.#onResizeMove}
                @pointerup=${this.#onResizeUp}></div>`,
            )
          : ''}
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
      .bodywrap {
        position: relative;
        flex: 1;
        display: flex;
      }
      .body {
        flex: 1;
        border: none;
        width: 100%;
        background: var(--uui-color-background);
      }
      .loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--uui-color-surface);
      }
      [hidden] {
        display: none !important;
      }
      .focus-catcher {
        position: absolute;
        inset: 0;
        z-index: 1;
      }
      .rh {
        position: absolute;
        z-index: 3;
        touch-action: none;
      }
      .rh-n {
        top: 0;
        left: 0;
        right: 0;
        height: 6px;
        cursor: ns-resize;
      }
      .rh-s {
        bottom: 0;
        left: 0;
        right: 0;
        height: 6px;
        cursor: ns-resize;
      }
      .rh-e {
        top: 0;
        bottom: 0;
        right: 0;
        width: 6px;
        cursor: ew-resize;
      }
      .rh-w {
        top: 0;
        bottom: 0;
        left: 0;
        width: 6px;
        cursor: ew-resize;
      }
      .rh-ne {
        top: 0;
        right: 0;
        width: 12px;
        height: 12px;
        z-index: 4;
        cursor: nesw-resize;
      }
      .rh-nw {
        top: 0;
        left: 0;
        width: 12px;
        height: 12px;
        z-index: 4;
        cursor: nwse-resize;
      }
      .rh-se {
        bottom: 0;
        right: 0;
        width: 12px;
        height: 12px;
        z-index: 4;
        cursor: nwse-resize;
      }
      .rh-sw {
        bottom: 0;
        left: 0;
        width: 12px;
        height: 12px;
        z-index: 4;
        cursor: nesw-resize;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window': UmbraDesktopWindowElement;
  }
}
