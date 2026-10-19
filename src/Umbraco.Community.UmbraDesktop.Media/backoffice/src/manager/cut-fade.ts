import { itemSelector, writeViewStyle } from './open-item.js';

/**
 * Cut items stay where they are, faded, until they are pasted or the cut is emptied, as Explorer
 * shows them (design §5). Drawn as the open item's ring is: one rule in each of core's views, core's
 * markup untouched.
 */

/** The id of the fade's rule in each view. */
const STYLE_ID = 'umbradesktop-media-cut';

/**
 * Fade the cards and rows of a cut, or show them all again.
 * @param root The element core's collection is rendered under.
 * @param keys The cut items' keys; empty for none.
 * @returns Whether any cards or rows were found.
 */
export function markCutItems(root: Element, keys: ReadonlyArray<string>): boolean {
  const css = keys.length ? `${keys.map(itemSelector).join(',\n')} { opacity: 0.5; }` : '';
  return writeViewStyle(root, STYLE_ID, css);
}
