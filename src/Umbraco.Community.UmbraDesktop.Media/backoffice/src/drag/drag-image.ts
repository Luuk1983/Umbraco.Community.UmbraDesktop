/**
 * The picture that follows the pointer during a drag (design §4, plan task 5.5): a thumbnail of the
 * item grabbed, or a small stack with a count for several. The browser draws it slightly see-through.
 * Built off screen, handed to `setDragImage`, and removed straight after: the browser takes its picture
 * as the drag starts.
 */

/** The image's side, in CSS pixels. */
export const DRAG_IMAGE_SIZE = 64;

/**
 * Build the picture.
 * @param count How many items are dragged.
 * @param thumbnail The grabbed item's thumbnail address, when it has one.
 * @returns The element, already in the document, off screen.
 */
export function buildDragImage(count: number, thumbnail?: string): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-1000px;top:-1000px;width:${DRAG_IMAGE_SIZE + 12}px;height:${DRAG_IMAGE_SIZE + 12}px;pointer-events:none;`;
  // Behind the face, one card per extra item up to two, so a stack reads as a stack.
  for (let layer = Math.min(count - 1, 2); layer > 0; layer--) {
    host.appendChild(card(layer * 5, ''));
  }
  host.appendChild(card(0, thumbnail ?? ''));
  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'count';
    badge.textContent = String(count);
    badge.style.cssText =
      'position:absolute;right:0;bottom:0;min-width:20px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:10px;' +
      'background:var(--uui-color-selected,#3544b1);color:var(--uui-color-selected-contrast,#fff);font:600 12px/20px sans-serif;text-align:center;';
    host.appendChild(badge);
  }
  document.body.appendChild(host);
  return host;
}

/**
 * One card of the stack.
 * @param offset How far it sits behind the face.
 * @param thumbnail What it shows, or nothing for a plain card.
 * @returns The card.
 */
function card(offset: number, thumbnail: string): HTMLElement {
  const face = document.createElement('div');
  face.style.cssText =
    `position:absolute;left:${offset}px;top:${offset}px;width:${DRAG_IMAGE_SIZE}px;height:${DRAG_IMAGE_SIZE}px;box-sizing:border-box;` +
    'border-radius:4px;border:1px solid var(--uui-color-border,#d8d7d9);background:var(--uui-color-surface,#fff) center/cover no-repeat;' +
    'box-shadow:0 1px 3px rgba(0,0,0,.2);';
  if (thumbnail) face.style.backgroundImage = `url("${thumbnail.replace(/"/g, '%22')}")`;
  return face;
}
