import { UmbRepositoryBase } from '@umbraco-cms/backoffice/repository';
import { UmbMediaTreeRepository } from '@umbraco-cms/backoffice/media';
import type { UmbMediaTreeItemModel, UmbMediaTreeRootModel } from '@umbraco-cms/backoffice/media';
import { MediaService } from '@umbraco-cms/backoffice/external/backend-api';
import type { MediaItemResponseModel } from '@umbraco-cms/backoffice/external/backend-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type {
  UmbTreeAncestorsOfRequestArgs,
  UmbTreeChildrenOfRequestArgs,
  UmbTreeRepository,
  UmbTreeRootItemsRequestArgs,
} from '@umbraco-cms/backoffice/tree';
import { isPlace } from '../manager/media-source.js';
import { UmbraDesktopMediaServerApi } from '../operations/media-api.js';
import { umbraDesktopMediaTypes } from '../operations/media-types.js';
import type { UmbraDesktopReadAllowed } from '../operations/media-types.js';
import { hasPlace, placesIn, placesOf } from './folder-tree.js';
import type { UmbraDesktopTreePage } from './folder-tree.js';

/**
 * What Umbraco's media search is asked to match: everything. The search requires some text, and
 * the places asked for are picked by parent and type, not by name.
 */
const SEARCH_EVERYTHING = '*';

/**
 * The data of the places-only tree beside a manager window (design §17, §19): core's media tree, asked
 * through core's own repository, with only the places passed on and an arrow only on a place that has
 * a place inside. A place is a folder or any item that can hold items (`isPlace`), so each type's
 * insert options are read, once for the page, before a page's items are judged. Out of the box only
 * folders are places, and the tree is as it always was. Core's default tree draws it, so its look,
 * menus, start nodes and reloads stay core's. A folder bigger than one page is asked about through
 * Umbraco's media search instead, so its size costs nothing (`folder-tree.ts` has the rule and its catch).
 *
 * Every parent's places come back in one answer, whatever page core asks for: the tree pages to keep
 * a long list of items cheap, and a parent's places are a short one. So core never shows Load more.
 */
export class UmbraDesktopMediaFolderTreeRepository
  extends UmbRepositoryBase
  implements UmbTreeRepository<UmbMediaTreeItemModel, UmbMediaTreeRootModel>
{
  /** Core's media tree repository, which this one asks. */
  #media: UmbMediaTreeRepository;

  /** The add-on's server calls, for each type's insert options and the folder types. */
  #api: UmbraDesktopMediaServerApi;

  /** @param host The controller host. */
  constructor(host: UmbControllerHost) {
    super(host);
    this.#media = new UmbMediaTreeRepository(this);
    this.#api = new UmbraDesktopMediaServerApi(this);
  }

  /**
   * The Media root, with an arrow only when a place is at the top.
   * @returns The root.
   */
  async requestTreeRoot() {
    const { data } = await this.#media.requestTreeRoot();
    if (!data) return { data };
    return { data: { ...data, hasChildren: data.hasChildren && (await hasPlace(this.#page(null), this.#search(null), this.#isPlace)) } };
  }

  /**
   * The places at the top.
   * @param _args What core asks for; every place is answered.
   * @returns The places.
   */
  async requestTreeRootItems(_args: UmbTreeRootItemsRequestArgs) {
    return this.#places(null);
  }

  /**
   * The places in a place.
   * @param args Which place.
   * @returns The places.
   */
  async requestTreeItemsOf(args: UmbTreeChildrenOfRequestArgs) {
    return this.#places(args.parent.unique);
  }

  /**
   * An item's ancestors, as core's repository reads them: each holds the next, so each is a place.
   * @param args Which item.
   * @returns The ancestors.
   */
  async requestTreeItemAncestors(args: UmbTreeAncestorsOfRequestArgs) {
    return this.#media.requestTreeItemAncestors(args);
  }

  /**
   * A parent's places, in one answer.
   * @param parent The parent's key, or null for the top.
   * @returns The places, or the error when the server did not answer.
   */
  async #places(parent: string | null) {
    let error: unknown;
    const children = await placesIn(
      this.#page(parent, (failed) => (error = failed)),
      this.#search(parent),
      this.#isPlace,
    );
    if (!children) return { error: error as never, asObservable: () => undefined };
    const items = await placesOf(children, (unique) => hasPlace(this.#page(unique), this.#search(unique), this.#isPlace), this.#isPlace);
    return { data: { items, total: items.length, totalBefore: 0, totalAfter: 0 }, asObservable: () => undefined };
  }

  /**
   * Whether a tree item is a place, by its type's insert options as read for its page.
   * @param item The item.
   * @returns True for a place.
   */
  #isPlace = (item: UmbMediaTreeItemModel): boolean => isPlace(item, umbraDesktopMediaTypes.holdsItems(item.mediaType.unique));

  /** Reads a type's insert options from the server, for the page's record of them. */
  #readAllowed: UmbraDesktopReadAllowed = async (type) => (await this.#api.allowedTypes(type, null)).data;

  /**
   * Read one page of a parent's children through core's repository.
   * @param parent The parent's key, or null for the top.
   * @param onError Told when a page failed.
   * @returns The page reader.
   */
  #page(parent: string | null, onError?: (error: unknown) => void): UmbraDesktopTreePage<UmbMediaTreeItemModel> {
    return async (skip, take) => {
      const paging = { skip, take };
      const { data, error } =
        parent === null
          ? await this.#media.requestTreeRootItems({ paging })
          : await this.#media.requestTreeItemsOf({ parent: { unique: parent, entityType: 'media' }, paging });
      if (!data) {
        onError?.(error);
        return undefined;
      }
      await this.#readTypes(data.items);
      return { items: data.items, total: data.total };
    };
  }

  /**
   * Read one page of the places directly under a parent through Umbraco's media search. The search
   * cannot be limited to the top, which it reads as "anywhere", so the top has none: it is read
   * directly to the end, as it is when the search does not answer.
   * @param parent The parent's key, or null for the top.
   * @returns The page reader.
   */
  #search(parent: string | null): UmbraDesktopTreePage<UmbMediaTreeItemModel> {
    return async (skip, take) => {
      if (parent === null) return undefined;
      const types = await umbraDesktopMediaTypes.placeTypes(this.#readAllowed, async () => (await this.#api.folderTypes()).data);
      if (!types?.length) return undefined;
      const { data } = (await tryExecute(
        this,
        MediaService.getItemMediaSearch({ query: { query: SEARCH_EVERYTHING, parentId: parent, allowedMediaTypes: types, trashed: false, skip, take } }),
        { disableNotifications: true },
      )) as { data?: { items: MediaItemResponseModel[]; total: number } };
      if (!data) return undefined;
      const items = data.items.filter((item) => item.parent?.id === parent).map(treeItem);
      await this.#readTypes(items);
      return { items, total: data.total };
    };
  }

  /**
   * Read the insert options of every type among some items, so whether each is a place can be told.
   * @param items The items.
   */
  async #readTypes(items: ReadonlyArray<UmbMediaTreeItemModel>): Promise<void> {
    const types = new Set(items.map((item) => item.mediaType.unique));
    await Promise.all([...types].map((type) => umbraDesktopMediaTypes.allowedChildren(type, this.#readAllowed)));
  }
}

/**
 * A search result as a tree item, mapped as core's media tree source maps its own.
 * @param item The search result.
 * @returns The tree item.
 */
function treeItem(item: MediaItemResponseModel): UmbMediaTreeItemModel {
  return {
    unique: item.id,
    parent: { unique: item.parent?.id ?? null, entityType: item.parent ? 'media' : 'media-root' },
    entityType: 'media',
    hasChildren: item.hasChildren,
    noAccess: false,
    isTrashed: item.isTrashed,
    isFolder: false,
    mediaType: {
      unique: item.mediaType.id,
      icon: item.mediaType.icon,
      collection: item.mediaType.collection ? { unique: item.mediaType.collection.id } : null,
    },
    name: item.variants[0]?.name ?? '',
    variants: item.variants.map((variant) => ({ name: variant.name, culture: variant.culture || null })),
    createDate: '',
    flags: item.flags,
  };
}

export { UmbraDesktopMediaFolderTreeRepository as api };
