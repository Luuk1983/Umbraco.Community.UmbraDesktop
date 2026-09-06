import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  WIN98_BEVEL_PRESSED,
  WIN98_BEVEL_RAISED,
  WIN98_BEVEL_SUNKEN,
  WIN98_FACE,
  WIN98_FONT,
  WIN98_HILIGHT,
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
 * grooved separators, the pin badge becomes a square toggle button that looks held down while an
 * app is pinned, and the footer keeps the user button, Desktop settings, Logout and Exit as menu
 * items above a groove.
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
  /* Win98's "Find" is a menu item, but this is a search field and should look like one: a white
     well with a sunken edge, which is how every Win98 text input is drawn. */
  .search {
    margin: ${WIN98_BEVEL_DEPTH}px;
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
  .fav .ch {
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
  /* A menu row: icon then label, on one line, filling the menu's width. The trailing padding is
     the space the pin toggle occupies, so a long app name is clamped before it runs underneath. */
  .launch {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 3px 22px 3px 6px;
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
  /* The pin moves from a round badge hanging off a tile's corner to a square toggle button at the
     end of the row, which is the only place a row has spare width. Still hover-only, still the
     same button, and still the same behaviour — only 'pinned' now reads as 'held down', because
     that is how Win98 shows a toggle that is on. */
  .pin {
    top: 50%;
    right: ${WIN98_BEVEL_DEPTH}px;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    border-radius: 0;
    background: ${unsafeCSS(WIN98_FACE)};
    box-shadow: ${unsafeCSS(WIN98_BEVEL_RAISED)};
    transition: none;
  }
  .pin.on,
  .pin:active {
    box-shadow: ${unsafeCSS(WIN98_BEVEL_PRESSED)};
  }
  .pin .pin-ico {
    width: 12px;
    height: 12px;
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
`;
