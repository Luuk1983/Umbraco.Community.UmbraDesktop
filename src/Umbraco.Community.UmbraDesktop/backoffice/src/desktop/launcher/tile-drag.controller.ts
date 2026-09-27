import type { UmbraDesktopApp } from '../types';
import type { UmbraDesktopDropTarget } from './drop-target';

/**
 * Dragging a tile or a group inside the launcher (design §5, D13).
 *
 * Hand-rolled on pointer events rather than `UmbSorterController`, which uses native HTML5 drag and
 * drop: that has no keyboard path and does not fire under touch emulation. One controller per
 * launcher, shared by normal mode and arrange mode, because both render into the same shadow root.
 *
 * The gesture rules:
 * - **Mouse and pen** start past {@link UMBRADESKTOP_DRAG_THRESHOLD_PX}, so a click still launches.
 * - **Touch** starts after {@link UMBRADESKTOP_DRAG_LONG_PRESS_MS} without moving more than
 *   {@link UMBRADESKTOP_DRAG_TOUCH_SLOP_PX}, so a swipe still scrolls. A touch that moves first is
 *   left to the browser, which scrolls and cancels the pointer.
 * - Once a touch drag has started, the element's `touchmove` is prevented. Chrome only honours that
 *   on the first move of a sequence, and a long press has no moves, so the first move is the drag's
 *   own and the page does not scroll under it.
 *
 * Until the drag starts nothing is captured and the moves are read on `window`. Capturing on
 * `pointerdown` would retarget the `click` of an ordinary tap to the tile's wrapper instead of its
 * button, which silently stops tiles launching. Capture is taken when the drag starts, and the one
 * click the release then produces is swallowed.
 */

/** Movement, in px, that turns a mouse or pen press into a drag. */
export const UMBRADESKTOP_DRAG_THRESHOLD_PX = 4;

/** How long, in ms, a touch has to rest before it becomes a drag. */
export const UMBRADESKTOP_DRAG_LONG_PRESS_MS = 400;

/** Movement, in px, that makes a resting touch a scroll instead of a drag. */
export const UMBRADESKTOP_DRAG_TOUCH_SLOP_PX = 8;

/** Distance, in px, from the scroller's top or bottom edge at which a drag scrolls it. */
export const UMBRADESKTOP_DRAG_SCROLL_BAND_PX = 40;

/** How far, in px, the scroller moves per animation frame while the pointer is in the band. */
export const UMBRADESKTOP_DRAG_SCROLL_STEP_PX = 12;

/**
 * How far to scroll the scroller this frame for a pointer at a point: up in its top band, down in
 * its bottom band, and not at all anywhere else. Outside the scroller's box counts as anywhere
 * else, which is what keeps the remove pane usable: it sits just below the body, and scrolling
 * whenever the pointer was below the body's top edge ran the list to the bottom for as long as the
 * pointer rested on the pane.
 * @param box The scroller's client rect.
 * @param x The pointer's client x.
 * @param y The pointer's client y.
 * @returns A signed step in px, or 0.
 */
export function edgeScrollStep(box: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, x: number, y: number): number {
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) return 0;
  if (y < box.top + UMBRADESKTOP_DRAG_SCROLL_BAND_PX) return -UMBRADESKTOP_DRAG_SCROLL_STEP_PX;
  if (y > box.bottom - UMBRADESKTOP_DRAG_SCROLL_BAND_PX) return UMBRADESKTOP_DRAG_SCROLL_STEP_PX;
  return 0;
}

/** An element that may have the Popover API, which older browsers and the ES2020 DOM types lack. */
type UmbraDesktopMaybePopover = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * Put the ghost in the top layer, as a manual popover, so it is positioned against the viewport
 * whatever the launcher does. A theme that blurs the panel (`backdrop-filter`, as Windows 11 and
 * macOS do) makes the panel the containing block for its fixed descendants, and the panel's
 * `overflow: hidden` clips them: a merely fixed ghost landed offset by the panel's position, or out
 * of sight. Without the Popover API the ghost stays a plain fixed element, which is still right
 * under every theme that does not blur.
 * @param ghost The ghost, already in the launcher's shadow root.
 */
function showInTopLayer(ghost: UmbraDesktopMaybePopover): void {
  if (typeof ghost.showPopover !== 'function') return;
  ghost.setAttribute('popover', 'manual');
  try {
    ghost.showPopover();
  } catch {
    // Not shown: drop the attribute, whose closed state would otherwise hide the ghost entirely.
    ghost.removeAttribute('popover');
  }
}

/**
 * Take the ghost out of the top layer before it leaves the DOM. Removal alone would do it too; this
 * says so rather than leaving it to a side effect.
 * @param ghost The ghost.
 */
function hideFromTopLayer(ghost: UmbraDesktopMaybePopover): void {
  if (!ghost.hasAttribute('popover') || typeof ghost.hidePopover !== 'function') return;
  try {
    ghost.hidePopover();
  } catch {
    // Already hidden: nothing to undo.
  }
}

/**
 * What is being dragged. An app dragged out of arrange mode's palette says so, because the palette
 * is also a drop target and dropping a palette app back on it must do nothing rather than mark it
 * removed.
 */
export type UmbraDesktopDragSource =
  | { kind: 'app'; app: UmbraDesktopApp; fromPalette?: boolean }
  | { kind: 'group'; groupId: string };

/** What the launcher does with the drag. */
export interface UmbraDesktopTileDragOptions {
  /** The drop target under a point, given what is being dragged. */
  targetAt(x: number, y: number, source: UmbraDesktopDragSource): UmbraDesktopDropTarget | undefined;
  /** The drag has started; show the remove pane and Pinned. */
  onStart(source: UmbraDesktopDragSource): void;
  /** The target under the pointer changed; show where the drop would land. */
  onOver(target: UmbraDesktopDropTarget | undefined): void;
  /** The pointer was released over a target. */
  onDrop(source: UmbraDesktopDragSource, target: UmbraDesktopDropTarget): void;
  /** The drag is over, dropped or cancelled. Always called last. */
  onEnd(): void;
  /** The element to scroll near its edges. */
  scroller(): HTMLElement | null;
}

/** A press that has not yet become a drag. */
interface UmbraDesktopPendingDrag {
  /** What it stands for. */
  source: UmbraDesktopDragSource;
  /** The pressed element, which the ghost copies and which takes capture. */
  element: HTMLElement;
  /** The pointer, so a second finger is ignored. */
  pointerId: number;
  /** mouse, pen or touch, which decides the gesture rule. */
  pointerType: string;
  /** Where the press began. */
  startX: number;
  /** Where the press began. */
  startY: number;
  /** The long-press timer, for touch. */
  timer?: number;
}

/** A drag under way. */
interface UmbraDesktopActiveDrag extends UmbraDesktopPendingDrag {
  /** The copy that follows the pointer. */
  ghost: HTMLElement;
  /** The pointer now. */
  x: number;
  /** The pointer now. */
  y: number;
  /** The target last reported, so `onOver` fires on change only. */
  target?: UmbraDesktopDropTarget;
  /** The edge-scroll animation frame. */
  frame?: number;
}

/**
 * A hand-rolled drag: a long-lived controller wired to one tile's `pointerdown` at a time (via
 * {@link begin}), which then drives the whole gesture off `window`/`document` listeners until it
 * ends. See the module comment for the gesture rules this implements.
 */
export class UmbraDesktopTileDragController {
  /** The shadow root the ghost is drawn in; a function because the host renders it after construction. */
  #root: () => ShadowRoot | null;

  /** The launcher's side of the drag. */
  #options: UmbraDesktopTileDragOptions;

  /** A press waiting to become a drag. */
  #pending?: UmbraDesktopPendingDrag;

  /** The drag under way. */
  #active?: UmbraDesktopActiveDrag;

  /**
   * @param root The launcher's shadow root.
   * @param options What the launcher does with the drag.
   */
  constructor(root: () => ShadowRoot | null, options: UmbraDesktopTileDragOptions) {
    this.#root = root;
    this.#options = options;
  }

  /**
   * A press on something draggable. Call from its `pointerdown`.
   * @param e The pointer event; its `currentTarget` is what gets dragged.
   * @param source What it stands for.
   */
  begin(e: PointerEvent, source: UmbraDesktopDragSource): void {
    if (this.#pending || this.#active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const element = e.currentTarget as HTMLElement | null;
    if (!element) return;
    this.#pending = {
      source,
      element,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
    };
    window.addEventListener('pointermove', this.#onMove, true);
    window.addEventListener('pointerup', this.#onUp, true);
    window.addEventListener('pointercancel', this.#onPointerCancel, true);
    if (e.pointerType === 'touch') {
      element.addEventListener('touchmove', this.#onTouchMove, { passive: false });
      element.addEventListener('contextmenu', this.#onContextMenu);
      this.#pending.timer = window.setTimeout(() => this.#start(), UMBRADESKTOP_DRAG_LONG_PRESS_MS);
    }
  }

  /** Abandon anything under way, e.g. because the launcher is being unmounted. */
  cancel(): void {
    const wasActive = this.#active !== undefined;
    this.#cleanup();
    if (wasActive) this.#options.onEnd();
  }

  /** Pointer moves, read on `window` until the drag captures. */
  #onMove = (e: PointerEvent) => {
    const drag = this.#active ?? this.#pending;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!this.#active) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (drag.pointerType === 'touch') {
        if (moved > UMBRADESKTOP_DRAG_TOUCH_SLOP_PX) this.#cleanup();
        return;
      }
      if (moved < UMBRADESKTOP_DRAG_THRESHOLD_PX) return;
      this.#start();
    }
    if (!this.#active) return;
    this.#active.x = e.clientX;
    this.#active.y = e.clientY;
    this.#track();
  };

  /** Release: a drop if a drag is under way, otherwise nothing, and the click goes through. */
  #onUp = (e: PointerEvent) => {
    const drag = this.#active ?? this.#pending;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!this.#active) {
      this.#cleanup();
      return;
    }
    const source = this.#active.source;
    const target = this.#options.targetAt(e.clientX, e.clientY, source);
    this.#swallowNextClick();
    this.#cleanup();
    if (target) this.#options.onDrop(source, target);
    this.#options.onEnd();
  };

  /** The browser took the pointer, usually to scroll. */
  #onPointerCancel = (e: PointerEvent) => {
    const drag = this.#active ?? this.#pending;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.cancel();
  };

  /** Stop the page scrolling under a touch drag. See the class comment for why this is enough. */
  #onTouchMove = (e: TouchEvent) => {
    if (this.#active) e.preventDefault();
  };

  /** A long press opens a context menu on some platforms; not on a draggable tile. */
  #onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  /** Escape cancels, and stops there, so the taskbar does not also close the launcher. */
  #onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.cancel();
  };

  /** Turn the pending press into a drag: capture, draw the ghost, tell the launcher. */
  #start(): void {
    const pending = this.#pending;
    const root = this.#root();
    if (!pending || !root) return;
    const box = pending.element.getBoundingClientRect();
    const ghost = pending.element.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-drop');
    ghost.style.width = `${box.width}px`;
    root.appendChild(ghost);
    showInTopLayer(ghost);
    pending.element.toggleAttribute('data-lifted', true);
    try {
      pending.element.setPointerCapture(pending.pointerId);
    } catch {
      // A synthetic or already-released pointer: the drag still gets its moves on `window`.
    }
    this.#active = { ...pending, ghost, x: pending.startX, y: pending.startY };
    this.#pending = undefined;
    document.addEventListener('keydown', this.#onKey, true);
    this.#options.onStart(this.#active.source);
    this.#track();
    this.#active.frame = requestAnimationFrame(this.#scrollFrame);
  }

  /** Move the ghost and report the target under it when it changes. */
  #track(): void {
    const active = this.#active;
    if (!active) return;
    active.ghost.style.left = `${active.x}px`;
    active.ghost.style.top = `${active.y}px`;
    const target = this.#options.targetAt(active.x, active.y, active.source);
    if (JSON.stringify(target) !== JSON.stringify(active.target)) {
      active.target = target;
      this.#options.onOver(target);
    }
  }

  /** Scroll near the scroller's edges, once per frame, for as long as the drag lasts. */
  #scrollFrame = () => {
    const active = this.#active;
    if (!active) return;
    const scroller = this.#options.scroller();
    if (scroller) {
      const step = edgeScrollStep(scroller.getBoundingClientRect(), active.x, active.y);
      const before = scroller.scrollTop;
      if (step !== 0) scroller.scrollTop += step;
      if (scroller.scrollTop !== before) this.#track();
    }
    active.frame = requestAnimationFrame(this.#scrollFrame);
  };

  /** Swallow the one click the release of a captured drag produces, so the tile does not launch. */
  #swallowNextClick(): void {
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    // The click, if any, is dispatched with the release; anything later is a new click.
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  }

  /** Remove every listener, the timer, the frame and the ghost. */
  #cleanup(): void {
    const drag = this.#active ?? this.#pending;
    if (drag) {
      if (drag.timer !== undefined) clearTimeout(drag.timer);
      drag.element.removeEventListener('touchmove', this.#onTouchMove);
      drag.element.removeEventListener('contextmenu', this.#onContextMenu);
      drag.element.removeAttribute('data-lifted');
    }
    if (this.#active) {
      if (this.#active.frame !== undefined) cancelAnimationFrame(this.#active.frame);
      hideFromTopLayer(this.#active.ghost);
      this.#active.ghost.remove();
      try {
        this.#active.element.releasePointerCapture(this.#active.pointerId);
      } catch {
        // Nothing was captured.
      }
    }
    window.removeEventListener('pointermove', this.#onMove, true);
    window.removeEventListener('pointerup', this.#onUp, true);
    window.removeEventListener('pointercancel', this.#onPointerCancel, true);
    document.removeEventListener('keydown', this.#onKey, true);
    this.#pending = undefined;
    this.#active = undefined;
  }
}
