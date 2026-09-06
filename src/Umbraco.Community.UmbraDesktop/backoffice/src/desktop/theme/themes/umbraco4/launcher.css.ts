import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  U4_EDGE,
  U4_FACE_DIM,
  U4_FACE_LIT,
  U4_FONT,
  U4_HILIGHT,
  U4_LINE,
  U4_LINE_SOFT,
  U4_PRESSED,
  U4_RAISED,
  U4_SELECT_LINE,
  U4_TEXT,
  U4_WELL,
} from './palette.js';

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
 * row becomes a sunken field, the pin badge becomes a small square toggle that looks held down
 * while an app is pinned, and the footer keeps the user button, Desktop settings, Logout and Exit
 * as raised buttons above a groove.
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
  /* A white well with a sunken edge, which is how every v4 text input was drawn. */
  .search {
    margin: 5px 5px 0;
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
  .card.fav .ch {
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
  .cards .card .ch {
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
  .cards .card:first-child .ch {
    border-top: none;
  }
  /* A tree row: icon then label, one line, filling the well's width. */
  .cards .card .grid {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 2px 0 3px;
  }
  .cards .card .launch {
    flex-direction: row;
    align-items: center;
    gap: 7px;
    /* The trailing padding is the space the pin toggle occupies, so a long app name is clamped
       before it runs underneath. The leading indent is the tree's own. */
    padding: 3px 24px 3px 14px;
    border-radius: 0;
    text-align: left;
  }
  /* Flat tree icons, not orbs — the gloss belongs to Favourites alone, and twenty-five orbs is
     the thing this split exists to avoid. */
  .cards .card .launch umb-icon {
    flex-shrink: 0;
    font-size: 15px;
  }
  .cards .card .tlb {
    -webkit-line-clamp: 1;
    min-height: 0;
    flex: 1 1 auto;
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

  /* ---- Pin, footer ---- */

  /* The pin moves from a round badge hanging off a tile's corner to a small square toggle. Still
     hover-only, still the same button and the same behaviour — only 'pinned' now reads as 'held
     down', because that is how a 2009 interface showed a toggle that was on. */
  .pin {
    top: 2px;
    right: 2px;
    width: 17px;
    height: 17px;
    border: 1px solid ${unsafeCSS(U4_EDGE)};
    border-radius: 2px;
    background: ${unsafeCSS(U4_RAISED)};
    box-shadow: inset 0 1px 0 ${unsafeCSS(U4_HILIGHT)};
    transition: none;
  }
  .cards .card .pin {
    top: 50%;
    transform: translateY(-50%);
  }
  .pin.on,
  .pin:active {
    background: ${unsafeCSS(U4_PRESSED)};
    box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.18);
  }
  .pin .pin-ico {
    width: 11px;
    height: 11px;
  }
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
`;
