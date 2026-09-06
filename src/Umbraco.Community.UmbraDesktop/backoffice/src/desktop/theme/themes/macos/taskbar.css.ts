import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';
import { MACOS_TASKBAR_RESERVE } from './metrics.js';

/**
 * A centred floating dock. The `.cluster` wrapper (start + running windows) is what makes centring
 * possible; the clock keeps its own edge.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(MACOS_FONT)};
  }
  .bar {
    width: max-content;
    max-width: calc(100% - 24px);
    padding: 0 10px;
    gap: 6px;
  }
  .cluster {
    flex: 0 1 auto;
    align-items: center;
    gap: 6px;
  }
  .running {
    flex: 0 1 auto;
    gap: 6px;
    align-items: center;
    /* The base rule clips horizontal overflow so a long, labelled taskbar list truncates rather
       than spilling past the bar — kept as-is: with enough dock icons open, truncating the list
       cleanly is a better failure than letting tiles spill past the dock's rounded pill. The
       running-window dot below is drawn inside .task's own box precisely so it never needs this
       clipping relaxed. */
  }
  /* Dock tiles: square icons, no labels, and the running indicator as a dot beneath rather than
     an underline across. */
  .start,
  .task {
    height: 38px;
    min-width: 38px;
    padding: 0 6px;
    border-radius: 8px;
  }
  .start umb-icon,
  .task umb-icon {
    font-size: 24px;
    margin-left: 0;
  }
  /* Nudged up (paint-only — this doesn't move the centred layout box) to open up the space the
     running-window dot sits in. At 2px on a 34px tile the dot ended up a single pixel under the
     icon, reading as part of it rather than as a separate indicator; a taller tile and a deeper
     nudge put roughly 4px of clear space between them, which is about what a real dock shows. */
  .task umb-icon {
    transform: translateY(-4px);
  }
  /* Sanctioned exception: the dock shows icons only. The button keeps its title attribute, so
     the app name is still available as a tooltip and as the accessible name. */
  .task-label {
    display: none;
  }
  .task.active {
    box-shadow: none;
    position: relative;
  }
  .task.active::after {
    content: '';
    position: absolute;
    left: 50%;
    /* Inside the tile's own 38px box (3px above its bottom edge), not below it — the base rule's
       overflow: hidden on .running is left standing (see above), and a dot drawn outside .task's
       box would be clipped by it. */
    bottom: 3px;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: 50%;
    background: var(--umbradesktop-task-active-marker, #3c3c3e);
  }
  .clock {
    padding: 0 4px 0 10px;
    border-left: 1px solid rgba(0, 0, 0, 0.16);
    font-size: 11px;
    font-weight: 500;
    opacity: 1;
  }
  /* The launcher fills the surface above the dock, so it is positioned by the sheet rather than
     offset from the bar. This rule fully owns the panel's geometry (left/right/width/bottom/
     height) — launcher.css.ts's :host sets no width or position of its own for exactly that
     reason. */
  .launcher {
    left: 0;
    right: 0;
    /* The base rule's :host already sets an explicit width (min(960px, 92vw)) that this sheet
       does not otherwise touch. Left + width + right together over-constrain an absolutely
       positioned box: the explicit width wins and right is silently dropped, so without this the
       panel renders flush left at 960px instead of edge to edge. width: auto lets left/right do
       the stretching the base rule's width would otherwise block. */
    width: auto;
    bottom: var(--umbradesktop-taskbar-reserve, ${MACOS_TASKBAR_RESERVE}px);
    /* The launcher's containing block here is umbradesktop-taskbar's own host box, which is
       sized to the dock's content (~54px), not the desktop — bottom alone would size the panel
       to a sliver above the dock instead of filling the screen. 100vh sidesteps that: it is
       always relative to the viewport, never to an ancestor's box, and the desktop already fills
       the viewport while it is mounted (the outer backoffice header is hidden for as long as it
       is), so this reliably spans from the very top down to just above the dock. */
    height: calc(100vh - var(--umbradesktop-taskbar-reserve, ${MACOS_TASKBAR_RESERVE}px));
  }
`;
