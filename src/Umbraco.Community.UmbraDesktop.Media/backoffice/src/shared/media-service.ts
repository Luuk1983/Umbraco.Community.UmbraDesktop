import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/*
 * The Image Editor's line to the media service (`Umbraco.Community.UmbraDesktop.Services.Media`).
 * The types are copies of the service's, as its developer page publishes them, because nothing is
 * imported from another package; Accessories' `shared/media-service.ts` is the model. The editor
 * opens and saves through the service's file menu, so what it needs from the context itself is only
 * whether it is there: the file menu is defined with it, and without it nothing can be opened.
 */

/** A media file, read and ready to edit. A copy of the service's `OpenedMedia`, with issue #136's fields. */
export interface OpenedMedia {
  /** The media item. */
  unique: string;
  /** Its name. */
  name: string;
  /** The file's contents. */
  blob: Blob;
  /** The file's extension, without the dot. */
  extension: string;
  /** When the item was last changed, as it was opened. */
  updateDate?: string | null;
  /** The item's folder, or null for the root. */
  folder?: string | null;
  /** The folder's name. */
  folderName?: string;
  /** The image's focal point as fractions, or null for none. */
  focalPoint?: { left: number; top: number } | null;
  /** The file's own name, which a save over the item keeps. */
  fileName?: string;
}

/** What to save, and where. A copy of the service's `MediaSaveRequest`, with `resetFocalPoint`. */
export interface MediaSaveRequest {
  /** The file. */
  file: File;
  /** The media item's name. */
  name: string;
  /** The folder a new item goes in. */
  folder: string | null;
  /** The item to overwrite. */
  existing?: string;
  /** When `existing` was last changed as far as the document knows. */
  expectedUpdateDate?: string | null;
  /** Overwrite even if it changed since. */
  force?: boolean;
  /** Reset the overwritten item's focal point and named crops. */
  resetFocalPoint?: boolean;
}

/** The part of the service's context the editor reaches for. */
interface MediaServiceContext extends UmbContextMinimal {
  /** Pick and read a file, or the one named. */
  open(options?: { unique?: string }): Promise<unknown>;
}

/** The service's context, by its published alias. */
const MEDIA_SERVICE_CONTEXT = new UmbContextToken<MediaServiceContext>('UmbraDesktopMediaContext');

/** How long to wait for a service not heard from yet, as Accessories waits. */
const SERVICE_WAIT_MS = 500;

/**
 * Whether the media service is there, consumed rather than fetched once, so a context that arrives
 * late is still found.
 */
export class MediaService extends UmbControllerBase {
  /** The service, once and while provided. */
  #service?: MediaServiceContext;

  /** Resolves the first time the service is provided. */
  readonly #found: Promise<void>;

  /** How long to wait for it. */
  readonly #waitMs: number;

  /**
   * @param host The editor element.
   * @param waitMs How long to wait, for a test.
   */
  constructor(host: UmbControllerHost, waitMs: number = SERVICE_WAIT_MS) {
    super(host);
    this.#waitMs = waitMs;
    let found: () => void;
    this.#found = new Promise((resolve) => (found = resolve));
    this.consumeContext(MEDIA_SERVICE_CONTEXT, (service) => {
      this.#service = service;
      if (service) found();
    });
  }

  /** @returns True once the service is there, false if it is not within the wait. */
  async reachable(): Promise<boolean> {
    if (!this.#service) await Promise.race([this.#found, new Promise((resolve) => setTimeout(resolve, this.#waitMs))]);
    return !!this.#service;
  }
}
