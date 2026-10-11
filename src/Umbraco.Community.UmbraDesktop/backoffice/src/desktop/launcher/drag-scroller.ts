/** Which body the launcher panel shows. */
export type UmbraDesktopLauncherMode = 'launcher' | 'drawer' | 'arrange';

/**
 * Where a drag may need to scroll, per mode, outermost first. The base scrolls the first of each,
 * but a theme may move the scrolling inward: Umbraco 4 keeps Favourites fixed at the top of the
 * launcher and scrolls only the tree of groups below it, so its body never scrolls and its tree
 * does. Listing the inner candidates here lets the drag follow a theme's choice without the theme
 * contract growing a way to announce it.
 */
const CANDIDATES: Record<UmbraDesktopLauncherMode, ReadonlyArray<string>> = {
  launcher: ['.body', '.cards'],
  drawer: ['.body'],
  arrange: ['.layout-pane', '.layout-pane .cards'],
};

/**
 * The element a drag should scroll near its edges: the first candidate for the mode that the active
 * theme actually lets scroll, read from its computed style when asked, so a theme switched while
 * the launcher is open is followed too.
 *
 * Falls back to the first candidate present when none scrolls. Nothing can scroll then anyway, and
 * the drag's edge scrolling only ever moves an element that has somewhere to go.
 * @param root The launcher's shadow root.
 * @param mode The body the launcher is showing.
 * @returns The element, or `null` when the panel has not rendered any candidate.
 */
export function dragScroller(root: ParentNode, mode: UmbraDesktopLauncherMode): HTMLElement | null {
  const present = CANDIDATES[mode]
    .map((selector) => root.querySelector<HTMLElement>(selector))
    .filter((element): element is HTMLElement => element !== null);
  const scrolls = (element: HTMLElement) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY);
  return present.find(scrolls) ?? present[0] ?? null;
}
