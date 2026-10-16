import type { UmbraDesktopSearchItem, UmbraDesktopSearchPaging, UmbraDesktopSearchSource } from './types';

/**
 * Adapts core's search providers to desktop search sources. The provider is called directly with a
 * page size, not through the `globalSearch` api, whose `search` passes only the query, so the
 * server's default of 100 would apply to every source on every search (design D4). Calling the
 * document global search's api would also wait forever for a `UMB_VARIANT_CONTEXT` the desktop's
 * top frame never provides.
 */

/** The two sources drawn as full sections; every other is folded (design D2). */
export const UMBRADESKTOP_FULL_SEARCH_ALIASES: ReadonlyArray<string> = ['Umb.GlobalSearch.Document', 'Umb.GlobalSearch.Media'];

/** One culture's name, as core's document and media items carry them. */
interface UmbraDesktopRawVariant {
  /** The culture, or null when invariant. */
  culture?: string | null;
  /** The name in it. */
  name?: string;
}

/**
 * A result as core's providers return it: `UmbSearchResultItemModel` plus the fields documents and
 * media add. Loosely typed, because a third-party provider may return any subset.
 */
export interface UmbraDesktopRawSearchItem {
  /** The key. */
  unique: string;
  /** The entity type. */
  entityType: string;
  /** The name; for documents, core's own comment says it is only the first variant's. */
  name?: string;
  /** The icon, when the item has one of its own. */
  icon?: string | null;
  /** Where it opens, relative to the backoffice. */
  href?: string;
  /** Documents and media: the name per culture. */
  variants?: UmbraDesktopRawVariant[];
  /** Documents: the ancestors, root first. */
  ancestors?: Array<{ name?: string; variants?: UmbraDesktopRawVariant[] }>;
  /** Documents: the type, for its icon. */
  documentType?: { icon?: string | null };
  /** Media: the type, for its icon. */
  mediaType?: { icon?: string | null };
}

/**
 * A name in the current culture: that culture's variant, else the invariant one, else the name the
 * item gave, else any variant's. A variant site shows the editor's own language, as the native
 * search's result element does, rather than whichever culture happens to be first.
 * @param item Something with a name and maybe variants.
 * @param culture The current culture.
 * @returns The name, or undefined when there is none at all.
 */
function nameIn(item: { name?: string; variants?: UmbraDesktopRawVariant[] }, culture?: string): string | undefined {
  const variants = item.variants ?? [];
  return (
    (culture ? variants.find((v) => v.culture === culture)?.name : undefined) ||
    variants.find((v) => !v.culture)?.name ||
    item.name ||
    variants.find((v) => v.name)?.name ||
    undefined
  );
}

/**
 * One raw result as a search item. A result with no name anywhere shows its key rather than an
 * empty row.
 * @param raw What the provider returned.
 * @param culture The current culture.
 * @returns The item.
 */
export function toSearchItem(raw: UmbraDesktopRawSearchItem, culture?: string): UmbraDesktopSearchItem {
  const ancestors = (raw.ancestors ?? []).map((a) => nameIn(a, culture)).filter((n): n is string => !!n);
  return {
    key: `${raw.entityType}:${raw.unique}`,
    name: nameIn(raw, culture) || raw.unique,
    icon: raw.icon || raw.documentType?.icon || raw.mediaType?.icon || 'icon-document',
    detail: ancestors.length ? ancestors.join(' › ') : undefined,
    open: { kind: 'entity', entityType: raw.entityType, unique: raw.unique, href: raw.href },
  };
}

/** The fields of a `globalSearch` manifest a source is built from. */
export interface UmbraDesktopGlobalSearchManifest {
  /** The manifest's alias, which becomes the source's. */
  alias: string;
  /** Its weight; heavier sources come first, as in the native modal's tabs. */
  weight?: number;
  /** Its label and the provider it searches with. */
  meta: { label: string; searchProviderAlias: string };
}

/** Core's `UmbSearchProvider`, as far as a source calls it. */
export interface UmbraDesktopSearchProviderApi {
  /**
   * Search one page.
   * @param args The query, the page and the culture; providers ignore what they do not use.
   */
  search(args: {
    query: string;
    paging: UmbraDesktopSearchPaging;
    culture?: string;
  }): Promise<{ data?: { items: UmbraDesktopRawSearchItem[]; total: number }; error?: unknown }>;
}

/**
 * A source over one core provider. The culture is read on each search, so a language switch while
 * the desktop is open applies to the next search.
 * @param manifest The `globalSearch` manifest.
 * @param provider Its provider's api.
 * @param culture The current culture.
 * @returns The source.
 */
export function umbracoSearchSource(
  manifest: UmbraDesktopGlobalSearchManifest,
  provider: UmbraDesktopSearchProviderApi,
  culture: () => string | undefined,
): UmbraDesktopSearchSource {
  return {
    alias: manifest.alias,
    label: manifest.meta.label,
    weight: manifest.weight ?? 0,
    prominence: UMBRADESKTOP_FULL_SEARCH_ALIASES.includes(manifest.alias) ? 'full' : 'folded',
    async search(query, paging) {
      const current = culture();
      const { data, error } = await provider.search({ query, paging, culture: current });
      if (error || !data) throw error ?? new Error(`${manifest.alias} returned no results object`);
      return { items: data.items.map((item) => toSearchItem(item, current)), total: data.total };
    },
  };
}
