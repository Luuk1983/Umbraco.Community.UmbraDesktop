import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';
import { MACOS_CONTROL_GAP, MACOS_LIGHT_SIZE, MACOS_RELOAD_MARGIN, MACOS_RELOAD_SIZE, MACOS_TITLEBAR_HEIGHT, MACOS_TITLEBAR_PADDING } from './metrics.js';

/**
 * The macOS window surface: traffic lights leading the titlebar, a centred title, and the reload
 * button travelling with the lights as one contiguous non-draggable cluster (which is what
 * `leadingControlsWidth` in the theme's metrics accounts for). The geometry declarations below
 * consume the same constants that metric is derived from — see `metrics.ts` — so the two cannot
 * disagree.
 */
export default css`
  .titlebar {
    /* The base rule never positions '.titlebar' itself, relying on '.frame' (its
       position:absolute ancestor) as the containing block for '.title' below. That happened to
       be harmless while '.title' was a normal in-flow flex item, but '.title' here is repositioned
       to span the *bar*, not the frame — so the bar needs to be the containing block itself. */
    position: relative;
    font-family: ${unsafeCSS(MACOS_FONT)};
    padding: 0 ${MACOS_TITLEBAR_PADDING}px;
  }
  /* Controls lead the bar; the title then centres over the bar's full width rather than the
     space left beside them. */
  .controls {
    order: -1;
    align-items: center;
    align-self: center;
    gap: ${MACOS_CONTROL_GAP}px;
    margin-right: ${MACOS_CONTROL_GAP}px;
  }
  /* Native traffic-light order is close, minimize, maximize (zoom) — but the DOM order here is
     reload, minimize, maximize, close, because reload is the outermost/newest control. 'order'
     re-sequences the visual result without touching the DOM the pointer/keyboard handlers and the
     '.ctrl.close:hover' selector both depend on. */
  .ctrl-close {
    order: 1;
  }
  .ctrl-minimize {
    order: 2;
  }
  .ctrl-maximize {
    order: 3;
  }
  .title {
    /* Absolutely positioned and stretched edge-to-edge of '.titlebar' (not just centred in the
       leftover space beside the controls), then centred internally — this is what makes the title
       sit in the physical middle of the bar the way macOS does. top/bottom (rather than
       leaning on the flex item's old static position) is what keeps it vertically centred
       reliably now that it has been pulled out of the controls' flex flow. */
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    font-size: 11px;
    font-weight: 600;
  }
  .title umb-icon {
    display: none;
  }
  .title-text {
    transform: none;
  }
  /* The three lights: colour at rest, glyph only once the pointer is over the bar. */
  .ctrl-close,
  .ctrl-minimize,
  .ctrl-maximize {
    position: relative;
    width: ${MACOS_LIGHT_SIZE}px;
    height: ${MACOS_LIGHT_SIZE}px;
    border-radius: 50%;
    border: 0.5px solid rgba(0, 0, 0, 0.16);
  }
  /* A 12px circle is the right thing to *draw* and the wrong thing to *hit*: at 12x12 these were
     a quarter of the bar's height and genuinely hard to land on with a mouse. This transparent
     overlay grows the pointer target to the full height of the titlebar and half the flex gap to
     either side — adjacent targets meet without overlapping — while leaving the layout box, and
     therefore MACOS_LEADING_CONTROLS_WIDTH and the drag clamp derived from it, untouched.
     Everything it covers is already non-draggable chrome inside that reserved strip. */
  .ctrl-close::after,
  .ctrl-minimize::after,
  .ctrl-maximize::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: ${MACOS_LIGHT_SIZE + MACOS_CONTROL_GAP}px;
    height: ${MACOS_TITLEBAR_HEIGHT}px;
  }
  .ctrl-close {
    background: #ff5f57;
  }
  .ctrl-minimize {
    background: #febc2e;
  }
  .ctrl-maximize {
    background: #28c840;
  }
  .frame:not(.active) .ctrl-close,
  .frame:not(.active) .ctrl-minimize,
  .frame:not(.active) .ctrl-maximize {
    background: #d6d6d8;
  }
  .ctrl-close .glyph,
  .ctrl-minimize .glyph,
  .ctrl-maximize .glyph {
    width: 8px;
    height: 8px;
    stroke-width: 1.6;
    opacity: 0;
    transition: opacity 80ms;
  }
  .titlebar:hover .ctrl-close .glyph,
  .titlebar:hover .ctrl-minimize .glyph,
  .titlebar:hover .ctrl-maximize .glyph {
    opacity: 1;
  }
  /* Reload is not a native macOS control, so it stays a plain glyph button — set apart from the
     cluster by a gap rather than pretending to be a fourth light, and ordered last so it trails
     the lights rather than leading them (DOM order otherwise puts it first). */
  .ctrl-reload {
    position: relative;
    order: 4;
    width: ${MACOS_RELOAD_SIZE}px;
    height: ${MACOS_RELOAD_SIZE}px;
    margin-left: ${MACOS_RELOAD_MARGIN}px;
    border-radius: 50%;
  }
  /* Same problem as the traffic lights, same fix — but grown leftwards, into reload's own margin,
     rather than symmetrically. That margin is dead space inside the reserved leading strip, so
     spending it costs nothing; widening to the right would eat into the draggable part of the bar
     and quietly disagree with MACOS_LEADING_CONTROLS_WIDTH about where dragging starts. */
  .ctrl-reload::after {
    content: '';
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: -${MACOS_RELOAD_MARGIN}px;
    right: 0;
    height: ${MACOS_TITLEBAR_HEIGHT}px;
  }
  .ctrl-reload:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  .ctrl-reload .glyph.ring {
    width: 13px;
    height: 13px;
  }
`;
