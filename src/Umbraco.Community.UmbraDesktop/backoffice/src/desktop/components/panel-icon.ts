import type { UmbraDesktopDockSide } from '../window-group.js';

/**
 * The icon on every button whose only job is to open or put away a pane: a view's beside button on
 * the path strip and a pane's own hide button. Preview opens a pane too but draws its eye instead,
 * since a labelled feature button with two icons looked untidy. Umbraco's own pair, never a drawing of ours, and never a cross, which under a window's
 * close button read as a second close.
 *
 * Core's pair is for a panel at the bottom, so it is turned a quarter round to put the panel on the
 * pane's side. Two icons rather than one turned twice: turning one from -90° to 90° flips the panel
 * line to the other side with the chevron, so in one state the icon draws a panel where the window
 * has none. The two differ only in the chevron, which is exactly what has to change.
 *
 * The chevron says what a click will do, the way the edge will move: out while the pane is away,
 * back in while it is open.
 *
 * Design: `docs/design/2026-10-27-pane-side-panel-design.md`.
 */

/**
 * Core's bottom panel with its chevron pointing down into the panel; turned, it points outwards, the
 * way the edge moves when the pane comes out. Core calls it "close", which is the opposite of what
 * it means here, and spells it `pannel`, with two n's, in 17 and 18 alike: the registry's own name,
 * so "fixing" either would draw nothing at all.
 */
const COMES_OUT = 'icon-pannel-close';

/** Core's bottom panel with its chevron pointing up, away from it; turned, it points back inwards. */
const GOES_BACK = 'icon-panel-show';

/** An icon and how far to turn it. */
export interface UmbraDesktopPanelIcon {
  /** The Umbraco icon. */
  name: string;
  /** The CSS `rotate` that puts its panel on the pane's side. */
  rotate: string;
}

/**
 * The icon for a control that opens or puts away a pane. Pure.
 * @param open Whether the pane is open, so the control would put it away.
 * @param side The side the pane opens on.
 * @returns The icon.
 */
export function panelIcon(open: boolean, side: UmbraDesktopDockSide = 'right'): UmbraDesktopPanelIcon {
  return { name: open ? GOES_BACK : COMES_OUT, rotate: side === 'right' ? '-90deg' : '90deg' };
}
