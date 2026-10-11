import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  WIN98_BEVEL_PRESSED,
  WIN98_BEVEL_RAISED,
  WIN98_BEVEL_SUNKEN,
  WIN98_FACE,
  WIN98_FONT,
  WIN98_HILIGHT,
  WIN98_MENU_HILIGHT,
  WIN98_MENU_HILIGHT_TEXT,
  WIN98_SHADOW,
  WIN98_TEXT,
  WIN98_WINDOW,
} from './palette.js';
import { WIN98_BEVEL_DEPTH, WIN98_FRAME_BORDER } from './metrics.js';

/**
 * The launcher as the Start menu: one narrow column of full-width rows, each an icon beside its
 * label, with the navy selection bar following the pointer.
 *
 * Every affordance survives the restyle, because a theme may restyle and never remove — the search
 * row becomes a sunken text field, the group cards lose their boxes but keep their headings as
 * grooved separators, the All apps and Arrange controls stay in the header row beside the search,
 * the footer keeps the user button, Desktop settings, Logout and Exit as menu items above a
 * groove, and in arrange mode every tile stays a menu row with its − and ⋯ as push buttons at the
 * row's end.
 *
 * Nothing here sets the panel's width or position. Those come from
 * `--umbradesktop-launcher-width`/`-left`/`-max-height` in the palette, read by the base `:host`
 * rule and by `taskbar.css.ts`'s `.launcher` rule respectively — this panel is mounted inside
 * `<umbradesktop-taskbar>`'s shadow root, so its geometry belongs to the taskbar's side of the
 * boundary and setting it in both would mean fighting yourself.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(WIN98_FONT)};
    /* Padding so the panel's raised bevel — set as --umbradesktop-launcher-shadow in the
       palette — has somewhere to paint; box-sizing so that padding comes out of the width the
       token above declares rather than widening the menu past it. Same pairing, and the same
       reason, as the window frame's ring. */
    box-sizing: border-box;
    padding: ${WIN98_FRAME_BORDER}px;
  }
  /* The base's .hdr row now carries the panel's own outer margin (this theme's usual bevel-depth
     ring): the search field shares that row with the All apps button, and the base already gives
     .hdr a margin of its own, so leaving one here too would double it instead of moving it. */
  .hdr {
    margin: ${WIN98_BEVEL_DEPTH}px;
    gap: ${WIN98_BEVEL_DEPTH}px;
  }
  /* Win98's "Find" is a menu item, but this is a search field and should look like one: a white
     well with a sunken edge, which is how every Win98 text input is drawn. */
  .search {
    padding: 3px 4px;
    gap: 4px;
    background: ${unsafeCSS(WIN98_WINDOW)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_SUNKEN)};
    font-size: 11px;
  }
  .search umb-icon {
    font-size: 14px;
    /* The base dims the icon to 0.7 as a hint inside a grey field. In a white well at black it is
       the field's only mark, and dimming it makes the row look disabled. */
    opacity: 1;
  }
  .body {
    padding: ${WIN98_BEVEL_DEPTH}px;
    gap: 0;
  }
  /* One column, not a responsive card grid: a Start menu is a list. The cards themselves keep
     their headings and their tiles and lose only their boxes — a menu has no cards in it. */
  .cards {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .card {
    padding: 0;
  }
  .grid,
  .fav .grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
  /* Group headings become Win98 menu separators with their label still on them: a shadow line
     with a highlight line under it, which is how every groove in the interface is drawn. */
  .ch,
  .fav .ch,
  .gh {
    margin: ${WIN98_BEVEL_DEPTH}px 0;
    padding: 0 4px 2px;
    font-size: 11px;
    text-transform: none;
    letter-spacing: 0;
    color: ${unsafeCSS(WIN98_TEXT)};
    opacity: 1;
    border-bottom: 1px solid ${unsafeCSS(WIN98_SHADOW)};
    box-shadow: 0 1px 0 ${unsafeCSS(WIN98_HILIGHT)};
  }
  /* A menu row: icon then label, on one line, filling the menu's width. */
  .launch {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 0;
    text-align: left;
    font-size: 11px;
  }
  .launch umb-icon {
    flex-shrink: 0;
    font-size: 16px;
  }
  .tlb {
    /* The base reserves two lines so every tile in a grid is the same height. A row is one line
       high by definition, and reserving the second one doubles the menu's length. */
    -webkit-line-clamp: 1;
    min-height: 0;
    font-size: 11px;
    line-height: 1.5;
    transform: none;
  }
  /* The navy selection fill comes from '--umbradesktop-launcher-hover-background'; the white text
     that has to go with it has no token, so it is stated here. Without it the label stays black
     on navy and is unreadable, which is the one way a hover state can be worse than none. */
  .tile:hover .launch {
    color: ${unsafeCSS(WIN98_MENU_HILIGHT_TEXT)};
  }
  /* The footer keeps its contents and swaps its own fill for a groove, so it reads as the bottom
     block of one menu rather than a separate bar with its own surface. */
  .footer {
    padding: ${WIN98_BEVEL_DEPTH}px;
    border-top: 1px solid ${unsafeCSS(WIN98_SHADOW)};
    box-shadow: inset 0 1px 0 ${unsafeCSS(WIN98_HILIGHT)};
  }
  .user,
  .fbtn {
    border-radius: 0;
  }
  /* Same pairing as the app rows: the navy fill is tokenised, the white text it needs is not. */
  .user:hover,
  .fbtn:hover {
    color: ${unsafeCSS(WIN98_MENU_HILIGHT_TEXT)};
  }
  .user-name {
    font-size: 11px;
    transform: none;
  }
  .fbtn {
    width: 24px;
    height: 24px;
  }
  .fbtn umb-icon {
    font-size: 14px;
  }

  /* ---- The launcher's own controls, All apps and arrange mode ---- */

  /* Every launcher button is a Win98 push button: raised, square, pressed while held or on. The
     hover resets the face because the base hover paints the menu's navy selection bar, which on a
     push button with black text on it would be unreadable, and a Win98 button does not react to
     hover at all. */
  .ctl,
  .handle,
  .gdel,
  .edit,
  .ctl:hover,
  .handle:hover,
  .gdel:hover,
  .edit:hover {
    border: none;
    border-radius: 0;
    background: ${unsafeCSS(WIN98_FACE)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
    color: ${unsafeCSS(WIN98_TEXT)};
    font-size: 11px;
  }
  .ctl {
    min-height: 22px;
    padding: 0 8px;
  }
  .ctl umb-icon {
    font-size: 14px;
  }
  .ctl:active,
  .handle:active,
  .gdel:active,
  .edit:active,
  .ctl[aria-pressed='true'] {
    box-shadow: ${unsafeCSS(WIN98_BEVEL_PRESSED)};
  }
  /* The default button of a Win98 dialog has a black frame; Done and the Reset confirm are those.
     The text is restated because the base writes white on a pressed or default control, which on
     button-face grey is unreadable. */
  .ctl.primary,
  .ctl[aria-pressed='true'] {
    color: ${unsafeCSS(WIN98_TEXT)};
  }
  .ctl.primary {
    outline: 1px solid ${unsafeCSS(WIN98_TEXT)};
    outline-offset: -1px;
  }
  .banner {
    margin: ${WIN98_BEVEL_DEPTH}px;
    font-size: 11px;
  }
  /* The rename field is a text input like the search field, so it is drawn as the same white well.
     The drawer and palette filters already are one: they carry the search field's class. */
  .rename {
    border: none;
    background: ${unsafeCSS(WIN98_WINDOW)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_SUNKEN)};
    font-size: 11px;
  }
  .gname,
  .hint {
    font-size: 11px;
  }
  /* All apps is one menu column too, with its letters drawn as grooves like the group headings. */
  .alpha {
    columns: 1;
  }
  .lh {
    padding: 0 4px 2px;
    font-size: 11px;
    border-bottom: 1px solid ${unsafeCSS(WIN98_SHADOW)};
    box-shadow: 0 1px 0 ${unsafeCSS(WIN98_HILIGHT)};
  }
  .row {
    padding: 3px 6px;
    border-radius: 0;
    font-size: 11px;
  }
  .row umb-icon {
    font-size: 16px;
  }
  /* Same pairing as the app rows: the navy fill is tokenised, the white text it needs is not. */
  .row:hover {
    color: ${unsafeCSS(WIN98_MENU_HILIGHT_TEXT)};
  }
  /* In arrange mode a tile is a menu row too. Its two buttons leave their corners and join the row
     at its end, after the name, which takes the room between; in the flow rather than positioned,
     so they keep the base's size without this sheet restating it, and the name can never run under
     them however long it is. The row is only as tall as the buttons, so it stays near the height of
     the rows it stands for. */
  .tile.arr {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 1px 2px 1px 6px;
    border: none;
    border-radius: 0;
    font-size: 11px;
    text-align: left;
  }
  .tile.arr umb-icon {
    flex-shrink: 0;
    font-size: 16px;
  }
  .tile.arr .tlb {
    flex: 1 1 auto;
    min-width: 0;
  }
  .tile.arr .edit {
    position: static;
  }
  /* The landing bar runs across a row rather than down its side, because in a single column the
     next tile is below, not beside. */
  .tile.drop-before::before,
  .tile.drop-after::after {
    top: auto;
    bottom: auto;
    left: 4px;
    right: 4px;
    border-left: none;
    border-top: var(--umbradesktop-launcher-drop-outline, 1px dotted ${unsafeCSS(WIN98_TEXT)});
  }
  .tile.drop-before::before {
    top: -1px;
  }
  .tile.drop-after::after {
    bottom: -1px;
  }
  /* Move to is a context menu: a raised panel of rows with a groove above its last two. */
  .movemenu {
    border: none;
    border-radius: 0;
    background: ${unsafeCSS(WIN98_FACE)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
  }
  .mmi,
  .mmh {
    font-size: 11px;
  }
  .mmi.new {
    border-top: 1px solid ${unsafeCSS(WIN98_SHADOW)};
    box-shadow: inset 0 1px 0 ${unsafeCSS(WIN98_HILIGHT)};
  }
  .mmi:hover,
  .mmi:focus-visible {
    color: ${unsafeCSS(WIN98_MENU_HILIGHT_TEXT)};
  }
  /* New group is one more menu row at the end of the list, with the selection bar like the rest. */
  .newgroup {
    justify-content: flex-start;
    min-height: 0;
    padding: 3px 6px;
    border: none;
    font-size: 11px;
  }
  .newgroup:hover {
    background: var(--umbradesktop-launcher-hover-background, ${unsafeCSS(WIN98_MENU_HILIGHT)});
    color: ${unsafeCSS(WIN98_MENU_HILIGHT_TEXT)};
  }
  .ph,
  .pgh,
  .prow {
    font-size: 11px;
  }
  .prow {
    border: none;
    border-radius: 0;
    background: transparent;
  }
  /* The remove pane keeps the dotted edge its palette token gives it, which is what marks it as a
     drop target; only its text drops to the menu's size. */
  .removepane {
    font-size: 11px;
  }
`;
