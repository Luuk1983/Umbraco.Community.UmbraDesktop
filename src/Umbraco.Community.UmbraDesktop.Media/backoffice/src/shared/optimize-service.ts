import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

/*
 * The bulk action's line to the media service's Optimize images (#139). The types are copies of the
 * part of the service's published API the action uses, as its developer page
 * (`optimizing-images.md`) publishes them, because nothing is imported from another package. The
 * action ignores the report, so only the request is copied in full.
 */

/** Media items to optimize, in a window of their own. A copy of the service's `OptimizeMediaRequest`. */
export interface OptimizeMediaRequest {
  /** Media keys, in the order to process them; folders and files that are not images are skipped. */
  items: string[];
}

/** The part of the service's context the action reaches for. */
export interface OptimizeService extends UmbContextMinimal {
  /**
   * Open an Optimize images window for the items; resolves when its run ends.
   * @param request The items.
   */
  optimizeMedia(request: OptimizeMediaRequest): Promise<unknown>;
}

/** The service's context, by its published alias. */
export const OPTIMIZE_SERVICE_CONTEXT = new UmbContextToken<OptimizeService>('UmbraDesktopMediaContext');
