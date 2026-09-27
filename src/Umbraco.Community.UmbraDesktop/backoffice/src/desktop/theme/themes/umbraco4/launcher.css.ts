import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../../../constants.js';
import {
  U4_EDGE,
  U4_EDGE_STRONG,
  U4_FACE_DIM,
  U4_FACE_LIT,
  U4_FONT,
  U4_HILIGHT,
  U4_LINE,
  U4_LINE_SOFT,
  U4_PANEL,
  U4_PRESSED,
  U4_SELECT,
  U4_SELECT_LINE,
  U4_TEXT,
  U4_WELL,
} from './palette.js';

/**
 * The tree's leading indent, in px: how far in from the well's edge a row's icon starts. Shared by
 * the launcher's tree rows, the New group row, and the arrange rows, whose own padding is derived
 * from it below so their icons line up with the tree's.
 */
const TREE_INDENT_PX = 14;

/** How far an arrange row sits in from its card on each side, leaving room for its dashed edge. */
const ARRANGE_ROW_INSET_PX = 4;

/** The width of the dashed edge that marks an arrange row as movable. */
const ARRANGE_ROW_BORDER_PX = 1;

/**
 * The copy of a lifted tree row, which follows the pointer outside the tree: any drag ghost except
 * one lifted from Favourites, whose orb grid is a column layout to begin with.
 */
const TREE_ROW_GHOST = unsafeCSS(`.drag-ghost:not([data-group='${UMBRADESKTOP_PINNED_GROUP_ID}'])`);

/**
 * The launcher, as **both halves** of the Umbraco 4 backoffice rather than one of them stretched.
 *
 * v4's Sections panel held six things, which is why it could afford large glossy orbs in a grid.
 * The catalogue holds twenty-five across seven groups, plus whatever an install derives and the
 * auto More group — and an orb grid at that count is eight headings and nine rows of tiles with
 * most of it below the fold. v4 did not put everything in that panel either: it had a tree for
 * the long lists.
 *
 * So Favourites keeps the orb panel, at the count it was designed for, and the grouped catalogue
 * becomes the tree — a sunken white well of compact rows with small flat icons and sticky group
 * headings. The split costs nothing structurally, because the base already renders Favourites as
 * .card.fav, a sibling of .cards rather than a cell inside it. launcher.test.ts guards exactly
 * that, since a refactor that moved it inside would hand it the row rules and silently delete the
 * orb grid.
 *
 * Every affordance survives the restyle, because a theme may restyle and never remove: the search
 * row becomes a sunken field, the All apps and Arrange controls stay in the header row beside it,
 * the footer keeps the user button, Desktop settings, Logout and Exit as raised buttons above a
 * groove, and in arrange mode every tile, Favourites included, becomes a tree row with its − and ⋯
 * as raised buttons at the row's end.
 *
 * Nothing here sets the panel's width or position. Those come from
 * '--umbradesktop-launcher-width'/'-left'/'-max-height' in the palette, read by the base :host
 * rule and by the taskbar's own .launcher rule — this panel is mounted inside the taskbar's
 * shadow root, so its geometry belongs to that side of the boundary and setting it in both would
 * mean fighting yourself.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(U4_FONT)};
    box-sizing: border-box;
    font-size: 11px;
  }
  /* The base's .hdr row now carries the panel's own outer margin: the search field shares that
     row with the All apps button, and the base already gives .hdr a margin of its own, so leaving
     one here too would double it instead of moving it. The arrange banner takes that row's place,
     so it shares the one margin rather than restating it, and the top row stays put as arrange
     mode opens. */
  .hdr,
  .banner {
    margin: 5px 5px 0;
  }
  .hdr {
    gap: 4px;
  }
  /* A white well with a sunken edge, which is how every v4 text input was drawn. */
  .search {
    padding: 4px 6px;
    gap: 6px;
    background: ${unsafeCSS(U4_WELL)};
    box-shadow: inset 1px 1px 0 #e9e6df;
    font-size: 11px;
  }
  .search umb-icon {
    font-size: 14px;
    /* The base dims the icon to 0.7 as a hint inside a grey chip. In a white well it is the
       field's only mark, and dimming it makes the row look disabled. */
    opacity: 0.85;
  }
  /* The body stops scrolling: the tree below does its own, and two nested scrollers means the
     sticky group headings have the wrong container to stick to. min-height so the tree can
     actually shrink inside the panel's max-height instead of overflowing it. */
  .body {
    overflow: hidden;
    min-height: 0;
    gap: 6px;
    padding: 5px;
  }

  /* ---- Favourites: v4's Sections panel ---- */

  .card.fav {
    padding: 5px 6px 7px;
    background: linear-gradient(180deg, #fdfcfa 0%, #f2f0ea 100%);
  }
  .card.fav .ch,
  .card.fav .gh {
    font-size: 11px;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0;
    color: ${unsafeCSS(U4_TEXT)};
    opacity: 1;
    margin: 0 0 5px;
    padding-bottom: 3px;
    border-bottom: 1px solid ${unsafeCSS(U4_LINE_SOFT)};
  }
  /* Four across at this panel width, rather than the base's 96px auto-fill, which gives three
     and leaves a ragged gap. */
  .card.fav .grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
  }
  .card.fav .launch {
    gap: 5px;
    padding: 6px 2px 5px;
    border-radius: 3px;
  }
  /* The glossy orb. A theme cannot add DOM, so the disc is drawn on the icon element itself:
     a radial highlight over a linear body, a dark hairline, and an inner bottom shade.

     The two stops are custom properties so the hue rules below state only a colour pair. The
     gradient geometry is written once, here, and every orb is guaranteed to share it. */
  .card.fav .launch umb-icon {
    box-sizing: border-box;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    font-size: 20px;
    color: ${unsafeCSS(U4_WELL)};
    border-radius: 50%;
    --u4-orb-top: #5b9bd8;
    --u4-orb-bottom: #25578f;
    background-image:
      radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0) 46%),
      linear-gradient(180deg, var(--u4-orb-top) 0%, var(--u4-orb-bottom) 100%);
    box-shadow:
      0 1px 2px rgba(20, 25, 35, 0.35),
      inset 0 0 0 1px rgba(0, 0, 0, 0.16),
      inset 0 -6px 9px rgba(0, 0, 0, 0.14);
  }
  /* v4's panel was multicoloured, one hue per section, and this is that mapping — keyed by the
     glyph each app declares in the catalogue, which the base renders as 'umb-icon[name]' and a
     theme can therefore read. Grouping by area rather than colouring all nineteen separately is
     the faithful part: v4 coloured *sections*, so apps from the same corner of the backoffice
     sharing a hue is the original behaviour, not a shortcut.

     Content keeps the base blue above and needs no rule of its own. An unmapped glyph — a
     third-party icon, or a name that arrived with a colour suffix appended — falls through to
     that same blue, which is why these are exact matches rather than prefixes: 'icon-document'
     is a prefix of 'icon-documents', and a prefix match would quietly merge the two. */

  /* Media and delivery. */
  .card.fav .launch umb-icon[name='icon-picture'],
  .card.fav .launch umb-icon[name='icon-globe'] {
    --u4-orb-top: #67c3bb;
    --u4-orb-bottom: #1f7d78;
  }
  /* People, and the packages that extend them. */
  .card.fav .launch umb-icon[name='icon-users'],
  .card.fav .launch umb-icon[name='icon-user'],
  .card.fav .launch umb-icon[name='icon-box'],
  .card.fav .launch umb-icon[name='icon-box-alt'] {
    --u4-orb-top: #f0b055;
    --u4-orb-bottom: #c9721a;
  }
  /* Permissions, auditing and publishing. */
  .card.fav .launch umb-icon[name='icon-diploma'],
  .card.fav .launch umb-icon[name='icon-eye'],
  .card.fav .launch umb-icon[name='icon-newspaper'] {
    --u4-orb-top: #8ec26a;
    --u4-orb-bottom: #4e8232;
  }
  /* Settings and the developer surfaces. */
  .card.fav .launch umb-icon[name='icon-settings'],
  .card.fav .launch umb-icon[name='icon-code'],
  .card.fav .launch umb-icon[name='icon-webhook'],
  .card.fav .launch umb-icon[name='icon-autofill'] {
    --u4-orb-top: #a98cd4;
    --u4-orb-bottom: #61428f;
  }
  /* Diagnostics, where something is usually wrong. */
  .card.fav .launch umb-icon[name='icon-search'],
  .card.fav .launch umb-icon[name='icon-hearts'],
  .card.fav .launch umb-icon[name='icon-speed-gauge'] {
    --u4-orb-top: #e08a7e;
    --u4-orb-bottom: #b23a2d;
  }
  .card.fav .tlb {
    -webkit-line-clamp: 1;
    min-height: 0;
    font-size: 10px;
    line-height: 1.3;
    transform: none;
  }

  /* ---- The catalogue: v4's tree ---- */

  .cards {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-height: 0;
    overflow-y: auto;
    box-sizing: border-box;
    background: ${unsafeCSS(U4_WELL)};
    border: 1px solid ${unsafeCSS(U4_EDGE)};
    box-shadow: inset 1px 1px 0 #e9e6df;
  }
  .cards .card {
    display: flex;
    flex-direction: column;
    padding: 0;
    background: transparent;
    border: none;
  }
  /* Group headings become the grooved strips v4 divided a panel with, and stick to the top of the
     well so the group a row belongs to is still readable once the list is scrolled. */
  .cards .card .ch,
  .cards .card .gh {
    position: sticky;
    top: 0;
    z-index: 2;
    margin: 0;
    padding: 3px 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0;
    color: ${unsafeCSS(U4_TEXT)};
    opacity: 1;
    background: linear-gradient(180deg, #f2f0ea 0%, #e6e3db 100%);
    border-top: 1px solid ${unsafeCSS(U4_LINE_SOFT)};
    border-bottom: 1px solid ${unsafeCSS(U4_LINE)};
    box-shadow: inset 0 1px 0 ${unsafeCSS(U4_HILIGHT)};
  }
  .cards .card:first-child .ch,
  .cards .card:first-child .gh {
    border-top: none;
  }
  /* A tree row: icon then label, one line, filling the well's width. */
  .cards .card .grid {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 2px 0 3px;
  }
  /* The row geometry is written once for the three things drawn as a tree row: a row in the tree,
     an arrange tile, which is a tree row too and restates only its padding further down, and the
     copy of a row that follows the pointer during a drag, which is drawn outside the tree and so
     outside the reach of the tree's own selectors. One list, so the three cannot drift apart. */
  .cards .card .launch,
  .tile.arr,
  ${TREE_ROW_GHOST} .launch {
    flex-direction: row;
    align-items: center;
    gap: 7px;
    padding: 3px ${TREE_INDENT_PX}px;
    border-radius: 0;
    text-align: left;
  }
  /* Flat tree icons, not orbs — the gloss belongs to Favourites alone, and twenty-five orbs is
     the thing this split exists to avoid. */
  .cards .card .launch umb-icon,
  .tile.arr umb-icon,
  ${TREE_ROW_GHOST} .launch umb-icon {
    flex-shrink: 0;
    font-size: 15px;
  }
  .cards .card .tlb,
  .tile.arr .tlb,
  ${TREE_ROW_GHOST} .tlb {
    -webkit-line-clamp: 1;
    min-height: 0;
    flex: 1 1 auto;
    min-width: 0;
    font-size: 11px;
    line-height: 1.45;
    text-align: left;
    transform: none;
  }
  /* v4 outlined a selected tree row rather than only filling it; the fill is the palette's
     '--umbradesktop-launcher-hover-background' and the outline has no token. */
  .tile:hover .launch {
    box-shadow: inset 0 0 0 1px ${unsafeCSS(U4_SELECT_LINE)};
  }

  /* ---- Footer ---- */

  /* The footer keeps its contents and swaps its fill for a groove, so it reads as the bottom
     block of one panel rather than a separate bar with a surface of its own. */
  .footer {
    padding: 5px;
    gap: 5px;
    background: transparent;
    border-top: 1px solid ${unsafeCSS(U4_LINE)};
    box-shadow: inset 0 1px 0 ${unsafeCSS(U4_HILIGHT)};
  }
  .user {
    border-radius: 2px;
    padding: 2px 4px;
  }
  .user:hover {
    box-shadow: inset 0 0 0 1px ${unsafeCSS(U4_SELECT_LINE)};
  }
  .user-name {
    font-size: 11px;
    font-weight: 700;
    transform: none;
  }
  .fbtn {
    box-sizing: border-box;
    width: 23px;
    height: 23px;
    border: 1px solid ${unsafeCSS(U4_EDGE)};
    border-radius: 3px;
    background: linear-gradient(180deg, ${unsafeCSS(U4_FACE_LIT)} 0%, ${unsafeCSS(U4_FACE_DIM)} 100%);
    box-shadow: inset 0 1px 0 ${unsafeCSS(U4_HILIGHT)};
  }
  .fbtn:active {
    background: ${unsafeCSS(U4_PRESSED)};
    box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.18);
  }
  .fbtn umb-icon {
    font-size: 13px;
  }

  /* ---- The launcher's own controls, All apps and arrange mode ---- */

  /* A control is a raised v4 button: the fill and edge come from the palette, and this adds the
     highlight along its top edge and the corners the footer's buttons have. The handle stays a bare
     grip, as in the base. */
  .ctl,
  .gdel,
  .edit {
    border-radius: 3px;
    box-shadow: inset 0 1px 0 ${unsafeCSS(U4_HILIGHT)};
  }
  .ctl:active,
  .gdel:active,
  .edit:active {
    background: ${unsafeCSS(U4_PRESSED)};
    box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.18);
  }
  /* The pressed and default states read as v4's pale blue selection, with dark text on it: the
     base writes white on a pressed control, which on this blue is unreadable. Bold marks Done as
     the default button, because on a banner of the same blue its fill alone would not. */
  .ctl[aria-pressed='true'],
  .ctl.primary {
    color: ${unsafeCSS(U4_TEXT)};
    border-color: ${unsafeCSS(U4_SELECT_LINE)};
  }
  .ctl.primary {
    font-weight: 700;
  }
  .ctl umb-icon {
    font-size: 14px;
  }
  .banner,
  .movemenu,
  .prow {
    border-radius: 0;
  }
  /* The rename field is a text input like the search field, so it is the same sunken white well. */
  .rename {
    background: ${unsafeCSS(U4_WELL)};
    box-shadow: inset 1px 1px 0 #e9e6df;
    font-size: 11px;
  }
  .gname,
  .hint {
    font-size: 11px;
  }
  .alpha {
    columns: 1;
  }
  /* In arrange mode the layout pane scrolls as a whole, as the base's does, rather than leaving it
     to the tree well the way the launcher itself does. The drag scrolls the pane near its edges,
     and Move to keeps its list inside the pane, so a well scrolling on its own inside it would
     leave both measuring the wrong box. */
  .layout-pane {
    overflow: auto;
  }
  .layout-pane .cards {
    flex-shrink: 0;
    overflow: visible;
  }
  /* Arrange tiles are tree rows too, Favourites included, so they stack in one column with a line
     of room between them for the dashed edge that marks each as movable. */
  .card.fav.agroup .grid,
  .cards .card.agroup .grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 3px ${ARRANGE_ROW_INSET_PX}px;
  }
  /* The row geometry is the tree's, in the shared rule above; only the padding differs. Its two
     buttons leave their corners and join the row at its end, after the name, which takes the room
     between; in the flow rather than positioned, so they keep the base's size without this sheet
     restating it, and the name can never run under them however long it is. So the buttons set the
     row's height, which leaves only a pixel of padding above and below, and they end the row, which
     leaves only a little after them. The leading padding is the tree's indent less the row's inset
     and its dashed edge, so the icon starts exactly where a tree row's does. */
  .tile.arr {
    padding: 1px 2px 1px ${TREE_INDENT_PX - ARRANGE_ROW_INSET_PX - ARRANGE_ROW_BORDER_PX}px;
    border: ${ARRANGE_ROW_BORDER_PX}px dashed ${unsafeCSS(U4_LINE_SOFT)};
  }
  .tile.arr .edit {
    position: static;
  }
  /* The landing bar runs across a tree row rather than down its side, because the next row is
     below it. Favourites in the launcher keeps the base's upright bar: its orbs sit side by side. */
  .cards .tile.drop-before::before,
  .cards .tile.drop-after::after,
  .tile.arr.drop-before::before,
  .tile.arr.drop-after::after {
    top: auto;
    bottom: auto;
    left: 4px;
    right: 4px;
    border-left: none;
    border-top: var(--umbradesktop-launcher-drop-outline, 2px solid ${unsafeCSS(U4_SELECT_LINE)});
  }
  .cards .tile.drop-before::before,
  .tile.arr.drop-before::before {
    top: -2px;
  }
  .cards .tile.drop-after::after,
  .tile.arr.drop-after::after {
    bottom: -2px;
  }
  /* The copy under the pointer is drawn outside the tree, so the tree's scoped rules do not reach
     it and a tree row would follow the pointer as a base column tile as wide as the row. The shared
     row rule in the tree section lists it for that reason; this draws it as a selected tree row. A
     Favourites tile is lifted from the orb grid, where it is a column already, so it is left as
     one. It is no wider than what it shows: the drag gives the copy the width of the row it was
     lifted from, which is the whole tree, and a copy that wide covers the remove pane's text it is
     being dragged to. A maximum rather than a width, so it can only ever shrink the copy. */
  .drag-ghost {
    max-width: max-content;
    border-radius: 0;
    background: ${unsafeCSS(U4_SELECT)};
    box-shadow:
      inset 0 0 0 1px ${unsafeCSS(U4_SELECT_LINE)},
      var(--umbradesktop-launcher-ghost-shadow, 0 4px 12px rgba(25, 35, 50, 0.3));
  }
  /* New group is one more row at the foot of the tree, under a line like the group strips. The
     tree's card rule outranks a bare selector, so this one is scoped to it. */
  .cards .newgroup {
    flex-direction: row;
    justify-content: flex-start;
    min-height: 0;
    padding: 4px ${TREE_INDENT_PX}px;
    border-top: 1px solid ${unsafeCSS(U4_LINE_SOFT)};
    font-size: 11px;
  }
  .cards .newgroup:hover {
    background: var(--umbradesktop-launcher-hover-background, ${unsafeCSS(U4_SELECT)});
  }
  .movemenu {
    background: ${unsafeCSS(U4_PANEL)};
    border: 1px solid ${unsafeCSS(U4_EDGE_STRONG)};
  }
  .ph,
  .pgh,
  .prow,
  .mmi,
  .mmh,
  .removepane {
    font-size: 11px;
  }
`;
