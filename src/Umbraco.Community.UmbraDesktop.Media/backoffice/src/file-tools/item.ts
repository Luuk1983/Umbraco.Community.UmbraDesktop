/**
 * The media item a file tool acts on (#176). Every tool sits inside core's media workspace, in its
 * footer or on the file property's "...", so the workspace says which item it is.
 */

/** A media item, as far as the file tools need it. */
export interface FileToolItem {
  /** Its key. */
  unique: string;
  /** Its name, for the questions and windows that name it. */
  name: string;
}

/** The part of core's media workspace context the file tools read. */
export interface MediaWorkspaceLike {
  /** The item's key, or nothing before a new item is first saved. */
  getUnique(): string | null | undefined;
  /** The item's name. Media is invariant, so there is one. */
  getName(): string | undefined;
}

/**
 * The item a workspace shows, or undefined for an item not saved yet, which has no file on the server
 * to act on.
 * @param workspace The media workspace.
 * @returns The item, or undefined.
 */
export function itemOf(workspace: MediaWorkspaceLike): FileToolItem | undefined {
  const unique = workspace.getUnique();
  return unique ? { unique, name: workspace.getName() ?? '' } : undefined;
}
