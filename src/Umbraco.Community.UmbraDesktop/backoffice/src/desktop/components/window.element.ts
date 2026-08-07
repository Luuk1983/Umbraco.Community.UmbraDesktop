import type { Rect, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopResizeEdges } from '../window-model';
import { clampResizeOrigin, clampWindowPosition, resizeRect, restoreDragPosition } from '../window-model';
import { injectChromeStyles } from '../chrome-injector';
import { UMBRADESKTOP_WINDOW_KEEP_VISIBLE, UMBRADESKTOP_WINDOW_MIN_SIZE } from '../constants';
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
 * How far the pointer must travel across a maximized titlebar before the drag un-maximizes the
 * window. Without it a bare click — or the first half of the double-click that toggles maximize —
 * would shrink the window out from under the user.
 */
const RESTORE_DRAG_THRESHOLD = 5;

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
  #startSurface = { left: 0, top: 0, w: 0, h: 0 };
  #pendingRestore = false;
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

  /**
   * Position and size of the desktop surface this window is laid out against — the frame's offset
   * parent. Measured once per drag so the clamp costs no layout work per pointer move.
   * @returns The surface rectangle in client coordinates, falling back to the viewport if the
   * frame is not laid out yet.
   */
  #surfaceRect(): { left: number; top: number; w: number; h: number } {
    const frame = this.renderRoot?.querySelector('.frame') as HTMLElement | null;
    const surface = frame?.offsetParent as HTMLElement | null;
    if (!surface) return { left: 0, top: 0, w: window.innerWidth, h: window.innerHeight };
    const box = surface.getBoundingClientRect();
    return { left: box.left, top: box.top, w: surface.clientWidth, h: surface.clientHeight };
  }

  #onTitlePointerDown = (e: PointerEvent) => {
    if (!this.window) return;
    this.#startPointer = { x: e.clientX, y: e.clientY };
    this.#startSurface = this.#surfaceRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (this.window.state === 'maximized') {
      // Arm the drag rather than starting it — a maximized window only un-maximizes once the
      // pointer proves the intent by moving.
      this.#pendingRestore = true;
      return;
    }
    this._dragging = true;
    this.#startRect = { x: this.window.rect.x, y: this.window.rect.y };
  };

  /**
   * Turn a drag on a maximized titlebar into a drag of the restored window, the way Windows and
   * macOS do: past the movement threshold the window un-maximizes to its previous size, arriving
   * under the pointer, and the drag carries on from there.
   * @param e The pointer move being handled.
   */
  #restoreUnderPointer(e: PointerEvent) {
    const w = this.window;
    if (!w) return;
    const travelled = Math.max(
      Math.abs(e.clientX - this.#startPointer.x),
      Math.abs(e.clientY - this.#startPointer.y),
    );
    if (travelled < RESTORE_DRAG_THRESHOLD) return;
    const pos = restoreDragPosition(e.clientX - this.#startSurface.left, this.#startSurface, w.rect);
    this.#pendingRestore = false;
    this._dragging = true;
    // Re-anchor the drag to where the window now is, so the next move is a delta from here.
    this.#startPointer = { x: e.clientX, y: e.clientY };
    this.#startRect = pos;
    this.#manager?.restoreTo(w.id, pos.x, pos.y);
  }

  #onTitlePointerMove = (e: PointerEvent) => {
    if (this.#pendingRestore) this.#restoreUnderPointer(e);
    if (!this._dragging || !this.window) return;
    const dx = e.clientX - this.#startPointer.x;
    const dy = e.clientY - this.#startPointer.y;
    // Clamped so a window can never be dragged out of reach: the titlebar stays on the desktop.
    const { x, y } = clampWindowPosition(
      { ...this.window.rect, x: this.#startRect.x + dx, y: this.#startRect.y + dy },
      this.#startSurface,
      UMBRADESKTOP_WINDOW_KEEP_VISIBLE,
    );
    this.#manager?.move(this.window.id, x, y);
  };

  #onTitlePointerUp = (e: PointerEvent) => {
    this._dragging = false;
    this.#pendingRestore = false;
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
    // Origin-clamped for the same reason as the drag: pulling the top edge up past the desktop
    // would take the titlebar — the only grab handle — with it.
    const rect = clampResizeOrigin(
      resizeRect(
        this.#resizeStartRect,
        this.#resizeEdges,
        dx,
        dy,
        this.window.app.minSize ?? UMBRADESKTOP_WINDOW_MIN_SIZE,
      ),
    );
    this.#manager?.resize(this.window.id, rect);
  };

  #onResizeUp = (e: PointerEvent) => {
    this.#resizing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  #onFocus = () => {
    if (this.window) this.#manager?.focus(this.window.id);
  };

  /** Double-clicking the titlebar toggles maximize/restore, as on Windows/GNOME/KDE. */
  #onTitleDblClick = () => {
    if (!this.window) return;
    const maximized = this.window.state === 'maximized';
    this.#manager?.setState(this.window.id, maximized ? 'normal' : 'maximized');
  };

  /**
   * A crisp, font-independent window-control glyph drawn as inline SVG. Stroke and fill are set
   * in CSS via `currentColor`, so the mark follows the button's text colour (and turns white on
   * the close button's danger hover).
   * @param kind Which control the glyph represents.
   * @returns The SVG template for that control.
   */
  #controlGlyph(kind: 'minimize' | 'maximize' | 'restore' | 'close') {
    const glyphs = {
      minimize: html`<svg class="glyph" viewBox="0 0 12 12"><line x1="2.5" y1="6.5" x2="9.5" y2="6.5"></line></svg>`,
      maximize: html`<svg class="glyph" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7"></rect></svg>`,
      restore: html`<svg class="glyph" viewBox="0 0 12 12">
        <rect x="2.5" y="3.5" width="6" height="6"></rect>
        <path d="M4.5 3.5 V2 H9.5 V7 H8"></path>
      </svg>`,
      close: html`<svg class="glyph" viewBox="0 0 12 12">
        <line x1="3" y1="3" x2="9" y2="9"></line>
        <line x1="9" y1="3" x2="3" y2="9"></line>
      </svg>`,
    };
    return glyphs[kind];
  }

  override render() {
    const w = this.window;
    if (!w) return null;
    const min = w.app.minSize ?? UMBRADESKTOP_WINDOW_MIN_SIZE;
    const maximized = w.state === 'maximized';
    const style = maximized
      ? `left:0; top:0; width:100%; height:100%; z-index:${w.z};`
      : `left:${w.rect.x}px; top:${w.rect.y}px; width:${w.rect.w}px; height:${w.rect.h}px; z-index:${w.z}; min-width:${min.w}px; min-height:${min.h}px;`;
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
          @pointerup=${this.#onTitlePointerUp}
          @dblclick=${this.#onTitleDblClick}>
          <span class="title">
            <umb-icon name=${w.app.icon}></umb-icon>
            <span class="title-text">${this.localize.string(w.app.name)}</span>
          </span>
          <span
            class="controls"
            @pointerdown=${(e: PointerEvent) => e.stopPropagation()}
            @dblclick=${(e: MouseEvent) => e.stopPropagation()}>
            <button
              class="ctrl"
              title="Minimize"
              aria-label="Minimize"
              @click=${() => this.#manager?.setState(w.id, 'minimized')}>
              ${this.#controlGlyph('minimize')}
            </button>
            <button
              class="ctrl"
              title=${maximized ? 'Restore' : 'Maximize'}
              aria-label=${maximized ? 'Restore' : 'Maximize'}
              @click=${() => this.#manager?.setState(w.id, maximized ? 'normal' : 'maximized')}>
              ${this.#controlGlyph(maximized ? 'restore' : 'maximize')}
            </button>
            <button
              class="ctrl close"
              title="Close"
              aria-label="Close"
              @click=${() => this.#manager?.close(w.id)}>
              ${this.#controlGlyph('close')}
            </button>
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
      /* Focus is shown the way Windows/GNOME/KDE all show it: the active window is the
         crisp, elevated one (full-strength titlebar + deeper shadow) and inactive windows
         recede (muted titlebar, flatter shadow) — no header tint. */
      .frame.active {
        box-shadow: var(--uui-shadow-depth-5);
      }
      .titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-2);
        /* No vertical or right padding: the controls run full height and flush to the
           top-right edge, so the corner buttons are easy targets (Fitts's law). */
        padding: 0 0 0 var(--uui-size-space-3);
        min-height: 40px;
        background: var(--uui-color-surface);
        border-bottom: 1px solid var(--uui-color-border);
        cursor: move;
        user-select: none;
      }
      .frame:not(.active) .title,
      .frame:not(.active) .controls {
        opacity: 0.5;
      }
      .title {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        font-weight: 700;
        font-size: calc(var(--uui-type-small-size) + 2px);
      }
      .title umb-icon {
        font-size: 18px;
      }
      .title-text {
        /* Lato sits high in its line box; nudge the title down ~1px so it optically
           centers against the icon, matching the taskbar. */
        transform: translateY(1px);
      }
      .controls {
        display: inline-flex;
        align-self: stretch;
        /* Sit above the resize handles so the top/corner handles never steal clicks
           from the minimize/maximize/close buttons. */
        position: relative;
        z-index: 5;
      }
      .ctrl {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 46px;
        height: 100%;
        padding: 0;
        border: none;
        border-radius: 0;
        background: transparent;
        color: var(--uui-color-text);
        cursor: pointer;
      }
      .ctrl .glyph {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 1.2;
        fill: none;
        stroke-linecap: square;
      }
      .ctrl:hover {
        background: rgba(0, 0, 0, 0.07);
      }
      /* Windows/KDE close affordance: red fill + white mark on hover. */
      .ctrl.close:hover {
        background: var(--uui-color-danger, #d42054);
        color: #fff;
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
