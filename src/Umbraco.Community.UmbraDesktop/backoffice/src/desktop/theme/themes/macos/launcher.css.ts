import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';

/**
 * The launcher restyled as a fullscreen, blurred Launchpad-style surface. Its content keeps its
 * structure — search, group cards, Favourites, tiles, pin badges — only the panel's own surface
 * changes; sizing/position is owned by `taskbar.css.ts`'s `.launcher` rule (the panel is mounted
 * inside `<umbradesktop-taskbar>`'s shadow tree), not here.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(MACOS_FONT)};
    /* No width/height here: the base rule's :host { width; height } would only compete with
       (and, on height, potentially be over-constrained by) the explicit left/right/height that
       taskbar.css.ts's .launcher rule sets from outside — that rule already fully owns this
       panel's geometry. Only the height cap needs cancelling: the base's calc(100vh - 66px)
       ceiling would otherwise clip a few pixels off the fullscreen height computed there. */
    max-height: none;
  }
  .search {
    align-self: center;
    width: min(420px, 80%);
    margin: 28px 0 8px;
    border-radius: 999px;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
  }
  .body {
    align-items: center;
    padding: 12px 40px 32px;
  }
  .cards {
    width: min(1100px, 100%);
    gap: 22px;
  }
  /* The base rule paints group headings in --uui-color-text-alt at 0.6 opacity, which is a muted
     dark grey — invisible on this panel. Near-full white with a shadow behind it, so the headings
     survive both the darkest and the palest wallpaper the panel can end up over. */
  .ch {
    color: rgba(255, 255, 255, 0.92);
    opacity: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }
  .launch umb-icon {
    font-size: 44px;
  }
  .tlb {
    font-size: 12px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  .tile:hover .launch {
    border-radius: 12px;
  }
  .footer {
    align-self: stretch;
    background: rgba(0, 0, 0, 0.22);
    border-top: 1px solid rgba(255, 255, 255, 0.14);
  }
`;
