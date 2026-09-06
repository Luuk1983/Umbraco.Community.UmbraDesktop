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
  /* The search field and the top row below share an explicit top offset and an explicit height,
     rather than each ending up wherever its own padding puts it. That is what actually guarantees
     the avatar, the field and the action buttons sit on one line. */
  .search {
    align-self: center;
    width: min(420px, 40%);
    height: 40px;
    margin: 26px 0 10px;
    padding: 0 18px;
    border-radius: 999px;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
  }
  .body {
    align-items: center;
    padding: 6px 40px 28px;
  }
  /* Both content blocks share one column width. The Favourites hero is rendered as a sibling of
     '.cards', not a cell inside it, so the base rule's 'grid-column: 1 / -1' does not reach it —
     it was only ever full width because '.body' stretched its children. Centring them (above)
     took that away and left Pinned shrunk to a single tile's width, stacked vertically and
     floating over the middle of the group cards. Stating the width on both is what lines their
     left and right edges up. */
  .fav,
  .cards {
    /* border-box because these two are sized differently by the browser and have to end up the
       same width: '.cards' children are grid cells, whose track width already includes their
       padding, while '.fav' is an ordinary block whose declared width is its *content* box — so a
       plain width made the Pinned hero wider than the grid by exactly its own padding. */
    box-sizing: border-box;
    /* Wide enough for the group cards to flow into five columns on a normal monitor. At 1100px
       they wrapped onto three rows and pushed the panel into a scrollbar with most of the screen
       left empty either side, which on a fullscreen launcher is the one thing it should never do. */
    width: min(1600px, 100%);
  }
  .cards {
    gap: 18px;
  }
  /* The base rule paints group headings in --uui-color-text-alt at 0.6 opacity, which is a muted
     dark grey — invisible on this panel. Near-full white with a shadow behind it, so the headings
     survive both the darkest and the palest wallpaper the panel can end up over. */
  .ch {
    color: rgba(255, 255, 255, 0.92);
    opacity: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }
  /* Launchpad's icons are big because it shows one flat page of them. This launcher shows grouped
     cards with labels, so the same size just spent vertical space it did not have — enough to
     scroll a panel that had room to spare. */
  .launch umb-icon {
    font-size: 34px;
  }
  .tlb {
    font-size: 12px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  .tile:hover .launch {
    border-radius: 12px;
  }
  /* Launchpad has no chrome at the bottom of the screen at all — the user and the system actions
     live in the menu bar, which this desktop has no equivalent of. Drawing them as a full-width
     bar with its own fill and a rule above it is the one thing on this panel that still reads as
     a window rather than an overlay, so the bar is dropped entirely: the same controls, sitting
     directly on the blurred surface and lined up with the column above them. */
  .footer {
    /* Out of the flow and up to the top edge, level with the search field: the avatar to the left
       of it, the system actions to the right. That is where macOS keeps both — its menu bar — and
       it is what leaves the bottom of the panel completely clear. ':host' is the absolutely
       positioned '.launcher' box that taskbar.css.ts sets up, so this anchors to the panel.
       Leaving the flow also hands the body back the strip the bar used to occupy. */
    position: absolute;
    top: 26px;
    /* Inset by the body's own horizontal padding and then capped and centred exactly as the
       content column is, so the avatar sits on the cards' left edge and the actions on their
       right. Expressed as left/right + max-width + auto margins rather than a width of its own:
       that way it collapses to the same value as 'min(1600px, 100%)' inside the padded body at
       every viewport width, instead of only matching on a wide screen. */
    left: 40px;
    right: 40px;
    width: auto;
    max-width: 1600px;
    margin-inline: auto;
    height: 40px;
    align-self: auto;
    padding: 0;
    background: none;
    border-top: none;
  }
  /* Bounded so a long display name cannot run into the centred search field. */
  .footer .user {
    max-width: 26%;
    overflow: hidden;
  }
  /* Quiet at rest, since nothing frames these any more; full strength on approach. */
  .footer .fbtn,
  .footer .user {
    opacity: 0.72;
    transition: opacity 120ms ease;
  }
  .footer:hover .fbtn,
  .footer:hover .user,
  .footer .fbtn:focus-visible {
    opacity: 1;
  }
`;
