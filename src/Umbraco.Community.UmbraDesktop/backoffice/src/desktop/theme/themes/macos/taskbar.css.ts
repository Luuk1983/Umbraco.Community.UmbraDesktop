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
     an underline across.

     42 and not the 38 this was: the icon stays 24px and the extra 4px is clearance around it. A
     real dock's icons fill more of their slot than this, so the tile is knowingly roomier than
     macOS would draw it — the reason is the unsaved dot, which rides the tile's trailing corner and
     had nowhere to sit that was not on top of the icon. Four pixels moves the icon's corner in far
     enough that the dot reads as a marker beside it rather than as something stuck on it. */
  .start,
  .task {
    height: 42px;
    min-width: 42px;
    padding: 0 6px;
    border-radius: 8px;
  }
  /* '.task .task-icon' and not '.task umb-icon': the notice badge is an 'umb-icon' in this button
     now, and 24px is the dock tile's size, not the badge's. */
  .start umb-icon,
  .task .task-icon {
    font-size: 24px;
    margin-left: 0;
  }
  /* Nudged up (paint-only — this doesn't move the centred layout box) to open up the space the
     running-window dot sits in. At 2px on a 34px tile the dot ended up a single pixel under the
     icon, reading as part of it rather than as a separate indicator; a taller tile and a deeper
     nudge put roughly 4px of clear space between them, which is about what a real dock shows.
     The tile growing to 42px keeps that: the icon is centred, so it moves down 2px with the box
     while the dot stays 3px off the bottom edge, leaving about 4px still. */
  .task .task-icon {
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
  /* The dock's own badge idiom: an overlay riding the tile's top-trailing corner, not the inline
     glyph after the label that the base draws — this dock hides the label (see '.task-label'
     above), so there is nothing for an inline glyph to follow. 'position: absolute' is therefore
     required of this theme rather than optional, and 'theme/notice.test.ts' asserts it of any
     theme that hides the label.

     A filled disc in the severity colour with the glyph punched out of it in the dock's own ground,
     which is what every badge on this platform is. It started as the inverse — the severity glyph
     on a plate of the dock ground — and that failed twice over in light mode: an 'umb-icon' paints
     its glyph edge to edge of a square box, so a 'border-radius' on the box alone rounds the plate
     *under* corners the triangle still occupies, leaving it poking out of its own disc; and a dark
     amber glyph on a near-white plate had barely any figure to it.

     The disc is a fixed square box rather than type plus padding, and it rides the tile's corner
     from *inside* rather than hanging off it. Both of those are fixes for what the padded version
     did: 'uui-icon' sizes itself in ems (1.125em), so a padded disc came out 17.25px across and
     centred on a half-pixel, which is the whole of what "the icon in the bubble is not aligned"
     was; and the base rule clips '.running', so a badge at 'right: -3px' was cut in half on the
     last tile in the dock. 16px around a 9px glyph (10.1px of 'uui-icon', half-diagonal 7.2px)
     leaves the curve clear on the diagonal, and 'top: 0; right: 0' is the tile's own padding box,
     which the icon at 24px leaves free. */
  .notice-badge {
    position: absolute;
    top: 0;
    right: 0;
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    font-size: 9px;
    border-radius: 50%;
    background: var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
    color: var(--umbradesktop-taskbar-background-opaque, #e9e9ef);
  }
  /* Both halves restated, not just the background: the base's own severity rule carries an
     attribute selector, so a bare '.notice-badge' here would lose to it and paint the error glyph
     in the same danger colour as the disc it sits on. */
  .notice-badge[data-severity='error'] {
    background: var(--umbradesktop-notice-error-color, var(--uui-color-danger));
    color: var(--umbradesktop-taskbar-background-opaque, #e9e9ef);
  }
`;
