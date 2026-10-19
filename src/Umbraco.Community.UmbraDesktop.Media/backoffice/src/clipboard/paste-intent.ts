import { fingerprint, samePicture } from './os-image.js';
import type { UmbraDesktopImagePrint } from './os-image.js';

/**
 * What a paste brings (design §5, plan task 6.3). Read from the paste's `items` and `files`, never its
 * `types`: on a paste Chrome leaves `types` empty while the files are there (September spike §3), so
 * a check on `types` sees nothing and silently does nothing.
 */

/** What to do with a paste. */
export type UmbraDesktopPasteIntent =
  /** Our own copied picture came back: paste a copy of the item, not a new upload. */
  | { kind: 'ours' }
  /** Files from the OS: upload them. */
  | { kind: 'files'; files: File[] }
  /** Nothing usable (text, or nothing): paste what the manager holds. */
  | { kind: 'held' };

/**
 * The files a paste carries, read while the paste is being sent.
 * @param data The paste's data.
 * @returns The files.
 */
export function pastedFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = [...data.files];
  if (files.length) return files;
  return [...data.items].filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter((file): file is File => !!file);
}

/**
 * What a paste brings.
 * @param data The paste's data, or the files already read from it.
 * @param ours The fingerprint of the picture the manager last put on the OS clipboard, if any.
 * @param heldIsNewer Whether what the manager holds was copied after anything on the OS clipboard:
 * then it pastes, whatever the OS clipboard has. The OS clipboard cannot say when it was written, so
 * the manager's copy counts as newer until the page is left (`heldIsNewer` on the desktop context).
 * @returns What to do.
 */
export async function pasteIntent(
  data: DataTransfer | File[] | null,
  ours: UmbraDesktopImagePrint | undefined,
  heldIsNewer = false,
): Promise<UmbraDesktopPasteIntent> {
  const files = Array.isArray(data) ? data : pastedFiles(data);
  if (!files.length || heldIsNewer) return { kind: 'held' };
  if (ours && files.length === 1 && files[0].type.startsWith('image/')) {
    try {
      if (samePicture(await fingerprint(files[0]), ours)) return { kind: 'ours' };
    } catch {
      // A picture the browser cannot draw is not ours.
    }
  }
  return { kind: 'files', files };
}
