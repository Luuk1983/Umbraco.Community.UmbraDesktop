import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  WIN98_BEVEL_PRESSED,
  WIN98_BEVEL_RAISED,
  WIN98_BEVEL_SUNKEN,
  WIN98_FACE,
  WIN98_FONT,
  WIN98_HILIGHT,
} from './palette.js';
import { WIN98_TASKBAR_PADDING } from './metrics.js';

/**
 * The Win98 taskbar: a flush grey bar with a raised Start button, raised task buttons, and the
 * clock in a sunken tray at the trailing end. Everything about its colour, height and opacity is
 * in the palette; what is left here is the bevel work, which has no tokens, and the tightening
 * that a 30px bar needs after a 50px one.
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
  .task umb-icon {
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
  /* The clock sits in a sunken tray, which needs the box to be a box: the base rule leaves it an
     inline flex item sized by its own text, so it has to be stretched and re-padded before a
     bevel around it means anything. */
  .clock {
    align-self: stretch;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    margin-left: ${WIN98_TASKBAR_PADDING}px;
    padding: 0 6px;
    box-shadow: ${unsafeCSS(WIN98_BEVEL_SUNKEN)};
    font-size: 11px;
    /* The base dims the clock to 0.85 against a dark bar. Black on grey needs no dimming, and
       dimmed black on grey just reads as a rendering artefact. */
    opacity: 1;
  }
`;
