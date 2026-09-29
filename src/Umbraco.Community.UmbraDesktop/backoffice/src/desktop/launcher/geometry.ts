/**
 * The launcher's widths that both CSS and tests read (design §6.3). Derived here once, per
 * `docs/theming.md` §4, then measured in a browser under every theme, because deriving only makes a
 * sum consistent with itself.
 */

/**
 * The launcher's width where a theme sets none, in px, capped at 92vw by the CSS that reads it. Four
 * card columns need 1118px (see the comment on the launcher's :host rule); this gives each roughly
 * 275px rather than their minimum. Tests mount at it when they mean "the default launcher on a wide
 * screen", so they follow it if it changes.
 */
export const UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH = 1180;

/** The narrowest a group card may be; the launcher's `.cards` grid reads it as its `minmax` floor. */
export const UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH = 260;

/**
 * The launcher body's padding on each side, in px. Restates `--uui-size-space-4`, which is what the
 * CSS actually uses; `geometry.test.ts` checks that the two agree.
 */
export const UMBRADESKTOP_LAUNCHER_BODY_PADDING = 12;

/** The palette's width in arrange mode when it sits beside the layout. */
export const UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH = 300;

/**
 * The narrowest arrange area that fits one card column beside the palette: below this the palette
 * becomes its own view behind "Add apps" (design D12). The container query and the tests both read
 * it. The arrange area is the launcher's content box, so the launcher's own border is outside it.
 */
export const UMBRADESKTOP_LAUNCHER_SPLIT_MIN =
  UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH + 2 * UMBRADESKTOP_LAUNCHER_BODY_PADDING + UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH;

/**
 * The launcher's width in arrange mode for a theme whose own launcher is too narrow for the palette
 * to sit beside the layout, such as a Start menu list: its own width plus the palette's, so the
 * layout keeps the width it has outside arrange mode, and never short of the split plus whatever
 * the theme draws around the arrange area. Switching between the layout and the palette in a narrow
 * panel was the one thing arrange mode made hard, and a theme is a look, not a size limit.
 * @param launcherWidth The theme's launcher width, in px.
 * @param chrome What the theme's launcher draws either side of the arrange area together (border and
 * padding), in px, since the split is measured on the arrange area itself.
 * @returns The width, in px.
 */
export function arrangeWidthFor(launcherWidth: number, chrome: number): number {
  return Math.max(launcherWidth + UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH, UMBRADESKTOP_LAUNCHER_SPLIT_MIN + chrome);
}
