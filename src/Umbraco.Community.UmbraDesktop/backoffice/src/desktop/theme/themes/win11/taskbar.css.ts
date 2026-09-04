import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { W11_FONT } from './palette.js';
import {
  W11_TASK_MARKER_HEIGHT,
  W11_TASK_MARKER_WIDTH,
  W11_TASK_SIZE,
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
  .start umb-icon,
  .task umb-icon {
    font-size: 22px;
    margin-left: 0;
  }
  /* Sanctioned exception, as on the macOS dock: Windows 11 shows icons without labels by default.
     The button keeps its title attribute, so the app name remains both the tooltip and the
     accessible name — display: none rather than a removal is what keeps that true. */
  .task-label {
    display: none;
  }
  /* The focused window is marked by a short accent bar under its icon, not by the base rule's
     full-width inset underline. Drawn inside the button's own box, because the base clips
     .running and a marker below the box would be cut off — the same constraint the macOS dot
     works around. */
  .task.active {
    box-shadow: none;
    position: relative;
  }
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
  }
`;
