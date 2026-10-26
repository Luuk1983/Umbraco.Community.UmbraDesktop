import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';

/*
 * The bulk action's line to the media service's Optimize images (#139). The types are copies of the
 * part of the service's published API the action uses, as its developer page
 * (`optimizing-images.md`) publishes them, because nothing is imported from another package. The
 * action ignores the report; Media Health reads each optimized image's new size from it (#141), so
 * that much of the report is copied too.
 */

/** Media items to optimize, in a window of their own. A copy of the service's `OptimizeMediaRequest`. */
export interface OptimizeMediaRequest {
  /** Media keys, in the order to process them; folders and files that are not images are skipped. */
  items: string[];
  /** Plain text for the window's title instead of the folder's name: an item's name for a run of one (#176). */
  title?: string;
}

/** One image of a run's report, as far as Media Health reads it. A copy of the service's `OptimizeItemReport`. */
export interface OptimizeItemReport {
  /** The media item's key. */
  unique: string;
  /** How the image came out. */
  status: 'optimized' | 'unchanged' | 'skipped' | 'failed' | 'not-started';
  /** The image after, when it was optimized: its file size in bytes among the rest. */
  after?: { size: number };
}

/** A run's report, as far as Media Health reads it. A copy of the service's `OptimizeReport`. */
export interface OptimizeReport {
  /** How the run ended. */
  status: 'finished' | 'cancelled' | 'not-started';
  /** Every image of the run. */
  items: OptimizeItemReport[];
}

/** The part of the service's context the action reaches for. */
export interface OptimizeService extends UmbContextMinimal {
  /**
   * Open an Optimize images window for the items; resolves with the run's report when it ends.
   * @param request The items.
   */
  optimizeMedia(request: OptimizeMediaRequest): Promise<OptimizeReport>;
}

/** The service's context, by its published alias. */
export const OPTIMIZE_SERVICE_CONTEXT = new UmbContextToken<OptimizeService>('UmbraDesktopMediaContext');
