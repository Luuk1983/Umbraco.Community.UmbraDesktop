import { UmbRepositoryBase } from '@umbraco-cms/backoffice/repository';
import { UmbMediaTreeRepository } from '@umbraco-cms/backoffice/media';
import type { UmbMediaTreeItemModel, UmbMediaTreeRootModel } from '@umbraco-cms/backoffice/media';
import { MediaService, MediaTypeService } from '@umbraco-cms/backoffice/external/backend-api';
import type { MediaItemResponseModel } from '@umbraco-cms/backoffice/external/backend-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type {
  UmbTreeAncestorsOfRequestArgs,
  UmbTreeChildrenOfRequestArgs,
  UmbTreeRepository,
  UmbTreeRootItemsRequestArgs,
} from '@umbraco-cms/backoffice/tree';
import { foldersIn, foldersOf, hasFolder } from './folder-tree.js';
import type { UmbraDesktopTreePage } from './folder-tree.js';

/**
 * What Umbraco's media search is asked to match: everything. The search requires some text, and
 * the folders asked for are picked by parent and type, not by name.
 */
const SEARCH_EVERYTHING = '*';

/**
 * The data of the folders-only tree beside a manager window (design §17): core's media tree, asked
 * through core's own repository, with only the folders passed on and an arrow only on a folder that
 * has a folder inside. Core's default tree draws it, so its look, menus, start nodes and reloads stay
 * core's. A folder bigger than one page is asked about through Umbraco's media search instead, so
 * its size costs nothing (`folder-tree.ts` has the rule and its catch).
 *
 * Every parent's folders come back in one answer, whatever page core asks for: the tree pages to keep
 * a long list of items cheap, and a parent's folders are a short one. So core never shows Load more.
 */
export class UmbraDesktopMediaFolderTreeRepository
  extends UmbRepositoryBase
  implements UmbTreeRepository<UmbMediaTreeItemModel, UmbMediaTreeRootModel>
{
  /** Core's media tree repository, which this one asks. */
  #media: UmbMediaTreeRepository;

  /**
   * The media types Umbraco calls folders (no file, and allowing children), which the search is
   * limited to; read once, and undefined when the server did not say.
   */
  #folderTypes?: Promise<string[] | undefined>;

  /** @param host The controller host. */
  constructor(host: UmbControllerHost) {
    super(host);
    this.#media = new UmbMediaTreeRepository(this);
  }

  /**
   * The Media root, with an arrow only when a folder is at the top.
   * @returns The root.
   */
  async requestTreeRoot() {
    const { data } = await this.#media.requestTreeRoot();
    if (!data) return { data };
    return { data: { ...data, hasChildren: data.hasChildren && (await hasFolder(this.#page(null), this.#search(null))) } };
  }

  /**
   * The folders at the top.
   * @param _args What core asks for; every folder is answered.
   * @returns The folders.
   */
  async requestTreeRootItems(_args: UmbTreeRootItemsRequestArgs) {
    return this.#folders(null);
  }

  /**
   * The folders in a folder.
   * @param args Which folder.
   * @returns The folders.
   */
  async requestTreeItemsOf(args: UmbTreeChildrenOfRequestArgs) {
    return this.#folders(args.parent.unique);
  }

  /**
   * An item's ancestors, as core's repository reads them: they are all folders.
   * @param args Which item.
   * @returns The ancestors.
   */
  async requestTreeItemAncestors(args: UmbTreeAncestorsOfRequestArgs) {
    return this.#media.requestTreeItemAncestors(args);
  }

  /**
   * A parent's folders, in one answer.
   * @param parent The parent's key, or null for the top.
   * @returns The folders, or the error when the server did not answer.
   */
  async #folders(parent: string | null) {
    let error: unknown;
    const children = await foldersIn(
      this.#page(parent, (failed) => (error = failed)),
      this.#search(parent),
    );
    if (!children) return { error: error as never, asObservable: () => undefined };
    const items = await foldersOf(children, (unique) => hasFolder(this.#page(unique), this.#search(unique)));
    return { data: { items, total: items.length, totalBefore: 0, totalAfter: 0 }, asObservable: () => undefined };
  }

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
          ? await this.#media.requestTreeRootItems({ skip, take, paging })
          : await this.#media.requestTreeItemsOf({ parent: { unique: parent, entityType: 'media' }, skip, take, paging });
      if (!data) onError?.(error);
      return data ? { items: data.items, total: data.total } : undefined;
    };
  }

  /**
   * Read one page of the folders directly under a parent through Umbraco's media search. The search
   * cannot be limited to the top, which it reads as "anywhere", so the top has none: it is read
   * directly to the end, as it is when the search does not answer.
   * @param parent The parent's key, or null for the top.
   * @returns The page reader.
   */
  #search(parent: string | null): UmbraDesktopTreePage<UmbMediaTreeItemModel> {
    return async (skip, take) => {
      if (parent === null) return undefined;
      const types = await this.#readFolderTypes();
      if (!types?.length) return undefined;
      const { data } = (await tryExecute(
        this,
        MediaService.getItemMediaSearch({ query: { query: SEARCH_EVERYTHING, parentId: parent, allowedMediaTypes: types, trashed: false, skip, take } }),
        { disableNotifications: true },
      )) as { data?: { items: MediaItemResponseModel[]; total: number } };
      if (!data) return undefined;
      return { items: data.items.filter((item) => item.parent?.id === parent).map(treeItem), total: data.total };
    };
  }

  /**
   * The media types Umbraco calls folders, read once.
   * @returns Their keys, or undefined when the server did not say.
   */
  #readFolderTypes(): Promise<string[] | undefined> {
    this.#folderTypes ??= (async () => {
      const { data } = (await tryExecute(this, MediaTypeService.getItemMediaTypeFolders({ query: { skip: 0, take: 1000 } }), {
        disableNotifications: true,
      })) as { data?: { items: Array<{ id: string }> } };
      return data?.items.map((type) => type.id);
    })();
    return this.#folderTypes;
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
