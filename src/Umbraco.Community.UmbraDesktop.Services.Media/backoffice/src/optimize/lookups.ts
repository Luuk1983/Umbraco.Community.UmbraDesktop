import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { MediaTypeService } from '@umbraco-cms/backoffice/external/backend-api';
import { UmbImagingRepository } from '@umbraco-cms/backoffice/imaging';
import { UmbMediaItemRepository, UmbMediaUrlRepository } from '@umbraco-cms/backoffice/media';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import { createReferenceCount } from '../file-menu/deps.js';
import type { ItemFacts } from './triage.js';
import { ROW_THUMBNAIL } from './constants.js';

/**
 * What a run reads from the media library before and while it runs, through the backoffice's own
 * repositories, so permissions and start nodes apply as in the Media section. The run store's tests
 * answer these from tables; these are the real ones.
 */
export interface RunLookups {
  /**
   * What the media library says about items, in two batched requests for the whole selection: the
   * item repository for names, folders, types and the recycle bin, and the URL repository for each
   * file's extension. The item model alone has neither an extension nor a folder flag (design §5.1).
   * @param uniques The items.
   * @returns What it said, by key.
   */
  facts(uniques: string[]): Promise<Map<string, ItemFacts>>;
  /** The media types Umbraco calls folders, as the Media add-on's `media-api.ts` reads them. */
  folderTypes(): Promise<Set<string>>;
  /**
   * A folder's name.
   * @param unique The folder.
   */
  folderName(unique: string): Promise<string | undefined>;
  /**
   * How many places use an item: the file menu's count (#137).
   * @param unique The item.
   */
  references(unique: string): Promise<number | undefined>;
  /**
   * Thumbnail addresses for a run's rows.
   * @param uniques The items.
   * @returns Each image's thumbnail, by key.
   */
  thumbnails(uniques: string[]): Promise<Map<string, string>>;
}

/**
 * The real lookups, each on the host it is given, letting its repository go when it is done.
 * @param host The host one call runs on.
 * @returns The lookups.
 */
export function backofficeLookups(host: UmbControllerHost): RunLookups {
  return {
    facts: async (uniques) => {
      if (!uniques.length) return new Map();
      const items = new UmbMediaItemRepository(host);
      const urls = new UmbMediaUrlRepository(host);
      try {
        const [{ data: found }, { data: addresses }] = await Promise.all([items.requestItems(uniques), urls.requestItems(uniques)]);
        const byKey = new Map((addresses ?? []).map((address) => [address.unique, address]));
        return new Map(
          (found ?? []).map((item) => {
            const address = byKey.get(item.unique);
            const facts: ItemFacts = {
              unique: item.unique,
              name: item.name ?? item.variants?.[0]?.name ?? '',
              parent: (item.parent?.unique as string | null | undefined) ?? null,
              isTrashed: item.isTrashed,
              mediaType: item.mediaType.unique,
              hasUrl: !!address?.url,
              ...(address?.extension ? { extension: address.extension } : {}),
            };
            return [item.unique, facts];
          }),
        );
      } finally {
        items.destroy();
        urls.destroy();
      }
    },
    folderTypes: async () => {
      const response = (await tryExecute(host, MediaTypeService.getItemMediaTypeFolders({ query: { skip: 0, take: 1000 } }), {
        disableNotifications: true,
      })) as { data?: { items?: Array<{ id: string }> } };
      return new Set((response.data?.items ?? []).map((type) => type.id));
    },
    folderName: async (unique) => {
      const items = new UmbMediaItemRepository(host);
      try {
        return (await items.requestItems([unique])).data?.[0]?.name;
      } finally {
        items.destroy();
      }
    },
    references: createReferenceCount(host),
    thumbnails: async (uniques) => {
      if (!uniques.length) return new Map();
      const repository = new UmbImagingRepository(host);
      try {
        // Twice the row's size, for screens at twice the pixel density.
        const { data } = await repository.requestResizedItems(uniques, { width: ROW_THUMBNAIL.w * 2, height: ROW_THUMBNAIL.h * 2 });
        return new Map(data.filter((item) => item.url).map((item) => [item.unique, item.url as string]));
      } finally {
        repository.destroy();
      }
    },
  };
}
