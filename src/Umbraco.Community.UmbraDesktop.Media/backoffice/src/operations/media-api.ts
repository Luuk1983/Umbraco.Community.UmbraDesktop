import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { MediaService, MediaTypeService, TemporaryFileService } from '@umbraco-cms/backoffice/external/backend-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';

/**
 * Everything the manager's operations ask the server, behind one seam (plan task 4.1): moving,
 * copying, trashing, restoring and renaming media, and the rules for where media may go. Each call goes
 * through core's own API client, with the person's own permissions, and answers with Umbraco's reason
 * when the server refuses, so a failed item can say why in the server's words (design §7).
 */

/** A media item, as much of it as an operation needs. */
export interface UmbraDesktopMediaRef {
  /** Its key. */
  unique: string;
  /** Its name. */
  name: string;
  /** Its parent's key, null at the root. */
  parent: string | null;
  /** Its media type's key. */
  mediaType: string;
  /** Whether it is a folder: its media type has a collection (plan decision 6). */
  isFolder: boolean;
  /** Whether it is in the recycle bin, when the server said; what an undo checks (plan task 8.1). */
  isTrashed?: boolean;
}

/** One property value of a media item. */
export interface UmbraDesktopMediaValue {
  /** The property's alias. */
  alias: string;
  /** The value. */
  value?: unknown;
  /** The property editor's alias, when the server says it. */
  editorAlias?: string;
  /** Its culture; media are invariant, so null. */
  culture?: string | null;
  /** Its segment. */
  segment?: string | null;
}

/** A media item's full detail, for copying it. */
export interface UmbraDesktopMediaDetail {
  /** Its values. */
  values: UmbraDesktopMediaValue[];
  /** Its names. */
  variants: Array<{ name: string; culture?: string | null; segment?: string | null }>;
  /** Its media type's key. */
  mediaType: string;
}

/** An answer: data, or Umbraco's reason for refusing. */
export interface UmbraDesktopApiResult<T = void> {
  /** The data, when the call worked. */
  data?: T;
  /** Umbraco's reason, when it did not. */
  error?: string;
}

/** What the manager's operations ask the server. */
export interface UmbraDesktopMediaApi {
  /**
   * One item.
   * @param unique Its key.
   */
  item(unique: string): Promise<UmbraDesktopApiResult<UmbraDesktopMediaRef>>;
  /**
   * Several items in one request, as a drag reads every card it might land on.
   * @param uniques Their keys.
   * @returns The items found; one the server does not return is left out.
   */
  items(uniques: ReadonlyArray<string>): Promise<UmbraDesktopApiResult<UmbraDesktopMediaRef[]>>;
  /**
   * The items in a folder.
   * @param parent The folder's key, null for the root.
   */
  children(parent: string | null): Promise<UmbraDesktopApiResult<UmbraDesktopMediaRef[]>>;
  /**
   * An item's detail.
   * @param unique Its key.
   */
  detail(unique: string): Promise<UmbraDesktopApiResult<UmbraDesktopMediaDetail>>;
  /**
   * Create an item.
   * @param model What to create, with the key to give it.
   */
  create(model: {
    unique: string;
    parent: string | null;
    mediaType: string;
    name: string;
    values: UmbraDesktopMediaValue[];
  }): Promise<UmbraDesktopApiResult>;
  /**
   * Save an item's values and names.
   * @param unique Its key.
   * @param model Its values and names.
   */
  update(unique: string, model: Pick<UmbraDesktopMediaDetail, 'values' | 'variants'>): Promise<UmbraDesktopApiResult>;
  /**
   * Move an item.
   * @param unique Its key.
   * @param target The folder's key, null for the root.
   */
  move(unique: string, target: string | null): Promise<UmbraDesktopApiResult>;
  /**
   * Move an item to the recycle bin.
   * @param unique Its key.
   */
  trash(unique: string): Promise<UmbraDesktopApiResult>;
  /**
   * Restore an item from the recycle bin.
   * @param unique Its key.
   * @param target Where to, null for the root.
   */
  restore(unique: string, target: string | null): Promise<UmbraDesktopApiResult>;
  /**
   * Upload a file as a temporary file, for creating an item from it.
   * @param file The file.
   * @param name Its file name.
   * @returns The temporary file's key.
   */
  upload(file: Blob, name: string): Promise<UmbraDesktopApiResult<string>>;
  /**
   * Download a file the site serves.
   * @param url Its address on this site.
   */
  download(url: string): Promise<UmbraDesktopApiResult<Blob>>;
  /**
   * The media types a folder allows, or the root.
   * @param parentType The folder's media type, null for the root.
   * @param parent The folder's key, null for the root.
   * @returns Their keys.
   */
  allowedTypes(parentType: string | null, parent: string | null): Promise<UmbraDesktopApiResult<string[]>>;
}

/**
 * Umbraco's reason for a refusal, as plain text: its problem details' title and detail, or the error's
 * message.
 * @param error What the call failed with.
 * @returns The reason.
 */
export function reasonOf(error: unknown): string {
  const details = (error as { problemDetails?: { title?: string; detail?: string } } | undefined)?.problemDetails;
  const parts = [details?.title, details?.detail].filter((part): part is string => !!part && part.trim().length > 0);
  if (parts.length) return [...new Set(parts)].join(': ');
  return (error as { message?: string } | undefined)?.message || String(error ?? 'Unknown error');
}

/** As much of a media item or tree item as {@link refOf} reads. */
interface UmbraDesktopMediaItemShape {
  id: string;
  parent?: { id: string } | null;
  mediaType: { id: string; collection?: { id: string } | null };
  variants: Array<{ name: string }>;
  isTrashed?: boolean;
}

/**
 * An item from the server, as an operation sees it.
 * @param item The server's item.
 * @returns The ref.
 */
function refOf(item: UmbraDesktopMediaItemShape): UmbraDesktopMediaRef {
  return {
    unique: item.id,
    name: item.variants[0]?.name ?? '',
    parent: item.parent?.id ?? null,
    mediaType: item.mediaType.id,
    isFolder: !!item.mediaType.collection,
    ...(item.isTrashed === undefined ? {} : { isTrashed: item.isTrashed }),
  };
}

/** The real seam, on core's management API client. */
export class UmbraDesktopMediaServerApi implements UmbraDesktopMediaApi {
  /** Where calls are made from; notifications are ours to raise, so core's are off. */
  #host: UmbControllerHost;

  /**
   * @param host The controller host the calls belong to.
   */
  constructor(host: UmbControllerHost) {
    this.#host = host;
  }

  /**
   * Make a call, answering with Umbraco's reason when it fails.
   * @param promise The call.
   * @returns The data or the reason.
   */
  async #call(promise: Promise<unknown>): Promise<UmbraDesktopApiResult<unknown>> {
    const response = (await tryExecute(this.#host, promise, { disableNotifications: true })) as { data?: unknown; error?: unknown };
    if (response.error) return { error: reasonOf(response.error) };
    return { data: response.data };
  }

  /** @inheritdoc */
  async item(unique: string) {
    const { data, error } = await this.#call(MediaService.getItemMedia({ query: { id: [unique] } }));
    if (error) return { error };
    const item = (data as unknown as UmbraDesktopMediaItemShape[] | undefined)?.[0];
    return item ? { data: refOf(item) } : { error: 'Not found' };
  }

  /** @inheritdoc */
  async items(uniques: ReadonlyArray<string>) {
    if (!uniques.length) return { data: [] };
    const found: UmbraDesktopMediaRef[] = [];
    // A few at a time, so the address stays short however many cards a window shows.
    for (let start = 0; start < uniques.length; start += 40) {
      const { data, error } = await this.#call(MediaService.getItemMedia({ query: { id: uniques.slice(start, start + 40) as string[] } }));
      if (error) return { error };
      found.push(...((data as unknown as UmbraDesktopMediaItemShape[] | undefined) ?? []).map(refOf));
    }
    return { data: found };
  }

  /** @inheritdoc */
  async children(parent: string | null) {
    const items: UmbraDesktopMediaRef[] = [];
    const take = 100;
    for (let skip = 0; ; skip += take) {
      const { data, error } = await this.#call(
        parent
          ? MediaService.getTreeMediaChildren({ query: { parentId: parent, skip, take } })
          : MediaService.getTreeMediaRoot({ query: { skip, take } }),
      );
      if (error) return { error };
      const page = data as unknown as { items: UmbraDesktopMediaItemShape[]; total: number };
      items.push(...page.items.map(refOf));
      if (items.length >= page.total || !page.items.length) return { data: items };
    }
  }

  /** @inheritdoc */
  async detail(unique: string) {
    const { data, error } = await this.#call(MediaService.getMediaById({ path: { id: unique } }));
    if (error) return { error };
    const media = data as unknown as { values: UmbraDesktopMediaValue[]; variants: UmbraDesktopMediaDetail['variants']; mediaType: { id: string } };
    return { data: { values: media.values, variants: media.variants, mediaType: media.mediaType.id } };
  }

  /** @inheritdoc */
  async create(model: { unique: string; parent: string | null; mediaType: string; name: string; values: UmbraDesktopMediaValue[] }) {
    const { error } = await this.#call(
      MediaService.postMedia({
        body: {
          id: model.unique,
          parent: model.parent ? { id: model.parent } : null,
          mediaType: { id: model.mediaType },
          variants: [{ name: model.name, culture: null, segment: null }],
          values: model.values.map(({ alias, value, culture, segment }) => ({ alias, value, culture: culture ?? null, segment: segment ?? null })),
        },
      }),
    );
    return error ? { error } : {};
  }

  /** @inheritdoc */
  async update(unique: string, model: Pick<UmbraDesktopMediaDetail, 'values' | 'variants'>) {
    const { error } = await this.#call(
      MediaService.putMediaById({
        path: { id: unique },
        body: {
          values: model.values.map(({ alias, value, culture, segment }) => ({ alias, value, culture: culture ?? null, segment: segment ?? null })),
          variants: model.variants.map(({ name, culture, segment }) => ({ name, culture: culture ?? null, segment: segment ?? null })),
        },
      }),
    );
    return error ? { error } : {};
  }

  /** @inheritdoc */
  async move(unique: string, target: string | null) {
    const { error } = await this.#call(MediaService.putMediaByIdMove({ path: { id: unique }, body: { target: target ? { id: target } : null } }));
    return error ? { error } : {};
  }

  /** @inheritdoc */
  async trash(unique: string) {
    const { error } = await this.#call(MediaService.putMediaByIdMoveToRecycleBin({ path: { id: unique } }));
    return error ? { error } : {};
  }

  /** @inheritdoc */
  async restore(unique: string, target: string | null) {
    const { error } = await this.#call(
      MediaService.putRecycleBinMediaByIdRestore({ path: { id: unique }, body: { target: target ? { id: target } : null } }),
    );
    return error ? { error } : {};
  }

  /** @inheritdoc */
  async upload(file: Blob, name: string) {
    const id = crypto.randomUUID();
    const { error } = await this.#call(
      TemporaryFileService.postTemporaryFile({ body: { Id: id, File: new File([file], name, { type: file.type }) } }),
    );
    return error ? { error } : { data: id };
  }

  /** @inheritdoc */
  async download(url: string) {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) return { error: `${response.status} ${response.statusText}` };
      return { data: await response.blob() };
    } catch (error) {
      return { error: reasonOf(error) };
    }
  }

  /** @inheritdoc */
  async allowedTypes(parentType: string | null, parent: string | null) {
    const { data, error } = await this.#call(
      parentType
        ? MediaTypeService.getMediaTypeByIdAllowedChildren({ path: { id: parentType }, query: { parentContentKey: parent ?? undefined, skip: 0, take: 1000 } })
        : MediaTypeService.getMediaTypeAllowedAtRoot({ query: { skip: 0, take: 1000 } }),
    );
    if (error) return { error };
    return { data: ((data as unknown as { items: Array<{ id: string }> }).items ?? []).map((type) => type.id) };
  }
}
