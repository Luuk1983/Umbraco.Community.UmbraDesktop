import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  WIN98_BEVEL_PRESSED,
  WIN98_BEVEL_RAISED,
  WIN98_BEVEL_SUNKEN,
  WIN98_FACE,
  WIN98_FONT,
  WIN98_HILIGHT,
} from './palette.js';
import {
  WIN98_BEVEL_DEPTH,
  WIN98_CLOCK_PADDING,
  WIN98_TASKBAR_PADDING,
  WIN98_TRAY_PADDING,
} from './metrics.js';

/**
 * The Win98 taskbar: a flush grey bar with a raised Start button, raised task buttons, and the
 * tray, with the clock at its end, sunken at the trailing end. Everything about its colour, height
 * and opacity is in the palette; what is left here is the bevel work, which has no tokens, and the
 * tightening that a 30px bar needs after a 50px one.
 *
 * Nothing here positions the launcher. The panel is mounted inside this component's shadow root,
 * so the base `.launcher` rule owns its geometry — and for this theme that rule needs nothing but
 * the two palette tokens it already reads (`--umbradesktop-launcher-left`, which opens the menu
 * hard against the screen's leading edge, and `--umbradesktop-launcher-bottom`, which defaults to
 * the bar's own reserve and so sits the menu directly on top of it).
 */
export default css`
  :host {
    font-family: ${unsafeCSS(WIN98_FONT)};
  }
  /* box-sizing so the padding comes out of the bar's declared height rather than being added to
     it — the height is also metrics.taskbarReserve, and a bar taller than the space reserved
     for it would let windows slide underneath. The buttons inside keep the base rule's
     height: 100% and simply end up shorter, which is what leaves the bevel room above and
     below them. */
  .bar {
    box-sizing: border-box;
    padding: ${WIN98_TASKBAR_PADDING}px;
    gap: ${WIN98_TASKBAR_PADDING}px;
  }
  /* The Start button, which in Win98 is the widest thing on the bar and carries a word. The
     Umbraco mark on its own reads as another task button that happens to be first, so the word is
     what makes it a Start button — bold, beside the mark, with the button sized to it. */
  .start {
    padding: 0 8px 0 4px;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    background: ${unsafeCSS(WIN98_FACE)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
  }
  .start umb-icon {
    font-size: 16px;
  }
  /* The label. A theme cannot add DOM, so it arrives as generated content — and it cannot invent
     the word either: a string written in here is invisible to the localization files and would
     stay English in every language. The button already carries a title, which is its accessible
     name, so rendering that gives the visible label and the accessible name the same words, and
     means the label follows the title wherever it comes from. Today the taskbar hardcodes an
     English "Open apps"; localizing that one attribute would translate this label with no further
     change here. Guarded by taskbar.test.ts, which compares the rendered label against the live
     title rather than against an expected string. */
  .start::after {
    content: attr(title);
    /* Capped, because a translation is free to be long and the running task list beside it is
       what should give way rather than the bar. A block box so text-overflow applies. */
    display: block;
    max-width: 110px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* Held down, and held down for as long as the menu is open — which is exactly how the real
     Start button behaves. */
  .start:active,
  .start.active {
    box-shadow: ${unsafeCSS(WIN98_BEVEL_PRESSED)};
  }
  .start.active umb-icon {
    transform: translate(1px, 1px);
  }
  .start umb-icon {
    font-size: 18px;
  }
  .running {
    gap: ${WIN98_TASKBAR_PADDING}px;
    margin-left: ${WIN98_TASKBAR_PADDING}px;
  }
  .task {
    padding: 0 4px;
    gap: 4px;
    font-size: 11px;
    /* background-color, not the shorthand: the active state below layers a dither on top as a
       background-image, and a shorthand here would be a second place that resets it. */
    background-color: ${unsafeCSS(WIN98_FACE)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
    /* The base rule cross-fades hover and the active marker. Win98 has no transitions, and a
       bevel that fades between raised and pressed looks like a rendering fault. */
    transition: none;
  }
  /* '.task .task-icon' and not '.task umb-icon': the notice badge is an 'umb-icon' in this button
     now, and 14px is the app icon's size, not the badge's. The '.task.active umb-icon' rule below
     deliberately keeps matching both, because the whole button's contents shift when it is held
     down. */
  .task .task-icon {
    font-size: 14px;
    /* The base pulls the icon left to balance the transparent padding inside an Umbraco glyph
       against a wider label gap. This theme's gap is tight enough that the pull just clips it
       against the button's bevel. */
    margin-left: 0;
  }
  .task-label {
    transform: none;
  }
  /* The focused window's button is held down and filled with the 50% highlight dither Win98 drew
     it with — a genuine 1px checkerboard, hence the conic gradient over a 2px tile: it is the one
     construction that fills alternating pixels in both axes from a single background-image.
     Replaces (rather than adds to) the base rule's coral underline, which is the Umbraco theme's
     way of marking the same thing. */
  .task.active {
    box-shadow: ${unsafeCSS(WIN98_BEVEL_PRESSED)};
    background-image: conic-gradient(
      ${unsafeCSS(WIN98_HILIGHT)} 25%,
      ${unsafeCSS(WIN98_FACE)} 25% 50%,
      ${unsafeCSS(WIN98_HILIGHT)} 50% 75%,
      ${unsafeCSS(WIN98_FACE)} 75%
    );
    background-size: 2px 2px;
  }
  .task.active umb-icon,
  .task.active .task-label {
    transform: translate(1px, 1px);
  }
  /* The sunken well is the tray, not the clock (design D16). In Windows 98 the notification icons
     sat in that well beside the time, so a well drawn round the clock alone would leave every tray
     item outside it.

     The bevel is an inset shadow, painted inside the tray's own edge and under its children. So
     nothing a child paints may reach that edge: the clock's hover and pressed fill, or a tray
     item's hover, would cover the bevel. The tray is padded by the bevel's depth on the top, the
     bottom and the trailing side, and by more on the leading side so an icon clears the bevel by as
     much again. The clock gives up exactly the horizontal part of that from its old padding, so a
     tray holding only the clock is the box the clock was when it carried the bevel itself; the
     tray is stretched to the bar, so the vertical part comes out of the clock's height, not the
     well's. */
  .tray {
    margin-left: ${WIN98_TASKBAR_PADDING}px;
    padding: ${WIN98_BEVEL_DEPTH}px ${WIN98_BEVEL_DEPTH}px ${WIN98_BEVEL_DEPTH}px ${WIN98_TRAY_PADDING}px;
    box-shadow: ${unsafeCSS(WIN98_BEVEL_SUNKEN)};
  }
  /* The base already stretches the clock to fill the well, inside the bevel. Its padding is what is
     left of its old padding once the tray has taken its share on each side, so the two still add
     up to the old well. */
  .clock {
    padding: 0 ${WIN98_CLOCK_PADDING - WIN98_BEVEL_DEPTH}px 0 ${WIN98_CLOCK_PADDING - WIN98_TRAY_PADDING}px;
    font-size: 11px;
    /* The base dims the clock to 0.85 against a dark bar. Black on grey needs no dimming, and
       dimmed black on grey just reads as a rendering artefact. */
    opacity: 1;
  }
  /* This theme shows the task label, so the base rule's inline glyph after the name is right here
     and the 11px MS Sans Serif button hands it its own size through the base's '1em'. What is left
     is the pull the base gives the app icon, which this theme already undoes above for the same
     reason: at this button's tight padding a negative margin clips the glyph against the bevel.
     The bevelled corner tile this replaced was an overlay drawn over the button's own bevel, which
     only existed because the badge used to be an overlay in every theme. So there is no
     '.notice-badge' rule here at all, deliberately. */
`;
