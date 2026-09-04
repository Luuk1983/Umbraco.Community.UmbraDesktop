import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';

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
       than spilling past the bar. The dock has no labels (icons only, .task-label hidden below)
       so it needs far less width per app and truncation is far less likely — and this container
       clipping would otherwise cut off the dot drawn by .task.active::after below, which sits
       deliberately outside .task's own box (bottom:-5px). Visible trades that horizontal safety
       net for a marker that actually renders. */
    overflow: visible;
  }
  /* Dock tiles: square icons, no labels, and the running indicator as a dot beneath rather than
     an underline across. */
  .start,
  .task {
    height: 34px;
    min-width: 34px;
    padding: 0 6px;
    border-radius: 8px;
  }
  .start umb-icon,
  .task umb-icon {
    font-size: 24px;
    margin-left: 0;
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
    bottom: -5px;
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
     offset from the bar. */
  .launcher {
    left: 0;
    right: 0;
    bottom: var(--umbradesktop-taskbar-reserve, 62px);
    /* The launcher's containing block here is umbradesktop-taskbar's own host box, which is
       sized to the dock's content (~54px), not the desktop — bottom alone would size the panel
       to a sliver above the dock instead of filling the screen. 100vh sidesteps that: it is
       always relative to the viewport, never to an ancestor's box, and the desktop already fills
       the viewport while it is mounted (the outer backoffice header is hidden for as long as it
       is), so this reliably spans from the very top down to just above the dock. */
    height: calc(100vh - var(--umbradesktop-taskbar-reserve, 62px));
  }
`;
