import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { UmbCollectionConfiguration } from '@umbraco-cms/backoffice/collection';
import { UmbMediaItemRepository } from '@umbraco-cms/backoffice/media';
import { UmbDataTypeDetailRepository } from '@umbraco-cms/backoffice/data-type';
import { UmbMediaDetailRepository, UmbMediaTreeRepository } from '@umbraco-cms/backoffice/media';
import { renameMedia } from '../selection/rename.js';
import type { UmbraDesktopMediaDetailStore } from '../selection/rename.js';

/**
 * What a manager window asks the server, behind one seam so the elements can be tested without one:
 * an item's name and type, and a list view's configuration. Everything goes through core's own
 * repositories, with the permissions the person already has.
 */

/**
 * The list view core's media collection is configured from when a folder names none. Core hardcodes
 * it in `UmbMediaCollectionRepository.getDefaultConfiguration` (it says the server will supply it one
 * day); repeated here because that repository is not exported.
 */
export const UMBRADESKTOP_DEFAULT_MEDIA_LIST_VIEW = '3a0156c4-3b8c-4803-bdc1-6871faa83fff';

/** A media item, as much of core's `UmbMediaItemModel` as the manager reads. */
export interface UmbraDesktopMediaItem {
  /** The key. */
  unique: string;
  /** The item's own name. */
  name: string;
  /** Its names per culture; media are invariant, so the first is the one. */
  variants: ReadonlyArray<{ name: string; culture: string | null }>;
  /** Its media type, and the list view that type opens its children in, if it is a folder. */
  mediaType: { unique: string; icon: string; collection: { unique: string } | null };
  /** Its parent, null at the root. */
  parent: { unique: string | null } | null;
}

/** What a manager window needs from the server. */
export interface UmbraDesktopMediaSource {
  /**
   * One item, or undefined when it does not exist or cannot be seen.
   * @param unique The key.
   */
  item(unique: string): Promise<UmbraDesktopMediaItem | undefined>;
  /**
   * The collection configuration a list view gives a place.
   * @param unique The place's key, null for the root.
   * @param listView The list view data type's key.
   */
  collectionConfig(unique: string | null, listView: string): Promise<UmbCollectionConfiguration>;
  /**
   * Give an item a new name.
   * @param unique The key.
   * @param name The name typed.
   * @returns True when a new name was saved; false for an empty or unchanged name, or a failure.
   */
  rename(unique: string, name: string): Promise<boolean>;
  /**
   * The folders above a folder, each with its parent, for opening the tree down to it.
   * @param unique The folder's key.
   * @returns Each folder's parent, the folder's own included; empty when the server did not answer.
   */
  parents?(unique: string): Promise<ReadonlyMap<string, string | null>>;
}

/**
 * Whether an item opens in the window as a folder rather than beside it (plan decision 6): its media
 * type has a collection. Folder does, and so does any custom type set up as a list.
 * @param item The item, if it was found.
 * @returns True for a folder.
 */
export function isFolder(item: { mediaType: { collection: unknown } } | undefined): boolean {
  return !!item?.mediaType.collection;
}

/**
 * Whether an item is a place: somewhere items go, which the tree shows and a window can open (#158,
 * design §19). Decided by what it can do, never by its type's name: its type has a collection, its
 * type has insert options (even while it holds nothing), or it holds items already, as an item does
 * whose type's insert options were taken away later. Out of the box only Folder is one; a site whose
 * Structure settings let Image hold Image makes every image one. A place that is no folder opens in
 * a window as a virtual folder, listed by Umbraco's collection through this package's server code;
 * its card still opens the item beside the window.
 * @param item The item, if it was found.
 * @param holdsItems Whether its type has insert options; undefined before they are read.
 * @returns True for a place.
 */
export function isPlace(item: { hasChildren?: boolean; mediaType: { collection: unknown } } | undefined, holdsItems: boolean | undefined): boolean {
  return !!item && (isFolder(item) || !!holdsItems || !!item.hasChildren);
}

/**
 * An item's name as core shows it.
 * @param item The item.
 * @returns Its first variant's name, or its own.
 */
export function itemName(item: Pick<UmbraDesktopMediaItem, 'name' | 'variants'>): string {
  return item.variants[0]?.name || item.name;
}

/**
 * A collection configuration from a list view's values, mapped as core's media dashboard maps them.
 * @param unique The place's key, null for the root.
 * @param values The list view data type's values.
 * @returns The configuration.
 */
export function collectionConfigFrom(
  unique: string | null,
  values: ReadonlyArray<{ alias: string; value: unknown }>,
): UmbCollectionConfiguration {
  const read = (alias: string) => values.find((each) => each.alias === alias)?.value;
  const pageSize = Number(read('pageSize'));
  return {
    unique: unique ?? '',
    dataTypeId: '',
    layouts: read('layouts') as UmbCollectionConfiguration['layouts'],
    orderBy: (read('orderBy') as string | undefined) ?? 'updateDate',
    orderDirection: (read('orderDirection') as string | undefined) ?? 'asc',
    pageSize: Number.isNaN(pageSize) || !read('pageSize') ? 50 : pageSize,
    userDefinedProperties: read('includeProperties') as UmbCollectionConfiguration['userDefinedProperties'],
  };
}

/** The real source, on core's media item and data type repositories. */
export class UmbraDesktopMediaServerSource implements UmbraDesktopMediaSource {
  /** Core's media items, cached by core. */
  #items: UmbMediaItemRepository;
  /** Core's data types, for list view configuration. */
  #dataTypes: UmbDataTypeDetailRepository;

  /** Core's media details, for a rename. */
  #details: UmbMediaDetailRepository;

  /** Core's media tree, for a folder's ancestors. */
  #tree: UmbMediaTreeRepository;

  /**
   * @param host The element the repositories belong to.
   */
  constructor(host: UmbControllerHost) {
    this.#items = new UmbMediaItemRepository(host);
    this.#dataTypes = new UmbDataTypeDetailRepository(host);
    this.#details = new UmbMediaDetailRepository(host);
    this.#tree = new UmbMediaTreeRepository(host);
  }

  /** @inheritdoc */
  async item(unique: string): Promise<UmbraDesktopMediaItem | undefined> {
    const { data } = await this.#items.requestItems([unique]);
    return data?.[0] as UmbraDesktopMediaItem | undefined;
  }

  /** @inheritdoc */
  async collectionConfig(unique: string | null, listView: string): Promise<UmbCollectionConfiguration> {
    const { data } = await this.#dataTypes.requestByUnique(listView);
    return collectionConfigFrom(unique, (data?.values ?? []) as ReadonlyArray<{ alias: string; value: unknown }>);
  }

  /** @inheritdoc */
  async parents(unique: string): Promise<ReadonlyMap<string, string | null>> {
    const { data } = await this.#tree.requestTreeItemAncestors({ treeItem: { unique, entityType: 'media' } });
    return new Map((data ?? []).map((item) => [item.unique, item.parent.unique]));
  }

  /** @inheritdoc */
  async rename(unique: string, name: string): Promise<boolean> {
    return renameMedia(this.#details as unknown as UmbraDesktopMediaDetailStore, unique, name);
  }
}
