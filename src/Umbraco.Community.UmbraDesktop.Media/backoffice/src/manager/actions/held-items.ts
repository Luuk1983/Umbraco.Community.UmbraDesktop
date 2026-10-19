import type { UmbClassInterface } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../../operations/media-api.js';

/**
 * What the clipboard actions share (plan task 4.6): which items an action on one item's menu acts on,
 * and reading those items from the server.
 */

/** Core's collection context, by its alias, as much of it as the actions read. */
const COLLECTION = new UmbContextToken<UmbContextMinimal & { selection: { getSelection(): ReadonlyArray<string | null> } }>('UmbCollectionContext');

/**
 * The items an action on one item's menu acts on: the whole selection when the item is part of it, as
 * Cut and Copy on a selected file act on every selected file in an OS; the item alone otherwise.
 * @param host The action.
 * @param unique The item the menu is for.
 * @returns The keys.
 */
export async function itemsFor(host: UmbClassInterface, unique: string): Promise<string[]> {
  let selected: string[] = [];
  try {
    const collection = await host.getContext(COLLECTION);
    selected = (collection?.selection.getSelection() ?? []).filter((each): each is string => !!each);
  } catch {
    // Not in a collection, as in the tree: the item alone.
  }
  return selected.includes(unique) ? selected : [unique];
}

/**
 * The items, read from the server, leaving out any it cannot find.
 * @param api The server.
 * @param uniques Their keys.
 * @returns The items.
 */
export async function refsOf(api: UmbraDesktopMediaApi, uniques: ReadonlyArray<string>): Promise<UmbraDesktopMediaRef[]> {
  const found = await Promise.all(uniques.map((unique) => api.item(unique)));
  return found.map((each) => each.data).filter((each): each is UmbraDesktopMediaRef => !!each);
}
