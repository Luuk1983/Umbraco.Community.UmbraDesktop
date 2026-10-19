/**
 * What a drag of media between manager windows carries (design §4, plan task 5.3). Pure.
 *
 * The drag travels under a private type, because during `dragover` a page can read a drag's types but
 * not its data (drag and paste spike §3): the type is what says "this is ours".
 */

/** The private type a manager's drag carries its items under. */
export const UMBRADESKTOP_MEDIA_DRAG_TYPE = 'application/x-umbradesktop-media';

/** What a drag carries. */
export interface UmbraDesktopMediaDragPayload {
  /** The items' keys. */
  keys: string[];
  /** Whether they come out of the recycle bin, so a drop on a folder restores them. */
  fromBin: boolean;
}

/**
 * Which items a press drags: the whole selection when the item pressed is part of it, the item alone
 * otherwise (design §4).
 * @param pressed The item pressed.
 * @param selection What is selected in its window.
 * @returns The keys.
 */
export function draggedKeys(pressed: string, selection: ReadonlyArray<string>): string[] {
  return selection.includes(pressed) ? [...selection] : [pressed];
}

/**
 * Whether a drag copies rather than moves: Ctrl held, or Option on a Mac, as in each OS's own file
 * manager (design §4).
 * @param keys The keys held during the drag.
 * @param keys.ctrlKey Ctrl.
 * @param keys.altKey Alt, Option on a Mac.
 * @param keys.metaKey Cmd, or the Windows key.
 * @param mac Whether this is a Mac.
 * @returns True to copy.
 */
export function isCopyDrag(keys: { ctrlKey: boolean; altKey: boolean; metaKey: boolean }, mac: boolean): boolean {
  return mac ? keys.altKey : keys.ctrlKey;
}

/**
 * The payload as text, for the drag's data.
 * @param payload What the drag carries.
 * @returns The text.
 */
export function encodeDrag(payload: UmbraDesktopMediaDragPayload): string {
  return JSON.stringify(payload);
}

/**
 * The payload read back, or nothing when the text is not one of ours.
 * @param text The drag's data.
 * @returns The payload.
 */
export function decodeDrag(text: string): UmbraDesktopMediaDragPayload | undefined {
  try {
    const value = JSON.parse(text) as Partial<UmbraDesktopMediaDragPayload>;
    if (!Array.isArray(value.keys) || !value.keys.every((key) => typeof key === 'string')) return undefined;
    return { keys: value.keys, fromBin: value.fromBin === true };
  } catch {
    return undefined;
  }
}
