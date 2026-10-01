import {
  STICKY_NOTES_DRAG_SCROLL_BAND_PX,
  STICKY_NOTES_DRAG_SCROLL_STEP_PX,
  STICKY_NOTES_DRAG_THRESHOLD_PX,
} from './constants.js';

/**
 * Dragging a note by its handle to reorder the board.
 *
 * On pointer events, as the host launcher's arrange mode is (issue #59, design D13 in
 * `docs/design/2026-09-27-launcher-layout-design.md`), so a note moves the way a launcher tile does
 * and looks the same doing it. The launcher's controller cannot be imported, since the host exports
 * nothing to add-ons, so this is a smaller copy of the same rules rather than the same code:
 *
 * - A press becomes a drag past {@link STICKY_NOTES_DRAG_THRESHOLD_PX} of movement, so a click on the
 *   handle stays a click. Touch follows the same rule instead of the launcher's long press, because
 *   the handle, unlike a launcher tile, is nothing but a handle: it sets `touch-action: none`, so a
 *   swipe that starts on it was never going to scroll.
 * - Once started, the handle takes pointer capture, which keeps the drag alive over everything
 *   under it; a small ghost follows the pointer, beside it rather than under it; the board scrolls
 *   near its top and bottom edges; Escape cancels.
 * - Native HTML5 drag and drop, which this app used first, is what the launcher rejected: it has no
 *   keyboard path and does not fire under touch.
 */

/** Where a dragged note would land: beside which note, and on which side of it. */
export interface NoteDropTarget {
  /** The note it would land beside. */
  key: string;
  /** Before or after that note. */
  side: 'before' | 'after';
}

/** What the board does with a drag. */
export interface NoteDragOptions {
  /**
   * Where a note dropped at a point would land, or undefined where it would not land at all.
   * @param x The pointer's client x.
   * @param y The pointer's client y.
   * @param key The note being dragged.
   */
  targetAt(x: number, y: number, key: string): NoteDropTarget | undefined;
  /**
   * The ghost to draw for a note: an element not yet in the document.
   * @param key The note being dragged.
   */
  ghost(key: string): HTMLElement;
  /**
   * The drag has started: lift the note.
   * @param key The note being dragged.
   */
  onStart(key: string): void;
  /**
   * The landing place under the pointer changed.
   * @param target Where it would land now.
   */
  onOver(target: NoteDropTarget | undefined): void;
  /**
   * The pointer was released over a landing place.
   * @param key The note dragged.
   * @param target Where it lands.
   */
  onDrop(key: string, target: NoteDropTarget): void;
  /** The drag is over, dropped or cancelled. Always called last. */
  onEnd(): void;
  /** The element to scroll near its edges. */
  scroller(): HTMLElement | null;
}

/** A press on a handle, and the drag it may become. */
interface NoteDrag {
  /** The note. */
  key: string;
  /** The pressed handle, which takes capture once the drag starts. */
  handle: HTMLElement;
  /** The pointer, so a second finger is ignored. */
  pointerId: number;
  /** mouse, pen or touch, which decides which side of the pointer the ghost is drawn. */
  pointerType: string;
  /** Where the press began. */
  startX: number;
  /** Where the press began. */
  startY: number;
  /** The pointer now. */
  x: number;
  /** The pointer now. */
  y: number;
  /** The ghost, once the drag has started. */
  ghost?: HTMLElement;
  /** The landing place last reported, so `onOver` fires on change only. */
  target?: NoteDropTarget;
  /** The edge-scroll animation frame. */
  frame?: number;
}

/** An element that may have the Popover API, which the ES2020 DOM types lack. */
type MaybePopover = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * Put the ghost in the top layer as a manual popover, as the launcher does, so it is placed against
 * the viewport whatever the window around the board does: a theme that blurs a window's frame makes
 * that frame the containing block of anything fixed inside it. Without the Popover API it stays a
 * plain fixed element, which is right under every theme that does not.
 * @param ghost The ghost, already in the board's shadow root.
 */
function showInTopLayer(ghost: MaybePopover): void {
  if (typeof ghost.showPopover !== 'function') return;
  ghost.setAttribute('popover', 'manual');
  try {
    ghost.showPopover();
  } catch {
    // Not shown: drop the attribute, whose closed state would otherwise hide the ghost.
    ghost.removeAttribute('popover');
  }
}

/**
 * One board's note drag. Long-lived, wired to one handle's `pointerdown` at a time through
 * {@link begin}, then driven off `window` listeners until the gesture ends.
 */
export class NoteDragController {
  /** The shadow root the ghost is drawn in; a function because the board renders after construction. */
  #root: () => ShadowRoot | null;

  /** The board's side of the drag. */
  #options: NoteDragOptions;

  /** The press or drag under way. */
  #drag?: NoteDrag;

  /**
   * @param root The board's shadow root.
   * @param options What the board does with the drag.
   */
  constructor(root: () => ShadowRoot | null, options: NoteDragOptions) {
    this.#root = root;
    this.#options = options;
  }

  /**
   * A press on a note's handle. Call from its `pointerdown`.
   * @param e The pointer event; its `currentTarget` is the handle.
   * @param key The note.
   */
  begin(e: PointerEvent, key: string): void {
    if (this.#drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const handle = e.currentTarget as HTMLElement | null;
    if (!handle) return;
    this.#drag = {
      key,
      handle,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
    };
    window.addEventListener('pointermove', this.#onMove, true);
    window.addEventListener('pointerup', this.#onUp, true);
    window.addEventListener('pointercancel', this.#onCancel, true);
  }

  /** Abandon anything under way, e.g. because the board is being closed. */
  cancel(): void {
    const started = this.#drag?.ghost !== undefined;
    this.#cleanup();
    if (started) this.#options.onEnd();
  }

  /** Pointer moves: start the drag past the threshold, then follow the pointer. */
  #onMove = (e: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.ghost) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < STICKY_NOTES_DRAG_THRESHOLD_PX) return;
      this.#start(drag);
    }
    this.#track();
  };

  /** Release: a drop if a drag is under way and over a landing place, otherwise nothing. */
  #onUp = (e: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.ghost) {
      this.#cleanup();
      return;
    }
    const target = this.#options.targetAt(e.clientX, e.clientY, drag.key);
    this.#cleanup();
    if (target) this.#options.onDrop(drag.key, target);
    this.#options.onEnd();
  };

  /** The browser took the pointer. */
  #onCancel = (e: PointerEvent): void => {
    if (this.#drag && e.pointerId === this.#drag.pointerId) this.cancel();
  };

  /** Escape cancels, and stops there, so nothing else on the desktop also acts on it. */
  #onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.cancel();
  };

  /**
   * Turn the press into a drag: capture, draw the ghost, tell the board.
   * @param drag The press.
   */
  #start(drag: NoteDrag): void {
    const root = this.#root();
    if (!root) return;
    const ghost = this.#options.ghost(drag.key);
    ghost.classList.add('drag-ghost');
    ghost.dataset.pointer = drag.pointerType === 'touch' ? 'touch' : 'mouse';
    root.appendChild(ghost);
    showInTopLayer(ghost);
    drag.ghost = ghost;
    try {
      drag.handle.setPointerCapture(drag.pointerId);
    } catch {
      // A synthetic or already-released pointer: the drag still gets its moves on `window`.
    }
    document.addEventListener('keydown', this.#onKey, true);
    this.#options.onStart(drag.key);
    drag.frame = requestAnimationFrame(this.#scrollFrame);
  }

  /** Move the ghost, and report the landing place under the pointer when it changes. */
  #track(): void {
    const drag = this.#drag;
    if (!drag?.ghost) return;
    drag.ghost.style.left = `${drag.x}px`;
    drag.ghost.style.top = `${drag.y}px`;
    const target = this.#options.targetAt(drag.x, drag.y, drag.key);
    if (target?.key !== drag.target?.key || target?.side !== drag.target?.side) {
      drag.target = target;
      this.#options.onOver(target);
    }
  }

  /**
   * Scroll the board near its top and bottom edges, once per frame, for as long as the drag lasts,
   * so a note can be carried to a place that is out of sight. Only with the pointer inside the
   * board, as the launcher learned: outside it, nothing should scroll.
   */
  #scrollFrame = (): void => {
    const drag = this.#drag;
    if (!drag?.ghost) return;
    const scroller = this.#options.scroller();
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      const inside = drag.x >= box.left && drag.x <= box.right && drag.y >= box.top && drag.y <= box.bottom;
      const step = !inside
        ? 0
        : drag.y < box.top + STICKY_NOTES_DRAG_SCROLL_BAND_PX
          ? -STICKY_NOTES_DRAG_SCROLL_STEP_PX
          : drag.y > box.bottom - STICKY_NOTES_DRAG_SCROLL_BAND_PX
            ? STICKY_NOTES_DRAG_SCROLL_STEP_PX
            : 0;
      const before = scroller.scrollTop;
      if (step !== 0) scroller.scrollTop += step;
      if (scroller.scrollTop !== before) this.#track();
    }
    drag.frame = requestAnimationFrame(this.#scrollFrame);
  };

  /** Remove every listener, the frame, the capture and the ghost. */
  #cleanup(): void {
    const drag = this.#drag;
    if (drag?.frame !== undefined) cancelAnimationFrame(drag.frame);
    if (drag?.ghost) {
      const ghost = drag.ghost as MaybePopover;
      if (ghost.hasAttribute('popover')) {
        try {
          ghost.hidePopover?.();
        } catch {
          // Already hidden.
        }
      }
      ghost.remove();
      try {
        drag.handle.releasePointerCapture(drag.pointerId);
      } catch {
        // Nothing was captured.
      }
    }
    window.removeEventListener('pointermove', this.#onMove, true);
    window.removeEventListener('pointerup', this.#onUp, true);
    window.removeEventListener('pointercancel', this.#onCancel, true);
    document.removeEventListener('keydown', this.#onKey, true);
    this.#drag = undefined;
  }
}
