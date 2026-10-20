import type { UmbraDesktopMediaRef } from './media-api.js';

/**
 * What each media type may hold, its insert options (a type's Structure settings), read once per
 * type for the page (#158, design §19). They decide which items are places, in the tree and as drop
 * targets, so the tree, a drag's marks and its label all read the same answer. Media types change
 * rarely and only in Settings, so a page reload is what picks up a change.
 */

/**
 * Read the media types a type allows under it from the server.
 * @param type The type's key, or null for the Media root.
 * @returns Their keys, or undefined when the server did not answer.
 */
export type UmbraDesktopReadAllowed = (type: string | null) => Promise<string[] | undefined>;

/** Every media type's insert options, as far as read, and the types that make places. */
export class UmbraDesktopMediaTypes {
  /** Each type's read, by key ('' for the root), kept while it is under way and once it answered. */
  #reads = new Map<string, Promise<ReadonlySet<string> | undefined>>();

  /** Each type's insert options once read, for the questions that cannot wait. */
  #known = new Map<string, ReadonlySet<string>>();

  /** The types that make places, worked out once. */
  #places?: Promise<string[] | undefined>;

  /**
   * The media types a type allows under it: read once, and again only after a read that failed.
   * @param type The type's key, or null for the Media root.
   * @param read Reads it from the server, when it is not read yet.
   * @returns Their keys, or undefined when the server did not answer.
   */
  allowedChildren(type: string | null, read: UmbraDesktopReadAllowed): Promise<ReadonlySet<string> | undefined> {
    const key = type ?? '';
    let reading = this.#reads.get(key);
    if (!reading) {
      reading = read(type).then((types) => {
        if (!types) {
          this.#reads.delete(key);
          return undefined;
        }
        const allowed: ReadonlySet<string> = new Set(types);
        this.#known.set(key, allowed);
        return allowed;
      });
      this.#reads.set(key, reading);
    }
    return reading;
  }

  /**
   * Whether a type has insert options, as far as read.
   * @param type The type's key.
   * @returns True when it may hold items, false when it may not, undefined before it is read.
   */
  holdsItems(type: string): boolean | undefined {
    const known = this.#known.get(type);
    return known ? known.size > 0 : undefined;
  }

  /**
   * The media types whose items are places, for limiting a search to them: every type that may hold
   * items, found by walking the insert options from the root down, and what Umbraco calls folders.
   * A type with a collection but no insert options is only found as a folder, so an item of one is
   * found by the search only if Umbraco calls its type a folder (design §19).
   * @param read Reads a type's insert options from the server.
   * @param folderTypes What Umbraco calls folders.
   * @returns Their keys, or undefined when the server did not answer.
   */
  placeTypes(read: UmbraDesktopReadAllowed, folderTypes: () => Promise<string[] | undefined>): Promise<string[] | undefined> {
    this.#places ??= this.#walk(read, folderTypes).then((places) => {
      if (!places) this.#places = undefined;
      return places;
    });
    return this.#places;
  }

  /**
   * Walk the insert options from the root, one level at a time.
   * @param read Reads a type's insert options.
   * @param folderTypes What Umbraco calls folders.
   * @returns The place types, or undefined when a read failed.
   */
  async #walk(read: UmbraDesktopReadAllowed, folderTypes: () => Promise<string[] | undefined>): Promise<string[] | undefined> {
    const seen = new Set<string>();
    const places = new Set<string>();
    let level: Array<string | null> = [null];
    while (level.length) {
      const answers = await Promise.all(level.map((type) => this.allowedChildren(type, read)));
      if (answers.some((answer) => !answer)) return undefined;
      const next: string[] = [];
      answers.forEach((allowed, index) => {
        const type = level[index];
        if (type && allowed!.size) places.add(type);
        for (const child of allowed!) {
          if (!seen.has(child)) {
            seen.add(child);
            next.push(child);
          }
        }
      });
      level = next;
    }
    const folders = await folderTypes();
    if (!folders) return undefined;
    for (const folder of folders) places.add(folder);
    return [...places];
  }
}

/** The page's one record of media types, shared by the tree, the drag and the operations. */
export const umbraDesktopMediaTypes = new UmbraDesktopMediaTypes();

/**
 * Whether an item the operations read is a place, as far as known: a folder, an item that holds items,
 * or one whose type has insert options once they are read. What a drop or paste lights in the tree.
 * @param ref The item.
 * @param types The record of insert options.
 * @returns True for a place.
 */
export function isPlaceRef(ref: UmbraDesktopMediaRef, types: UmbraDesktopMediaTypes = umbraDesktopMediaTypes): boolean {
  return ref.isFolder || !!ref.hasChildren || !!types.holdsItems(ref.mediaType);
}
