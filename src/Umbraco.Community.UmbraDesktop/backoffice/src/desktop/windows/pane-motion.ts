import type { UmbraDesktopDockSide } from '../window-group.js';

/**
 * How a pane moves: sliding out of its window and back in, and lifting off when it pops out into a
 * window of its own. The geometry is pure and lives here, so each case is tested without a window;
 * `window.element` plays it.
 *
 * Two kinds of slide, because opening a pane does one of two things to its window (`placePane`). A
 * window that can grow grows by the pane, so the editor keeps its width: its edge moves out and the
 * pane rides it, coming out from under the editor like a drawer. A maximized or snapped window
 * cannot grow, so the pane slides in over the editor, which narrows once it has landed.
 *
 * Only the frame's width and the pane's transform move. The editor and the pane are held at their
 * final widths for the whole slide, so neither page reflows while it plays: an editor that resized
 * on every frame of a 200ms slide would relayout the backoffice a dozen times for nothing.
 *
 * Design: `docs/design/2026-10-27-pane-side-panel-design.md`.
 */

/** How long a pane takes to slide out, in ms: quick enough to read as a response to the click. */
export const UMBRADESKTOP_PANE_OPEN_MS = 200;

/** How long a pane takes to slide back, in ms: a little quicker, as putting away usually is. */
export const UMBRADESKTOP_PANE_CLOSE_MS = 160;

/** How long a popped-out pane takes to settle into its window's place, in ms. */
export const UMBRADESKTOP_PANE_LIFT_MS = 250;

/** One curve for every pane motion: fast out of the gate, settling gently. */
export const UMBRADESKTOP_PANE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/** What {@link paneMotion} needs to know about the window and the pane. */
export interface UmbraDesktopPaneMotionInput {
  /** The side the pane is on. */
  side: UmbraDesktopDockSide;
  /** How much the window grew for the pane, in px; zero for a window that could not grow. */
  grew: number;
  /** How much room the pane takes beside the editor: its width and its splitter's. */
  span: number;
  /** Where the window's frame is with the pane open. */
  rect: { x: number; w: number };
}

/** A pane's slide, as the keyframes for opening; closing plays them backwards. */
export interface UmbraDesktopPaneMotion {
  /** The frame's left edge and width, or undefined when the window does not change size. */
  frame?: Keyframe[];
  /** The pane's transform, together with its splitter. */
  pane: Keyframe[];
  /**
   * How far the editor reaches into the pane's place while it moves, in px: by as much as the window
   * did not grow, so the editor holds the width it had before the pane until it has landed.
   */
  overlap: number;
  /** Whether the pane is drawn under the editor, which it comes out from, or over it. */
  under: boolean;
}

/**
 * The keyframes that slide a pane out of its window. Pure.
 * @param input The window and the pane.
 * @returns The motion.
 */
export function paneMotion(input: UmbraDesktopPaneMotionInput): UmbraDesktopPaneMotion {
  const { side, grew, span, rect } = input;
  // Rightwards is positive, so a pane on the left is the mirror image of one on the right.
  const out = side === 'right' ? 1 : -1;
  const frame =
    grew > 0
      ? [
          { left: `${side === 'left' ? rect.x + grew : rect.x}px`, width: `${rect.w - grew}px`, minWidth: '0px' },
          { left: `${rect.x}px`, width: `${rect.w}px`, minWidth: '0px' },
        ]
      : undefined;
  // Riding the edge, the pane starts tucked under the editor by what the window grew; sliding over
  // the editor, it starts just past the window's edge, by the whole of itself.
  const start = grew > 0 ? -out * grew : out * span;
  return {
    frame,
    pane: [{ transform: `translateX(${start}px)` }, { transform: 'translateX(0px)' }],
    overlap: span - grew,
    under: grew > 0,
  };
}

/**
 * The keyframes that carry a popped-out window from where its pane was to where it opened. Pure.
 * Translation only: a page scaled on the way would show its text stretched for a quarter second.
 * @param from The pane's top-left corner, on the desktop.
 * @param to The window's top-left corner, on the desktop.
 * @returns The motion.
 */
export function liftMotion(from: { x: number; y: number }, to: { x: number; y: number }): Keyframe[] {
  return [{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` }, { transform: 'translate(0px, 0px)' }];
}

/**
 * Where popped-out panes were, by id, until their windows open. A pane keeps its id when it pops
 * out (`undock`), so the owner, which is the one that saw where the pane was, leaves its corner here
 * and the new window, a separate element, picks it up when it first draws.
 */
const lifts = new Map<string, { x: number; y: number }>();

/**
 * Remember where a pane was, for the window it is about to become.
 * @param id The pane's id, which the window keeps.
 * @param at The pane's top-left corner, on the desktop.
 */
export function rememberLift(id: string, at: { x: number; y: number }): void {
  lifts.set(id, at);
}

/**
 * Take where a window's pane was, once: a window that opens again later under the same id, as it
 * would after a reload of the desktop, should simply be there.
 * @param id The window's id.
 * @returns The pane's corner, or undefined when the window did not pop out of one just now.
 */
export function takeLift(id: string): { x: number; y: number } | undefined {
  const at = lifts.get(id);
  lifts.delete(id);
  return at;
}

/**
 * Whether the system asks for reduced motion, in which case panes simply appear and go, as they
 * did before they moved. Asked each time, so a change in the system settings applies at once.
 * @returns True when motion should be left out.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
