import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_FONT } from './palette.js';

/**
 * How far down the panel its top band starts, in px. The header row, the arrange banner that takes
 * its place, and the footer's user and actions clusters beside them all start here, so they share one
 * number rather than each typing its own.
 */
const TOP_BAND_PX = 26;

/**
 * The width of the middle of the top band: centred and capped, so whatever sits there (the header
 * row, or the arrange banner in its place) stays clear of the footer's clusters at each end.
 */
const MIDDLE_BAND_WIDTH = 'min(560px, 50%)';

/**
 * The launcher restyled as a fullscreen, blurred Launchpad-style surface. Its content keeps its
 * structure — search, the All apps and Arrange controls, group cards, Favourites, tiles — only the
 * panel's own surface changes; sizing/position is owned by `taskbar.css.ts`'s `.launcher` rule (the
 * panel is mounted inside `<umbradesktop-taskbar>`'s shadow tree), not here.
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
  /* The header row and the footer below share an explicit top offset, rather than each ending up
     wherever its own margin or position puts it. That is what actually guarantees the avatar, the
     search pill — now sharing its row with the All apps button — and the action buttons sit on one
     line. The row is centred and capped rather than left at the base's full body width, so its two
     controls sit in the middle band that the footer's user and actions clusters leave clear at
     each side.

     Arrange mode's banner takes the header row's place, so it takes the same band. At the base's
     full width it ran under both clusters: the footer painted over it, and a press on Reset landed
     on the exit-desktop button. Border-box, because unlike the header row it has a border and
     padding, and they come out of the cap rather than widening it towards the clusters. */
  .hdr,
  .banner {
    box-sizing: border-box;
    margin: ${TOP_BAND_PX}px auto 0;
    width: ${unsafeCSS(MIDDLE_BAND_WIDTH)};
  }
  /* The pill no longer centres or sizes itself — .hdr owns both now that it shares the row with
     the All apps button — so it takes whatever width .hdr leaves it (the base's .hdr already
     stretches its children to a common height via align-items: stretch). */
  .search {
    height: 40px;
    padding: 0 18px;
    border-radius: 999px;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
  }
  /* All apps and Arrange, and Back in All apps, as the search pill's siblings: its height (the row
     stretches them to it), its round ends, its frost and its edge, read from the same tokens so the
     three cannot drift apart. macOS has no All apps button to copy, and the base's small rounded
     rectangles read as controls from another system beside the pill, so the row becomes one toolbar
     of pills, the way Spotlight's own buttons sit beside its field. */
  .hdr .ctl {
    padding: 0 18px;
    border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
    border-radius: 999px;
    background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
    color: rgba(255, 255, 255, 0.85);
  }
  .hdr .ctl:hover {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt));
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
  /* Section headings the way macOS writes them, which is not the way the backoffice does.
     The base rule is Umbraco's own group heading — h5 size at weight 400, in full text colour — and
     that is right for the Umbraco skins and wrong here: a theme imitating an operating system
     should look like that system, not like the panel it happens to be running in.

     macOS labels a group of things small, semibold and in a secondary colour — Finder's sidebar
     headers, Spotlight's result groups, the Control Centre's sections all read this way, and none of
     them is uppercase or full-size. The shadow is this panel's own problem rather than the system's:
     it is translucent over the wallpaper, so a heading needs separation from whatever is behind it. */
  .ch {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: rgba(255, 255, 255, 0.62);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
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
    top: ${TOP_BAND_PX}px;
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
    /* Its box spans the whole band, clusters and the gap between them, and it is painted above the
       header row and the arrange banner that sit in that gap. Transparent is not the same as not
       there: a mouse press on Search, All apps, Arrange, Reset or Done landed on this box and did
       nothing, and only the keyboard still reached them. So the box itself takes no pointer, and
       only its two clusters do (below). */
    pointer-events: none;
  }
  .footer .user,
  .footer .actions {
    pointer-events: auto;
  }
  /* With the footer out of the flow up in the top band, it leaves the remove pane no box at the foot
     of the panel to take over, and the base's size containment would draw the pane at no height at
     all. So here the pane sizes itself, at the foot of the panel. That moves nothing under the
     pointer, because the taskbar fixes this panel's height: the pane shortens the body from below
     rather than growing the panel. */
  .removepane {
    contain: none;
    padding: var(--uui-size-space-4);
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
