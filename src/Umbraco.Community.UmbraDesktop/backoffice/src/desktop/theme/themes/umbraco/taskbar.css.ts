import { css } from '@umbraco-cms/backoffice/external/lit';
import {
  UMBRACO_MIN_TOUCH,
  UMBRACO_TASK_LINE,
  UMBRACO_TASK_LINE_INSET,
  UMBRACO_TASK_TILE_BOTTOM,
  UMBRACO_TASK_TILE_RADIUS,
  UMBRACO_TASK_TILE_SIDE,
  UMBRACO_TASK_TILE_TOP,
} from './metrics.js';

/**
 * The Umbraco taskbar: the bar and the coral line are exactly as they have always been, and what
 * changes is how a button answers the pointer and how a group of windows is boxed.
 *
 * **The hover is a tile inside the button.** The base lights a button's whole box, which on a
 * 50px bar is a full-height block. Here the button keeps its box, and so keeps its touch target
 * and the place its line is drawn, and a rounded tile is painted inside it. The tile is a pseudo-
 * element behind the button's content, which is what `isolation` and the negative `z-index` are
 * for: without them it would paint over the icon.
 *
 * **The active window is a lit tile with a short coral line under it.** The tile is the one hover
 * paints, lit before anyone hovers, so the focused window is the one button that is never at rest.
 * The line is the section menu's marker, and it stays on the button's bottom edge, which is the bar's
 * bottom edge. It used to be the base's inset shadow, edge to edge and 3px: that read as a rule drawn
 * across the bar. It is a short bar with soft ends now, stopping short of the button's sides, which is
 * how the underline under the active tab inside a window is drawn. The two cues together are what stop
 * a hovered button being mistaken for the active one. The tile's bottom gap is bigger than its top
 * one so that it clears the line.
 *
 * **A group is a tab.** The box around a window and its attached windows rises from the bar's edge
 * with no line under it, which is what keeps the focused member's line on that edge like every other
 * window's. The rest of the group's look is tokens, in `palette.ts`.
 *
 * Written against `.task` and never `.running .task`: the fixed row of buttons carries `.task` too,
 * and a rule scoped to the window list would leave it on the base's square block.
 */
export default css`
  .start,
  .task {
    position: relative;
    isolation: isolate;
  }
  .start::before,
  .task::before {
    content: '';
    position: absolute;
    z-index: -1;
    top: ${UMBRACO_TASK_TILE_TOP}px;
    bottom: ${UMBRACO_TASK_TILE_BOTTOM}px;
    left: ${UMBRACO_TASK_TILE_SIDE}px;
    right: ${UMBRACO_TASK_TILE_SIDE}px;
    border-radius: ${UMBRACO_TASK_TILE_RADIUS}px;
    background: transparent;
    transition: background-color 120ms;
    pointer-events: none;
  }
  /* The bar's own ink at a low strength, so one rule is right on whatever the bar's colour is. */
  .start:hover::before,
  .task:hover::before {
    background: color-mix(in srgb, currentColor 14%, transparent);
  }
  .start.active::before {
    background: color-mix(in srgb, currentColor 20%, transparent);
  }
  /* Wide enough to tap. A button with a label is wider than this anyway; it is the icon-only ones
     in the fixed row that came to 42. Centred, so the icon sits in the middle of the extra. */
  .start,
  .task {
    min-width: ${UMBRACO_MIN_TOUCH}px;
    justify-content: center;
  }
  /* The active window's tile, stronger than hover's. Written after the hover rule and at the same
     specificity, so a hovered active window keeps the stronger tile instead of dropping to the
     weaker one. */
  .task.active::before {
    background: color-mix(in srgb, currentColor 20%, transparent);
  }
  /* The coral line. The base's own is an inset shadow on this exact selector, so it is switched off
     here, and the line is drawn as a bar on the button's bottom edge instead. */
  .task.active {
    box-shadow: none;
  }
  .task.active::after {
    content: '';
    position: absolute;
    left: ${UMBRACO_TASK_LINE_INSET}px;
    right: ${UMBRACO_TASK_LINE_INSET}px;
    bottom: 0;
    height: ${UMBRACO_TASK_LINE}px;
    background: var(--umbradesktop-task-active-marker, var(--uui-color-current, #f5c1bc));
    border-radius: ${UMBRACO_TASK_LINE}px ${UMBRACO_TASK_LINE}px 0 0;
  }
  /* Rising from the bar's edge. 'none' rather than a zero width, and that is a real distinction to
     the scan in theme/attached-content.test.ts, which reads a zero width as a hidden box. */
  .task-group {
    margin: 5px 0 0;
    border-bottom: none;
  }
`;
