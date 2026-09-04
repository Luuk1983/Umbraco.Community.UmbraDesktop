import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';

/**
 * The macOS window surface: traffic lights leading the titlebar, a centred title, and the reload
 * button travelling with the lights as one contiguous non-draggable cluster (which is what
 * `leadingControlsWidth` in the theme's metrics accounts for).
 */
export default css`
  .titlebar {
    /* The base rule never positions '.titlebar' itself, relying on '.frame' (its
       position:absolute ancestor) as the containing block for '.title' below. That happened to
       be harmless while '.title' was a normal in-flow flex item, but '.title' here is repositioned
       to span the *bar*, not the frame — so the bar needs to be the containing block itself. */
    position: relative;
    font-family: ${unsafeCSS(MACOS_FONT)};
    padding: 0 10px;
  }
  /* Controls lead the bar; the title then centres over the bar's full width rather than the
     space left beside them. */
  .controls {
    order: -1;
    align-items: center;
    align-self: center;
    gap: 8px;
    margin-right: 8px;
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
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 0.5px solid rgba(0, 0, 0, 0.16);
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
    order: 4;
    width: 22px;
    height: 22px;
    margin-left: 10px;
    border-radius: 50%;
  }
  .ctrl-reload:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  .ctrl-reload .glyph.ring {
    width: 13px;
    height: 13px;
  }
`;
