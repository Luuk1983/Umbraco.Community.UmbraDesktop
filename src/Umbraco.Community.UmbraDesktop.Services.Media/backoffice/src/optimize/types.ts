/*
 * The published shapes of Optimize images (#139, design §8): what another package copies to call the
 * media context's `optimizeFile` and `optimizeMedia`. Plain data, so that copy is a few types, and
 * each only ever gains optional fields. `docs/developer/optimizing-images.md` publishes them.
 */

/** What to do to an image. Every field is optional, and absent means "leave that alone". */
export interface OptimizeOptions {
  /** Fit the image inside this box, never making it larger; null or absent for no resize. */
  resize?: { maxWidth?: number; maxHeight?: number } | null;
  /** The format to write: `keep` (the default) writes the file's own, PNG for a GIF or BMP. */
  format?: 'keep' | 'jpeg' | 'png' | 'webp';
  /**
   * 1 to 100, for JPEG and WebP; 80 when absent. Given, it is applied even when the format stays the
   * file's own, and the file is then kept only if it came out smaller (found by the owner, 2026-10-25).
   */
  quality?: number;
  /** Remove location, camera and date. Always done when resizing or converting, which encode anew. */
  removeMetadata?: boolean;
  /**
   * What to do with an animated GIF, PNG or WebP: skip it (the default), or keep only its first
   * frame, losing the animation. Owner, 2026-10-21 (design D13).
   */
  animated?: 'skip' | 'first-frame';
}

/** Why an image was left as it was; see {@link OptimizeFileResult}. */
export type UnchangedReason = 'fits' | 'no-metadata' | 'nothing-asked' | 'not-smaller';

/** What an image is: its upright size, its file size and its format. */
export interface ImageFacts {
  /** Upright width, in pixels. */
  width: number;
  /** Upright height, in pixels. */
  height: number;
  /** File size, in bytes. */
  size: number;
  /** The format's name: `jpeg`, `png`, `webp`, `gif` or `bmp`. */
  format: string;
}

/** How optimizing one file went. */
export type OptimizeFileResult =
  | {
      status: 'optimized';
      /** The new file, named as the old one with the new format's extension. */
      file: File;
      /** What the image was. */
      before: ImageFacts;
      /** What it is now. */
      after: ImageFacts;
    }
  | {
      status: 'unchanged';
      /**
       * Why nothing was done, as a code the caller words: `fits` (inside the box, in its own format,
       * nothing to strip), `no-metadata` (only metadata was asked for, and it has none),
       * `nothing-asked` (every option was off), or `not-smaller` (encoded again at the quality asked,
       * in its own format, it came out no smaller, so the original was kept).
       */
      reason: UnchangedReason;
      /** What the image is. */
      before: ImageFacts;
    }
  | {
      status: 'skipped';
      /** Why the file was not touched: not a raster image this can write, a vector image, or animated. */
      reason: 'not-an-image' | 'vector' | 'animated';
    }
  | {
      status: 'failed';
      /** Why, in the browser's words. */
      message: string;
    };

/** Media items to optimize, in a window of their own. */
export interface OptimizeMediaRequest {
  /** Media keys, in the order to process them. Folders and files that are not images are skipped. */
  items: string[];
  /** Starting values for the settings; the person's remembered ones otherwise. */
  options?: OptimizeOptions;
  /** Starting value: replace the originals (the default) or save copies next to them. */
  save?: 'replace' | 'copy';
  /** True: skip the settings view and run at once. */
  start?: boolean;
  /** Plain text for the window's title instead of the folder's name. */
  title?: string;
}

/** What became of one item. */
export interface OptimizeItemReport {
  /** The item's key. */
  unique: string;
  /** Its name. */
  name: string;
  /** What became of it. */
  status: 'optimized' | 'unchanged' | 'skipped' | 'failed' | 'not-started';
  /** What it was, once read. */
  before?: ImageFacts;
  /** What it is now, when optimized. */
  after?: ImageFacts;
  /** The new item's key, when saving copies. */
  copy?: string;
  /** Why it was unchanged, skipped or failed, in the person's language. */
  reason?: string;
}

/** How a run ended. */
export interface OptimizeReport {
  /** Finished, cancelled (Cancel, or the window closed while running), or not started at all. */
  status: 'finished' | 'cancelled' | 'not-started';
  /** Every item, in the order asked. */
  items: OptimizeItemReport[];
  /** Bytes saved over the optimized items; negative when they grew. */
  saved: number;
}

/**
 * A kind of image, as a site's media guidelines name it (#179): a PNG is two, told apart by whether
 * any pixel is transparent, because a PNG photo is better as WebP and a logo is better left alone.
 */
export type OptimizeImageKind = 'jpeg' | 'png-photo' | 'png-transparent' | 'webp' | 'gif';

/**
 * Something a file was found to break, and so a fix it may get. `upload-limit` is a file larger than
 * the site takes in one upload, which is encoded anew to bring it under.
 */
export type OptimizeFix = 'size' | 'format' | 'location' | 'upload-limit';

/** One file to optimize and then upload. */
export interface OptimizeFileEntry {
  /** The file, as it was dropped. */
  file: File;
  /** Its row in the formats; from its format when absent, a PNG counted as a photo. */
  kind?: OptimizeImageKind;
  /**
   * What it breaks, and so the only fixes it gets: `size` resizes it, `format` converts it by its row,
   * `location` removes its metadata, `upload-limit` encodes it anew at the quality, in its row's
   * format. Absent: every fix the settings ask for.
   */
  fix?: OptimizeFix[];
}

/** How one upload went: the caller's answer. */
export interface OptimizeUploadResult {
  /** Whether the file went in. */
  ok: boolean;
  /** Why not, in the person's language. */
  message?: string;
}

/**
 * Files to optimize and upload, in a window of their own (#179): each one optimized in the browser and
 * then handed to the caller's `upload`, one at a time, so each appears where it goes as it lands.
 */
export interface OptimizeFilesRequest {
  /** The files, in the order to process them. */
  files: OptimizeFileEntry[];
  /** Starting values for the settings; a field left out is off, a row left out is Keep. */
  settings?: {
    /** The box to fit in, or null or absent for no resize. */
    resize?: { maxWidth?: number; maxHeight?: number } | null;
    /** What each kind is converted to. */
    formats?: Partial<Record<OptimizeImageKind, 'keep' | 'jpeg' | 'png' | 'webp'>>;
    /** 1 to 100, for JPEG and WebP; 80 when absent. */
    quality?: number;
    /** Remove location, camera and date. */
    removeLocation?: boolean;
  };
  /** Where the files go, for the window to say: the folder's name and its path from the root. */
  destination: { name: string; path?: string[] };
  /** Plain text under the heading, such as where the settings came from. */
  note?: string;
  /**
   * Upload one file, the original or the optimized one, and say how it went. Called once per file at
   * a time, in order.
   * @param file The file.
   */
  upload(file: File): Promise<OptimizeUploadResult>;
  /** Plain text for the window's title instead of the folder's name. */
  title?: string;
}
