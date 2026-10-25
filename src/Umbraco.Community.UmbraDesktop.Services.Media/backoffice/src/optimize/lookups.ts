import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { MediaTypeService } from '@umbraco-cms/backoffice/external/backend-api';
import { UmbImagingRepository } from '@umbraco-cms/backoffice/imaging';
import { UmbMediaItemRepository, UmbMediaReferenceRepository, UmbMediaTreeRepository, UmbMediaUrlRepository } from '@umbraco-cms/backoffice/media';
import { UmbDocumentTreeRepository } from '@umbraco-cms/backoffice/document';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import { createReferenceCount } from '../file-menu/deps.js';
import type { ItemFacts } from './triage.js';
import type { Place } from './where-used.js';
import { ROW_THUMBNAIL } from './constants.js';

/** How many places of one image Show where reads: more than anyone reads in a dialog, fewer than a page of paths. */
const PLACES_READ = 100;

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
   * A folder's path from the media library root, by name, itself last (design §16).
   * @param unique The folder.
   * @returns The names, or undefined when they could not be read.
   */
  folderPath(unique: string): Promise<string[] | undefined>;
  /**
   * How many places use an item: the file menu's count (#137).
   * @param unique The item.
   */
  references(unique: string): Promise<number | undefined>;
  /**
   * Where an image is used, place by place with its path, for Show where (design §16).
   * @param unique The image.
   * @returns The places, or undefined when they could not be read.
   */
  places(unique: string): Promise<Place[] | undefined>;
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
    folderPath: async (unique) => {
      // The media tree's ancestors of an item, root first, as the Media section's breadcrumb reads them.
      const tree = new UmbMediaTreeRepository(host);
      try {
        const { data } = await tree.requestTreeItemAncestors({ treeItem: { unique, entityType: 'media' } });
        if (!data) return undefined;
        const names = data.map((item) => item.name);
        if (data[data.length - 1]?.unique !== unique) {
          const own = (await new UmbMediaItemRepository(host).requestItems([unique])).data?.[0]?.name;
          if (own) names.push(own);
        }
        return names;
      } finally {
        tree.destroy();
      }
    },
    references: createReferenceCount(host),
    places: async (unique) => {
      const references = new UmbMediaReferenceRepository(host);
      const documents = new UmbDocumentTreeRepository(host);
      const media = new UmbMediaTreeRepository(host);
      try {
        const { data, error } = await references.requestReferencedBy(unique, 0, PLACES_READ);
        if (error || !data) return undefined;
        // Each place's path from its tree's ancestors, all at once: Umbraco's reference model carries a
        // name and a type, never where the place is.
        return await Promise.all(
          data.items.map(async (item) => {
            const reference = item as typeof item & {
              name?: string | null;
              variants?: Array<{ name?: string }>;
              documentType?: { icon?: string };
              mediaType?: { icon?: string };
              memberType?: { icon?: string };
            };
            const kind: Place['kind'] = item.entityType === 'document' ? 'document' : item.entityType === 'media' ? 'media' : item.entityType === 'member' ? 'member' : 'other';
            const name = reference.variants?.[0]?.name || reference.name || item.unique || '';
            const icon = reference.documentType?.icon ?? reference.mediaType?.icon ?? reference.memberType?.icon;
            const tree = kind === 'document' ? documents : kind === 'media' ? media : undefined;
            let path: string[] = [];
            if (tree && item.unique) {
              const { data: ancestors } = await tree.requestTreeItemAncestors({ treeItem: { unique: item.unique, entityType: item.entityType } }).catch(() => ({ data: undefined }));
              path = (ancestors ?? []).filter((ancestor) => ancestor.unique !== item.unique).map((ancestor) => ancestor.name);
            }
            return { kind, name, path, ...(icon ? { icon } : {}) };
          }),
        );
      } finally {
        references.destroy();
        documents.destroy();
        media.destroy();
      }
    },
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
