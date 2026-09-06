import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  U4_EDGE,
  U4_FONT,
  U4_HILIGHT,
  U4_TEXT,
  U4_TEXT_SOFT,
} from './palette.js';
import { U4_CONTROL_GAP, U4_TITLEBAR_HEIGHT } from './metrics.js';

/**
 * The window frame as Umbraco 4's content pane: a raised grey header over a hairline, a bold
 * left-aligned title, and flat toolbar glyphs that rise into buttons under the pointer.
 *
 * Almost all of the colour is in the palette. What is left here is the three things a token
 * cannot express — the hover edge, the inactive treatment, and reload's separating gap — plus
 * undoing two base rules written for a different typeface.
 *
 * The header deliberately does **not** look like the macOS theme's, which is the nearest
 * neighbour in the picker and the pairing most at risk of collapsing together: warm grey rather
 * than cool, a 3px radius rather than 10, a left-aligned bold title rather than a centred one,
 * and controls at the trailing end rather than traffic lights at the leading one.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(U4_FONT)};
  }
  /* box-sizing so the header's own hairline comes out of the height the token declares rather
     than being added to it. Without this the caption paints a pixel taller than
     metrics.titlebarHeight claims, and a window dragged against the bottom edge keeps a pixel
     less of its only grab handle than the clamp believes — see metrics.test.ts. */
  .titlebar {
    box-sizing: border-box;
    min-height: ${U4_TITLEBAR_HEIGHT}px;
    padding-left: 7px;
  }
  .title {
    font-size: 11px;
    font-weight: 700;
    /* The 1px of white under the text that every raised 2009 surface carried. */
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.75);
  }
  .title umb-icon {
    font-size: 15px;
  }
  /* The base nudges the title down a pixel because Lato sits high in its line box. Verdana does
     not, and inheriting the nudge just knocks the title off centre. */
  .title-text {
    transform: none;
  }
  /* Flat until hovered, which is how v4 drew a toolbar button. The fill arrives from
     '--umbradesktop-control-hover-background'; the edge that turns that fill into a button has no
     token, and is drawn as an inset shadow rather than a border so hovering cannot change the
     control's width — that width is a term in trailingControlsWidth, and the drag clamp reads it. */
  .ctrl {
    transition: none;
  }
  .ctrl:hover {
    box-shadow:
      inset 0 0 0 1px ${unsafeCSS(U4_EDGE)},
      inset 0 1px 0 ${unsafeCSS(U4_HILIGHT)};
  }
  /* Close keeps the red the palette gives it, and takes a matching dark edge rather than the grey
     one — the only place this theme raises its voice. */
  .ctrl.close:hover {
    box-shadow: inset 0 0 0 1px #92291d;
  }
  /* Umbraco 4 had no reload control, because nothing in a 2009 web backoffice did. Setting it
     apart from the minimize/maximize/close trio stops it reading as a fourth window button, the
     way v4's own toolbars separated groups. This gap is also a term in U4_TRAILING_CONTROLS_WIDTH,
     so it is geometry rather than decoration. */
  .ctrl-reload {
    margin-right: ${U4_CONTROL_GAP}px;
  }
  /* An inactive window is recoloured, not faded. The palette pins the base's inactive opacity to
     1 so that this can state both treatments instead: a flatter, cooler header and a lighter,
     unbolded title, while the buttons stay fully opaque and as clickable as an active window's.
     A half-faded button reads as disabled, which is the one way this could be worse than nothing. */
  .frame:not(.active) .titlebar {
    background: linear-gradient(180deg, #f2f0eb 0%, #e8e5df 100%);
  }
  .frame:not(.active) .title {
    color: ${unsafeCSS(U4_TEXT_SOFT)};
    font-weight: 400;
    text-shadow: none;
  }
  .frame.active .title {
    color: ${unsafeCSS(U4_TEXT)};
  }
`;
