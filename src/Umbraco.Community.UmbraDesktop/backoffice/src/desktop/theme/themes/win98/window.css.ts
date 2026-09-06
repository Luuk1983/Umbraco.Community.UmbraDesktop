import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  WIN98_BEVEL_PRESSED,
  WIN98_BEVEL_RAISED,
  WIN98_BEVEL_SUNKEN,
  WIN98_FACE,
  WIN98_FONT,
  WIN98_INACTIVE_CAPTION,
  WIN98_INACTIVE_CAPTION_TEXT,
} from './palette.js';
import {
  WIN98_BEVEL_DEPTH,
  WIN98_CONTROL_GAP,
  WIN98_CONTROL_HEIGHT,
  WIN98_FRAME_BORDER,
} from './metrics.js';

/**
 * How far the shared minimize glyph drops, in px, to rest on the same baseline as the maximize
 * box. `window.element`'s inline SVG centres the minimize line at `y=6.5` of a 12-unit box while
 * the maximize rect's bottom edge sits at `y=9.5`, and this theme renders those 12 units at 12px
 * (see `.ctrl .glyph` below), so the shortfall is three units and therefore three pixels.
 *
 * Both of those numbers belong to the component's SVG rather than to this theme, which is why this
 * is written down here instead of derived from `metrics.ts` — nothing else in the theme knows them,
 * and `metrics.ts` is for geometry the window manager reads. `window.test.ts` measures the rendered
 * baselines rather than trusting this arithmetic.
 */
const WIN98_MINIMIZE_BASELINE_DROP = 3;

/**
 * The Win98 window: a raised grey frame with a sunken client area, a navy gradient caption, and
 * four square bevelled buttons at its trailing end.
 *
 * No DOM changes and no `order`. The buttons are already last in the titlebar and already in the
 * order Win98 draws them (minimize, maximize, close), with reload — which Win98 has no equivalent
 * of — leading them, set apart by a gap so it does not read as a fourth window control.
 *
 * The geometry declarations below consume the same constants `metrics.ts` derives
 * `WIN98_TRAILING_CONTROLS_WIDTH` and `WIN98_CAPTION_KEEP_VISIBLE` from, so the drag clamp and
 * what actually paints cannot disagree — and `metrics.test.ts` measures the result to prove it.
 */
export default css`
  /* The frame ring: padding to make room for the bevel, which would otherwise paint underneath
     '.titlebar' and '.bodywrap' (they fill the frame edge to edge), plus box-sizing so that room
     comes out of the window's own rect rather than growing it past the size the manager set.
     The resize handles are unaffected: they are absolutely positioned, so their containing block
     is the padding box, whose edge is the frame's outer edge — which means the ring doubles as
     the sizing border, exactly as it does in Win98. */
  .frame {
    box-sizing: border-box;
    padding: ${WIN98_FRAME_BORDER}px;
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
  }
  /* Restated because the base rule elevates the active window with a deeper drop shadow, and
     'box-shadow' is one property: leaving it standing would replace the bevel rather than add to
     it. Win98 has no drop shadows and no elevation — focus is shown by the caption colour alone,
     which is exactly what the two rules below do. */
  .frame.active {
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
  }
  .titlebar {
    /* The base rule pads the leading edge by a UUI space step, which is far too generous for a
       22px caption; Win98 sits the icon two pixels in. */
    padding: 0 0 0 ${WIN98_CONTROL_GAP}px;
    gap: ${WIN98_CONTROL_GAP}px;
    font-family: ${unsafeCSS(WIN98_FONT)};
  }
  /* An inactive Win98 window recolours its caption rather than fading it — the palette resets the
     base rule's inactive opacity to 1 so these two colours are all that changes. Both are stated
     here rather than tokenised because the chrome has no 'inactive caption' tokens: the base
     design expresses inactivity as transparency, and this theme expresses it as a palette swap. */
  .frame:not(.active) .titlebar {
    background: ${unsafeCSS(WIN98_INACTIVE_CAPTION)};
  }
  .frame:not(.active) .title {
    color: ${unsafeCSS(WIN98_INACTIVE_CAPTION_TEXT)};
  }
  .title {
    /* Pinned rather than left on the base rule's calc() of a UUI type step: at this caption
       height the title has to be the 11px MS Sans Serif was drawn at, whatever the backoffice's
       own type scale is doing. */
    font-size: 11px;
  }
  .title umb-icon {
    font-size: 14px;
  }
  .title-text {
    /* The base nudges the label down a pixel to optically centre Lato against the icon. This
       theme is not set in Lato, and the nudge only pushes the caption text off centre. */
    transform: none;
  }
  .controls {
    /* The base stretches the cluster to the caption's full height so the buttons are corner-to-
       corner targets. Win98 insets them instead, which is what leaves the bevel visible on all
       four sides of each button. */
    align-self: center;
    align-items: center;
    margin-right: ${WIN98_CONTROL_GAP}px;
  }
  .ctrl {
    height: ${WIN98_CONTROL_HEIGHT}px;
    background: ${unsafeCSS(WIN98_FACE)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
  }
  /* Reload is not a Win98 control, so it is set apart by a gap rather than allowed to read as a
     fourth window button; close is set apart from the minimize/maximize pair the way Win98 itself
     separates it. Both gaps are counted in WIN98_TRAILING_CONTROLS_WIDTH. */
  .ctrl-reload {
    margin-right: ${WIN98_CONTROL_GAP}px;
  }
  .ctrl-close {
    margin-left: ${WIN98_CONTROL_GAP}px;
  }
  /* Held down: the bevel inverts and the glyph moves with it, which is the whole of Win98's
     button feedback. Hover does nothing at all — see the palette, which pins both hover fills to
     the button face. */
  .ctrl:active {
    box-shadow: ${unsafeCSS(WIN98_BEVEL_PRESSED)};
  }
  .ctrl:active .glyph {
    transform: translate(1px, 1px);
  }
  /* Win98's control marks are single-pixel hairlines, and three things have to line up for them
     to render as one rather than as a grey smear across two.

     The glyph box is 12px in a 20x18 button, so the leftover space is even on both axes (4px and
     3px a side) and flex centring cannot land it on a half pixel. It is also exactly the straight
     glyphs' 12-unit viewBox, so one unit is one pixel and the stroke below is a true 1px line
     falling on a pixel boundary. Note the marks are much smaller than the box that carries them —
     minimize is 7 units wide, close 6 — so a 12px box still leaves the bevel plenty of room.

     None of this was visible in the Umbraco theme, whose 46px buttons and 14px glyphs put every
     rounding error below the threshold of notice. Guarded by window.test.ts. */
  .ctrl .glyph {
    width: 12px;
    height: 12px;
    stroke-width: 1;
    /* Aliased on purpose: these marks were bitmaps, and antialiasing a 1px line is what turns it
       grey. The ring below opts back out, being a curve. */
    shape-rendering: crispEdges;
  }
  .ctrl .glyph.ring {
    width: 12px;
    height: 12px;
    stroke-width: 1.4;
    shape-rendering: geometricPrecision;
  }
  /* Win98 rests the minimize bar on the same baseline as the bottom of the maximize box and the
     foot of the close cross, which is what makes the three read as one set. The shared glyph
     centres it instead — the right answer for a theme drawing three unrelated marks, the wrong one
     here — so it is dropped to the baseline. Moved by transform rather than by margin so it costs
     no layout and cannot disturb the trailing-controls width the drag clamp is derived from.

     Both rules have to exist: '.ctrl:active .glyph' above carries the pressed nudge and outranks a
     plain '.ctrl-minimize .glyph', so the pressed state restates the drop with the nudge folded
     in. It also has to come after that rule, being of equal specificity. */
  .ctrl-minimize .glyph {
    transform: translateY(${WIN98_MINIMIZE_BASELINE_DROP}px);
  }
  .ctrl-minimize:active .glyph {
    transform: translate(1px, ${WIN98_MINIMIZE_BASELINE_DROP + 1}px);
  }
  /* The client area is a sunken well, as it is in every Win98 application window. Padded by the
     bevel's own depth so the well's edge is visible around the frame's content; the grey it shows
     is the frame's background, which is why no body background is set. */
  .bodywrap {
    box-sizing: border-box;
    padding: ${WIN98_BEVEL_DEPTH}px;
    box-shadow: ${unsafeCSS(WIN98_BEVEL_SUNKEN)};
  }
`;
