import { UmbRepositoryBase } from '@umbraco-cms/backoffice/repository';
import { UmbMediaRecycleBinTreeRepository } from '@umbraco-cms/backoffice/media';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { UmbTreeRepository } from '@umbraco-cms/backoffice/tree';
import { binRootName } from './bin-count.js';

/**
 * The recycle bin at the foot of a manager window's tree, as one row that never expands (design §17):
 * what is in it shows in the window that opens it. Its root is core's, so its link and its menu, with
 * Empty recycle bin, are core's too. Its name says how many items are in it (`bin-count.ts`).
 */
export class UmbraDesktopMediaBinTreeRepository extends UmbRepositoryBase implements UmbTreeRepository {
  /** Core's media recycle bin tree repository, for the root. */
  #bin: UmbMediaRecycleBinTreeRepository;

  /** @param host The controller host. */
  constructor(host: UmbControllerHost) {
    super(host);
    this.#bin = new UmbMediaRecycleBinTreeRepository(this);
  }

  /**
   * Core's recycle bin root, with no arrow, named with how many items are at its top.
   * @returns The root.
   */
  async requestTreeRoot() {
    const paging = { skip: 0, take: 0 };
    const [{ data }, { data: top }] = await Promise.all([this.#bin.requestTreeRoot(), this.#bin.requestTreeRootItems({ ...paging, paging })]);
    return { data: data && { ...data, name: binRootName(data.name, top?.total ?? 0), hasChildren: false } };
  }

  /**
   * Nothing under the root, whatever is in the bin.
   * @returns No items.
   */
  async requestTreeRootItems() {
    return { data: { items: [], total: 0 }, asObservable: () => undefined };
  }

  /**
   * Nothing under anything.
   * @returns No items.
   */
  async requestTreeItemsOf() {
    return { data: { items: [], total: 0 }, asObservable: () => undefined };
  }

  /**
   * No ancestors: the tree shows no item to have any.
   * @returns None.
   */
  async requestTreeItemAncestors() {
    return { data: [] };
  }
}

export { UmbraDesktopMediaBinTreeRepository as api };
