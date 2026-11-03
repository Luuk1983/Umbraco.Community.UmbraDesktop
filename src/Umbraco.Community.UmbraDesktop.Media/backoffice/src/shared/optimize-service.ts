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
  /**
   * Told how far the run is whenever that changes: images finished with, of the images in it, the
   * figures the Optimize window gives the taskbar, and the run window's location, which its Show brings
   * forward. Media Health's Done screen reads it (plan Task 1.3a).
   */
  onProgress?: (progress: { completed: number; total: number; location: string }) => void;
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
  /**
   * Open an Optimize images window on files, uploading each through the request's `upload` (#179);
   * resolves when its run ends. Absent from a service older than #179.
   * @param request The files.
   */
  optimizeFiles?(request: OptimizeFilesRequest): Promise<{ status: 'finished' | 'cancelled' | 'not-started' }>;
}

/** The Optimize images app, by its published alias: what Media Health's Show brings forward. */
export const OPTIMIZE_APP = 'Umbraco.Community.UmbraDesktop.Services.Media.OptimizeImages';

/** The service's context, by its published alias. */
export const OPTIMIZE_SERVICE_CONTEXT = new UmbContextToken<OptimizeService>('UmbraDesktopMediaContext');

/** A kind of image, as the guidelines name it. A copy of the service's `OptimizeImageKind` (#179). */
export type OptimizeImageKind = 'jpeg' | 'png-photo' | 'png-transparent' | 'webp' | 'gif';

/** How one upload went. A copy of the service's `OptimizeUploadResult`. */
export interface OptimizeUploadResult {
  /** Whether the file went in. */
  ok: boolean;
  /** Why not, in the person's language. */
  message?: string;
}

/** Files to optimize, then upload one at a time. A copy of the service's `OptimizeFilesRequest` (#179). */
export interface OptimizeFilesRequest {
  /** The files, each with its kind and what it breaks, so the only fixes it gets. */
  files: Array<{ file: File; kind?: OptimizeImageKind; fix?: Array<'size' | 'format' | 'location' | 'upload-limit'> }>;
  /** The starting settings; a field left out is off, a row left out is Keep. */
  settings?: {
    /** The box to fit in, or null for no resize. */
    resize?: { maxWidth?: number; maxHeight?: number } | null;
    /** What each kind is converted to. */
    formats?: Partial<Record<OptimizeImageKind, 'keep' | 'jpeg' | 'png' | 'webp'>>;
    /** 1 to 100, for JPEG and WebP. */
    quality?: number;
    /** Remove location, camera and date. */
    removeLocation?: boolean;
  };
  /** Where the files go, for the window to say. */
  destination: { name: string; path?: string[] };
  /** Plain text under the window's heading. */
  note?: string;
  /**
   * Upload one file, the original or the optimized one.
   * @param file The file.
   */
  upload(file: File): Promise<OptimizeUploadResult>;
}
