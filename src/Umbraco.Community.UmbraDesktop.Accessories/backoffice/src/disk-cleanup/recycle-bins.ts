import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { attempt, isDenied, SECURITY } from '../shared/http.js';

/**
 * Umbraco's two recycle bins, as Disk Cleanup sees them: how much is in each, and emptying one.
 *
 * Umbraco's own endpoints, the ones the backoffice's Empty Recycle Bin action calls, so the server
 * decides who may, exactly as it does in the Content and Media sections. Nothing here is this
 * package's: it adds no permission and bypasses none.
 */

/** The bins, in the order Disk Cleanup lists them. */
export const RECYCLE_BINS = ['content', 'media'] as const;

/** One of the bins. */
export type RecycleBinId = (typeof RECYCLE_BINS)[number];

/** What a bin holds, or why that is not known. */
export type RecycleBinCount =
  | {
      status: 'ok';
      /** Items at the top of the bin. Anything inside them goes with them. */
      total: number;
    }
  | { status: 'denied' }
  | { status: 'failed' };

/** How emptying a bin went. */
export type RecycleBinEmptyResult = { status: 'emptied' } | { status: 'denied' } | { status: 'failed' };

/** The two things Disk Cleanup asks of the server. An interface so tests can answer them. */
export interface RecycleBins {
  /**
   * Count a bin.
   * @param bin The bin.
   */
  count(bin: RecycleBinId): Promise<RecycleBinCount>;
  /**
   * Empty a bin, permanently.
   * @param bin The bin.
   */
  empty(bin: RecycleBinId): Promise<RecycleBinEmptyResult>;
}

/** Each bin's path under the management API: Umbraco calls the content bin the document one. */
const PATHS: Record<RecycleBinId, string> = {
  content: '/umbraco/management/api/v1/recycle-bin/document',
  media: '/umbraco/management/api/v1/recycle-bin/media',
};

/**
 * The real bins, over the backoffice's HTTP client.
 *
 * Counting asks for one item of the bin's root, which is enough to read its total. The total is of
 * the items at the top of the bin, as its tree shows them, not of everything inside them; Disk
 * Cleanup says so rather than walking the whole tree to add them up.
 * @returns The bins.
 */
export function createRecycleBins(): RecycleBins {
  return {
    async count(bin) {
      const { data, error } = await attempt<{ total?: unknown }>(() =>
        umbHttpClient.get({ url: `${PATHS[bin]}/root`, query: { skip: 0, take: 1 }, security: [...SECURITY] }),
      );
      if (error) return isDenied(error) ? { status: 'denied' } : { status: 'failed' };
      return typeof data?.total === 'number' ? { status: 'ok', total: data.total } : { status: 'failed' };
    },
    async empty(bin) {
      const { error } = await attempt(() => umbHttpClient.delete({ url: PATHS[bin], security: [...SECURITY] }));
      if (error) return isDenied(error) ? { status: 'denied' } : { status: 'failed' };
      return { status: 'emptied' };
    },
  };
}
