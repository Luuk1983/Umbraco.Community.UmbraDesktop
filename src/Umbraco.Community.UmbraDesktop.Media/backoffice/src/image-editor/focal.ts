import { orientedSize } from './state.js';
import type { EditorState, Rect } from './state.js';

/**
 * The crop as it frames the picture, with a crop of the whole picture read as no crop: both frame
 * the same pixels, so neither moves what a focal point points at.
 * @param state The document.
 * @returns The crop, or null for the whole picture.
 */
function framing(state: EditorState): Rect | null {
  const crop = state.crop;
  if (!crop) return null;
  const size = orientedSize(state.source, state.rotation);
  return crop.x === 0 && crop.y === 0 && crop.w === size.w && crop.h === size.h ? null : crop;
}

/**
 * Whether saving `current` over the item last saved as `saved` resets its focal point and named
 * crops (design D8).
 *
 * A crop, a turn or a flip moves what the item's fractions point at, so they would mark the wrong
 * face; a resize, an adjustment, a mark or a region does not. **Compared with what was saved, not
 * with what was opened**: undo can step back past a save, and saving the uncropped picture over an
 * item that is now the cropped one reframes it just as much as the crop did.
 * @param saved The state the item holds now.
 * @param current The state about to be saved.
 * @returns True to reset them.
 */
export function resetsFocalPoint(saved: EditorState, current: EditorState): boolean {
  if (saved.rotation !== current.rotation || saved.flipH !== current.flipH || saved.flipV !== current.flipV) return true;
  const a = framing(saved);
  const b = framing(current);
  if (!a || !b) return a !== b;
  return a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;
}
