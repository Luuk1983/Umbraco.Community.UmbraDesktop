import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { W11_FONT } from './palette.js';
import {
  W11_TASK_MARKER_HEIGHT,
  W11_TASK_MARKER_WIDTH,
  W11_TASK_MARKER_WIDTH_INACTIVE,
  W11_TASK_SIZE,
  W11_TASKBAR_DIVIDER_HEIGHT,
  W11_TASKBAR_HEIGHT,
  W11_TASKBAR_PADDING,
} from './metrics.js';

/**
 * The Windows 11 taskbar: flush, full width, acrylic, with Start and the running windows centred
 * on the screen and the clock pinned to the trailing end.
 *
 * Centring is the one genuinely structural thing this theme does, and it is what the `.cluster`
 * wrapper was added to the chrome for (design §4) — this is its first user. The subtlety is that
 * Windows centres the cluster on the **bar**, not on the space the clock leaves over; those
 * differ by half the clock's width, which is the difference between a Windows 11 taskbar and a
 * nearly-centred one. So the cluster comes out of the flex flow and is positioned against the bar
 * instead, and the clock — now the only item left in that flow — is pushed right with an auto
 * margin.
 *
 * Everything else is colour, and lives in the palette.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(W11_FONT)};
  }
  /* box-sizing so the bar's top hairline comes out of the height the token declares rather than
     being added to it — the height is also metrics.taskbarReserve, and a bar taller than the
     space reserved for it lets windows slide underneath. metrics.test.ts measures this, and
     caught it: 48 declared against 49 painted. position: relative gives the centred cluster
     something to be centred against. */
  .bar {
    box-sizing: border-box;
    position: relative;
    height: ${W11_TASKBAR_HEIGHT}px;
    padding: 0 ${W11_TASKBAR_PADDING}px;
    gap: 0;
  }
  /* Out of the flex flow and centred on the bar itself. width: auto because the base gives
     .cluster flex: 1, which would otherwise stretch it across the whole bar once it is absolute
     and leave the centring meaningless. */
  .cluster {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: auto;
    flex: none;
    justify-content: center;
    gap: ${W11_TASKBAR_PADDING}px;
  }
  /* The cluster no longer holds a place in the flow, so the clock has to claim the trailing end
     for itself rather than being pushed there by its sibling. */
  .clock {
    margin-left: auto;
    padding: 0 12px;
    font-size: 12px;
    opacity: 1;
    /* Above the centred cluster, so a very wide cluster slides under the clock rather than over
       it. Neither should ever be that wide, but the stacking order should not be an accident. */
    position: relative;
    z-index: 1;
  }
  /* A rule between the fixed buttons and the open windows, which Windows does not draw: there the
     two lists are one list, so there is nothing to separate. Here they are separate, and the marker
     below already says which is which — this is the second cue rather than the only one, and it is
     here because two groups of identical square icons read as one long row without it.

     Quieter than the macOS dock's, deliberately. That dock leans on its separator, having nothing
     else; this bar has the running marker doing the work, so the rule only has to group. */
  .divider {
    display: block;
    height: ${W11_TASKBAR_DIVIDER_HEIGHT}px;
    margin: 0 ${W11_TASKBAR_PADDING * 2}px;
    opacity: 0.35;
  }
  .running {
    flex: none;
    gap: ${W11_TASKBAR_PADDING}px;
    margin-left: 0;
    /* The base clips .running so a long task list cannot push the clock off the bar. Left
       standing, which is why the active marker below has to be drawn inside the button's own box
       rather than under it. */
  }
  /* Square icon buttons, the size Windows 11 draws them, with its small 4px corner rounding. */
  .start,
  .task {
    box-sizing: border-box;
    width: ${W11_TASK_SIZE}px;
    height: ${W11_TASK_SIZE}px;
    align-self: center;
    flex: none;
    justify-content: center;
    padding: 0;
    border-radius: 4px;
    max-width: none;
    transition: background-color 90ms ease;
  }
  /* '.task .task-icon' and not '.task umb-icon': the notice badge is an 'umb-icon' in this button
     now, and 22px is the task tile's size, not the badge's. */
  .start umb-icon,
  .task .task-icon {
    font-size: 22px;
    margin-left: 0;
  }
  /* Sanctioned exception, as on the macOS dock: Windows 11 shows icons without labels by default.
     The button keeps its title attribute, so the app name remains both the tooltip and the
     accessible name — display: none rather than a removal is what keeps that true. */
  .task-label {
    display: none;
  }
  /* Two lists of identical icons sit on this bar — the fixed buttons and the open windows — and
     this theme hides labels, so nothing tells them apart on their own. The macOS dock answers that
     with a rule between them; Windows answers it by marking the windows, and this is that answer.

     **Every window button carries a bar, and no fixed button does.** A stub for "there is a window
     here", the longer accent below for "and it is the one you are in". So the mark means *window*,
     which is what makes it the separator: a bare icon launches, a marked icon is something already
     open.

     One thing this deliberately does **not** copy from Windows. There the bar goes on the *pinned*
     button, because there the pinned button is the window button — one per app — and the mark
     explains the click, which returns you to the window. Here the two are separate buttons, a
     second click on a fixed button opens a second window, and a mark on it would describe a click
     it does not cause. On the button that really is the window it is simply true.

     '.task.window' and not '.running .task': scoping to the window list is what silently strands
     the fixed row on the base stylesheet's geometry, and 'theme/taskbar-features.test.ts' fails a
     sheet that does it. The modifier is on the button, so it stays true wherever it is drawn. */
  .task.window::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: ${W11_TASK_MARKER_HEIGHT}px;
    width: ${W11_TASK_MARKER_WIDTH_INACTIVE}px;
    height: ${W11_TASK_MARKER_HEIGHT}px;
    margin-left: -${W11_TASK_MARKER_WIDTH_INACTIVE / 2}px;
    border-radius: ${W11_TASK_MARKER_HEIGHT / 2}px;
    /* The bar's own ink, dimmed: grey against the accent below, and it stays legible on the light
       acrylic and the dark one without a second token to keep in step with the palette. */
    background: currentColor;
    opacity: 0.5;
  }
  /* Both markers are drawn inside the button's own box, because the base clips '.running' and
     anything below the box would be cut off — the same constraint the macOS dot works around. The
     position is on '.task' rather than on either marker rule, so a window button has a containing
     block whether or not it is the focused one. */
  .task.window,
  .task.active {
    box-shadow: none;
    position: relative;
  }
  /* The focused window, in the accent and at twice the length. Later than the rule above and at
     equal specificity, so it replaces the stub rather than drawing over it. */
  .task.active::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: ${W11_TASK_MARKER_HEIGHT}px;
    width: ${W11_TASK_MARKER_WIDTH}px;
    height: ${W11_TASK_MARKER_HEIGHT}px;
    margin-left: -${W11_TASK_MARKER_WIDTH / 2}px;
    border-radius: ${W11_TASK_MARKER_HEIGHT / 2}px;
    background: var(--umbradesktop-task-active-marker, #0078d4);
    opacity: 1;
  }
  /* An overlay on the tile, not the inline glyph after the label that the base draws — this
     taskbar hides the label (see '.task-label' above), so there is nothing for an inline glyph to
     follow. 'position: absolute' is therefore required of this theme rather than optional, and
     'theme/notice.test.ts' asserts it of any theme that hides the label.

     Top-trailing, and drawn exactly as the macOS dock's is: a filled disc in the severity colour
     with the glyph punched out of it in the taskbar's own ground. It sat on the bottom-trailing
     corner first, on the reasoning that the top of a task button is where the window preview flyout
     points from — but a badge down there reads as a second status marker competing with the accent
     underline two pixels away, rather than as a badge on the icon. See the macOS sheet's note for
     why the disc is a fixed square box and why the glyph is punched out rather than plated. */
  .notice-badge {
    position: absolute;
    top: 0;
    bottom: auto;
    right: 0;
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    font-size: 9px;
    border-radius: 50%;
    background: var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
    color: var(--umbradesktop-taskbar-background-opaque, #f3f3f3);
  }
  /* Both halves restated, not just the background: the base's own severity rule carries an
     attribute selector, so a bare '.notice-badge' here would lose to it and paint the error glyph
     in the same danger colour as the disc it sits on. */
  .notice-badge[data-severity='error'] {
    background: var(--umbradesktop-notice-error-color, var(--uui-color-danger));
    color: var(--umbradesktop-taskbar-background-opaque, #f3f3f3);
  }
`;
