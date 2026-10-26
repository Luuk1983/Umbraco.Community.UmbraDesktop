import type { FileToolItem } from './item.js';

/**
 * Replace file on a media item (#176, research doc §7): a new file into the same item, which keeps the
 * item, its name and where it is used. The work itself is an operation of the add-on's desktop
 * context (`replaceFile`), so it is a row in the Transfers window like a move or an upload; this is
 * the part that runs in the item's page: make sure nothing unsaved is lost, then ask for the file.
 */

/** What Replace file asks of the item's page and the desktop. Injectable, so the order is tested. */
export interface ReplaceDeps {
  /** Whether the item's page holds unsaved changes. */
  hasUnsavedChanges(): boolean;
  /**
   * Ask whether to save those changes first.
   * @param name The item's name.
   * @returns True to save and go on.
   */
  askToSaveFirst(name: string): Promise<boolean>;
  /** Save the item's page, through the workspace's own Save. */
  save(): Promise<void>;
  /** Let the person pick the new file; undefined when they cancelled. */
  pick(): Promise<File | undefined>;
  /**
   * Put the file into the item.
   * @param item The item.
   * @param file The new file.
   */
  replace(item: FileToolItem, file: File): Promise<unknown>;
}

/**
 * Replace an item's file from its page. Unsaved changes on the page are saved first, after asking,
 * because the page's next Save would send its old `umbracoFile` value back over the new file; a
 * Cancel, or a save that did not go (a validation error leaves the page unsaved), stops here. A
 * cancelled picker does nothing at all.
 * @param item The item.
 * @param deps The page and the desktop.
 */
export async function replaceFromWorkspace(item: FileToolItem, deps: ReplaceDeps): Promise<void> {
  if (deps.hasUnsavedChanges()) {
    if (!(await deps.askToSaveFirst(item.name))) return;
    await deps.save();
    if (deps.hasUnsavedChanges()) return;
  }
  const file = await deps.pick();
  if (!file) return;
  await deps.replace(item, file);
}

/**
 * Let the person pick one file, with the browser's own dialog. No `accept` filter: a file the item's
 * media type does not take is refused with Umbraco's own words when it is replaced, as an upload into
 * the item is, and Umbraco's own upload offers no filter either.
 * @param doc The document the action is in, which makes the input.
 * @param open How to open the dialog. Clicks the input; a test answers instead.
 * @returns The file, or undefined when the dialog was cancelled.
 */
export function pickFile(doc: Document, open: (input: HTMLInputElement) => void = (input) => input.click()): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? undefined), { once: true });
    input.addEventListener('cancel', () => resolve(undefined), { once: true });
    open(input);
  });
}
