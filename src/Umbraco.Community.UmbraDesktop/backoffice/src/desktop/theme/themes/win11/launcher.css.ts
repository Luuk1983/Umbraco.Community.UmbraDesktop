import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { W11_FONT } from './palette.js';

/**
 * Start: one acrylic card with headings on it, a search field at the top, a grid of app tiles,
 * and a footer strip carrying the user and the actions.
 *
 * Nothing here positions or sizes the panel. Its width, its centring offset and its clearance
 * above the bar are all palette tokens read by the base rules — see `palette.ts`, where the
 * centring is computed from the declared width so the two cannot drift, and `docs/theming.md` §5
 * for why a sheet setting `left`/`right`/`width` together would half-work instead.
 *
 * The group cards lose their fill and border through the palette rather than here, because
 * Windows 11 draws Start as a single surface with section headings rather than as boxes. What is
 * left in this file is spacing, the tile shape, and the footer strip.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(W11_FONT)};
    font-size: 12px;
  }
  /* The base's .hdr row now carries the panel's own outer margin: the search field shares that
     row with the All apps button, and the base already gives .hdr a margin of its own, so leaving
     one here too would double it instead of moving it. The arrange banner takes that row's place,
     so it shares the margin: with the base's own, the top row moved as arrange mode opened. */
  .hdr,
  .banner {
    margin: 16px 20px 4px;
  }
  /* A filled field with a border and a soft focus ring, which is how every Windows 11 text input
     is drawn — and unlike the base's card-coloured chip, it has to read as enterable. */
  .search {
    padding: 7px 12px;
    gap: 8px;
    background: var(--umbradesktop-launcher-card-background, rgba(255, 255, 255, 0.6));
    border: 1px solid var(--umbradesktop-launcher-border, rgba(0, 0, 0, 0.1));
    box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.35);
    font-size: 12px;
  }
  .search umb-icon {
    font-size: 15px;
    opacity: 0.8;
  }
  .body {
    gap: 14px;
    padding: 12px 20px 16px;
  }
  /* One surface, so the group cards stack rather than tiling into columns of their own. Their
     fill and border are already gone via the palette; this is what stops them reading as a grid
     of boxes with gaps between them. */
  .cards {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .card {
    padding: 0;
  }
  /* Section headings: Windows 11 uses sentence case at body weight, not the base's spaced-out
     uppercase micro-label. */
  .ch,
  .card.fav .ch {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    opacity: 1;
  }
  /* Six across, the way Start lays its pinned grid out at this width. The Favourites card keeps
     the same grid as the groups here, because Start makes no visual distinction between its
     pinned area and its app list beyond the heading above each. */
  .grid,
  .card.fav .grid {
    grid-template-columns: repeat(6, 1fr);
    gap: 2px;
  }
  /* Half as many across in arrange mode, because the layout there has half the width: the palette
     takes the other half of the panel. That keeps a tile the width it has in Start, which is what
     leaves room for its two edit buttons side by side; at six across in half the width they
     covered each other. The Favourites selector is restated so it outranks the rule above. */
  .card.agroup .grid,
  .card.fav.agroup .grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .launch {
    gap: 6px;
    padding: 10px 4px 8px;
    border-radius: 4px;
    transition: background-color 90ms ease;
  }
  .launch umb-icon {
    font-size: 26px;
  }
  .tlb {
    font-size: 11px;
    line-height: 1.3;
    transform: none;
  }
  /* Start's footer is a distinct strip: a slightly deeper plane than the panel, with the user at
     the leading end and the actions at the trailing one, which is exactly what the base renders. */
  .footer {
    padding: 10px 20px;
    background: rgba(0, 0, 0, 0.04);
    border-top: 1px solid var(--umbradesktop-launcher-border, rgba(0, 0, 0, 0.07));
  }
  .user {
    border-radius: 4px;
    padding: 4px 8px 4px 4px;
  }
  .user-name {
    font-size: 12px;
    font-weight: 400;
    transform: none;
  }
  .fbtn {
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 4px;
  }
  .fbtn umb-icon {
    font-size: 15px;
  }
`;
