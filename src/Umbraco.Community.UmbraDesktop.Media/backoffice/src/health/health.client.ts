import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';

/**
 * Every call the window makes to the add-on's own Media Health API (design §15), served by
 * `Health/Api/MediaHealthController.cs`. One module, so the routes and shapes have one home on each
 * side; the C# tests pin the controller's and these tests pin this.
 */

/** Where the API lives: under the management API, on the host's `umbradesktop` prefix. */
export const MEDIA_HEALTH_BASE = '/umbraco/management/api/v1/umbradesktop/media/health';

/**
 * Core's own route for signed resizer URLs of media items (`release-17.6.0`'s
 * `ResizeImagingController`): what an item's thumbnail is asked from, since a site with an HMAC
 * secret refuses an unsigned one, and since core checks there that the person may see the item.
 */
export const CORE_IMAGING_URLS = '/umbraco/management/api/v1/imaging/resize/urls';

/** How many items one ask to core's imaging route names, so its address stays short. */
const IMAGING_BATCH = 40;

/** The most items the server gives per page; it clamps anything larger to this. */
export const MEDIA_HEALTH_PAGE_SIZE = 500;

/** Where a check is, as the server names it. */
export type HealthServerPhase = 'Usage' | 'Disk' | 'Saving' | 'Done' | 'Failed' | 'Stopped';

/** One check: when, who, where it is, and once done, its counts. */
export interface HealthCheck {
  /** The check's number, higher for later checks. */
  id: number;
  /** When it started. */
  startedUtc: string;
  /** When it finished or failed, or null while it runs. */
  finishedUtc: string | null;
  /** Where it is. */
  phase: HealthServerPhase;
  /** What the phase has done. */
  scanned: number;
  /** What it has to do; 0 when not known. */
  total: number;
  /** Why it failed, when it did. */
  error: string | null;
  /** Who pressed Check. */
  startedBy: string | null;
  /** How many items, folders and orphaned files it found, once done. */
  items: number;
  folders: number;
  orphans: number;
  /** The items' size together, and the orphaned files', once done. */
  sizeBytes: number;
  orphanBytes: number;
}

/** The check running, the last one done, and a failure since; each null when there is none. */
export interface HealthStatus {
  running: HealthCheck | null;
  last: HealthCheck | null;
  failed: HealthCheck | null;
  /**
   * The library's items now, folders and the recycle bin left out: what No check yet says the job is
   * before any check has counted it (design §16.3).
   */
  mediaCount: number;
}

/** One media item as the last check classified it. */
export interface HealthItem {
  /** The item's key. */
  key: string;
  /** Its name. */
  name: string;
  /** Its media type's alias, such as `Image`. */
  mediaTypeAlias: string;
  /** Its file's extension without the dot, or null when the item carries none. */
  extension: string | null;
  /** Its file's size, or null when the item carries none. */
  sizeBytes: number | null;
  /** The folder it is in, or null at the root. */
  parentKey: string | null;
  /** The names path of the folder it is in: `/Campaign Assets/2023`, or `/` at the root. */
  path: string;
  /** How many pages are placed on it. */
  usageCount: number;
  /** Whether any page is. */
  used: boolean;
  /**
   * Its first owned file as stored, such as `/media/abc/photo.jpg`: what thumbnails and the preview
   * ask the resizer for (design §16.7). Null for an item without a file, as Engage's images are.
   */
  url: string | null;
  /** Its size in pixels, or null when it has none. */
  width: number | null;
  height: number | null;
  /** When it was last changed, for the preview's "last changed". */
  updatedUtc: string;
}

/** A folder of the library, by key. */
export interface HealthFolder {
  key: string;
  name: string;
  parentKey: string | null;
  path: string;
}

/** One file on disk that no media item owns. */
export interface HealthOrphan {
  /** Its path under the media folder, forward slashes, no leading slash: what a delete names. */
  relativePath: string;
  /** Where the site serves it. */
  url: string;
  /** Its size. */
  sizeBytes: number;
  /** When it was last written. */
  lastModifiedUtc: string;
}

/** How a delete of orphaned files went. */
export interface HealthDeleteResult {
  /** The paths deleted. */
  deleted: string[];
  /** The paths left alone, each with the server's reason: `NotFound` or `NowOwned`. */
  skipped: Array<{ relativePath: string; reason: string }>;
}

/** An answer: the data, or why there is none. `denied` is a 401 or 403; `failed` is anything else. */
export interface HealthResult<T> {
  data?: T;
  error?: 'denied' | 'failed';
}

/** As much of the backoffice's HTTP client as this module uses, so a test can hand in its own. */
export interface HealthHttp {
  get(options: { url: string; query?: Record<string, unknown>; security: ReadonlyArray<{ type: string; scheme: string }> }): Promise<{ data?: unknown; error?: unknown }>;
  post(options: { url: string; body?: unknown; security: ReadonlyArray<{ type: string; scheme: string }> }): Promise<{ data?: unknown; error?: unknown }>;
}

/** Tells `umbHttpClient` to send the backoffice's bearer token, as its own documentation asks. */
const SECURITY = [{ type: 'http', scheme: 'bearer' }] as const;

/**
 * The HTTP status an error carries, whichever shape it arrived in: on the error, or on the problem
 * details inside it.
 * @param error What the call threw or returned.
 * @returns The status, if there is one.
 */
function statusOf(error: unknown): number | undefined {
  const own = (error as { status?: unknown } | null)?.status;
  if (typeof own === 'number') return own;
  const inner = (error as { problemDetails?: { status?: unknown } } | null)?.problemDetails?.status;
  return typeof inner === 'number' ? inner : undefined;
}

/**
 * The Media Health API over the backoffice's HTTP client, which carries the person's login, so a
 * non-admin's delete is refused by the server itself.
 */
export class UmbraDesktopMediaHealthClient {
  /** The HTTP client. */
  #http: HealthHttp;

  /**
   * @param http The HTTP client; the backoffice's own unless a test hands in its own.
   */
  constructor(http: HealthHttp = umbHttpClient as unknown as HealthHttp) {
    this.#http = http;
  }

  /**
   * Run one call, turning a thrown error into a returned one. The backoffice's client throws on every
   * error status in a running backoffice, whatever its types say (Accessories found this against a
   * real Umbraco), so every call goes through here.
   * @param call The request.
   * @returns The data, or the error.
   */
  async #attempt<T>(call: () => Promise<{ data?: unknown; error?: unknown }>): Promise<HealthResult<T>> {
    let error: unknown;
    try {
      const answer = await call();
      if (!answer.error) return { data: answer.data as T };
      error = answer.error;
    } catch (thrown) {
      error = thrown ?? {};
    }
    const status = statusOf(error);
    return { error: status === 401 || status === 403 ? 'denied' : 'failed' };
  }

  /**
   * One GET.
   * @param route The route under the base.
   * @param query Its query.
   */
  #get<T>(route: string, query?: Record<string, unknown>): Promise<HealthResult<T>> {
    return this.#attempt<T>(() => this.#http.get({ url: `${MEDIA_HEALTH_BASE}/${route}`, query, security: SECURITY }));
  }

  /**
   * One POST.
   * @param route The route under the base.
   * @param body Its body.
   */
  #post<T>(route: string, body?: unknown): Promise<HealthResult<T>> {
    return this.#attempt<T>(() => this.#http.post({ url: `${MEDIA_HEALTH_BASE}/${route}`, body, security: SECURITY }));
  }

  /** Where the check is: the one running, the last one done, and a failure since. */
  status(): Promise<HealthResult<HealthStatus>> {
    return this.#get('status');
  }

  /** Start a check, or join the one running; answers with the status. */
  check(): Promise<HealthResult<HealthStatus>> {
    return this.#post('check');
  }

  /** Stop the running check; answers with the status, none running. The last result stands. */
  stop(): Promise<HealthResult<HealthStatus>> {
    return this.#post('check/stop');
  }

  /**
   * Have the stored result follow some items a Clean up changed (design §16.12). The server reads
   * them from Umbraco itself; the window only names them.
   * @param keys The items trashed, restored or optimized.
   */
  refreshItems(keys: ReadonlyArray<string>): Promise<HealthResult<unknown>> {
    return this.#post('items/refresh', { keys: [...keys] });
  }

  /**
   * Every item of the last check, largest first, read a page at a time at the largest page the server
   * gives.
   * @returns The items, or the first page's error.
   */
  async allItems(): Promise<HealthResult<HealthItem[]>> {
    const items: HealthItem[] = [];
    for (let skip = 0; ; skip += MEDIA_HEALTH_PAGE_SIZE) {
      const answer = await this.#get<{ total: number; items: HealthItem[] }>('items', { skip, take: MEDIA_HEALTH_PAGE_SIZE });
      if (!answer.data) return { error: answer.error ?? 'failed' };
      items.push(...answer.data.items);
      // A short page is the last, whatever the total says: the list can shrink while it is read.
      if (answer.data.items.length < MEDIA_HEALTH_PAGE_SIZE || items.length >= answer.data.total) break;
    }
    return { data: items };
  }

  /** Every folder of the last check. */
  async folders(): Promise<HealthResult<HealthFolder[]>> {
    const answer = await this.#get<{ folders: HealthFolder[] }>('folders');
    return answer.data ? { data: answer.data.folders } : { error: answer.error };
  }

  /** Every file of the last check that no item owns, largest first. */
  async orphans(): Promise<HealthResult<HealthOrphan[]>> {
    const answer = await this.#get<{ orphans: HealthOrphan[] }>('orphans');
    return answer.data ? { data: answer.data.orphans } : { error: answer.error };
  }

  /**
   * Signed square thumbnails of media items, by key, from core's own imaging route (design §16.7):
   * Umbraco where it can, and core checks the person may see each item. An item core gives no URL
   * for is left out.
   * @param keys The items.
   * @param edge The edge in device pixels.
   */
  async itemThumbnails(keys: ReadonlyArray<string>, edge: number): Promise<HealthResult<Record<string, string>>> {
    const signed: Record<string, string> = {};
    for (let start = 0; start < keys.length; start += IMAGING_BATCH) {
      const id = keys.slice(start, start + IMAGING_BATCH);
      const answer = await this.#attempt<Array<{ id: string; urlInfos: Array<{ url: string | null }> }>>(() =>
        this.#http.get({ url: CORE_IMAGING_URLS, query: { id, width: edge, height: edge, mode: 'Crop' }, security: SECURITY }),
      );
      if (!answer.data) return { error: answer.error };
      for (const each of answer.data) {
        const url = each.urlInfos.find((info) => info.url)?.url;
        if (url) signed[each.id] = url;
      }
    }
    return { data: signed };
  }

  /**
   * Signed square thumbnails of orphaned files, by URL, from the add-on's own route, since core signs
   * only media items and an orphaned file is none. The server signs only the last check's orphaned
   * files and leaves anything else out.
   * @param urls The orphaned files' URLs.
   * @param edge The edge in device pixels.
   */
  async orphanThumbnails(urls: ReadonlyArray<string>, edge: number): Promise<HealthResult<Record<string, string>>> {
    const answer = await this.#post<{ urls: Record<string, string> }>('orphans/thumbnails', { urls: [...urls], width: edge, height: edge });
    return answer.data ? { data: answer.data.urls } : { error: answer.error };
  }

  /**
   * Delete orphaned files from disk. Administrators only, on the server's side, which checks each
   * file is still orphaned first and reports what it skipped.
   * @param relativePaths The files, as `orphans` named them.
   */
  deleteOrphans(relativePaths: ReadonlyArray<string>): Promise<HealthResult<HealthDeleteResult>> {
    return this.#post('orphans/delete', { relativePaths: [...relativePaths] });
  }
}
