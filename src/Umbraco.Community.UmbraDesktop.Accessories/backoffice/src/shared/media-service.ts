import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { AREA } from './area.js';

/*
 * Notepad and Paint's line to the media service (`Umbraco.Community.UmbraDesktop.Services.Media`),
 * which opens and saves their files. The types below are copies of the service's, because nothing
 * is imported from another package; `docs/developer/opening-and-saving-media.md` in that package is
 * the contract they copy.
 */

/** A media file, read and ready to edit. A copy of the service's `OpenedMedia`. */
export interface OpenedMedia {
  /** The media item, which a save overwrites. */
  unique: string;
  /** The media item's name, which becomes the document's. */
  name: string;
  /** The file's contents. */
  blob: Blob;
  /** The file's extension, without the dot. */
  extension: string;
  /** When the item was last changed, as it was opened; handed back on save for the conflict check. */
  updateDate?: string | null;
}

/** How opening went. A copy of the service's `MediaOpenResult`. */
export type MediaOpenResult =
  | ({ status: 'opened' } & OpenedMedia)
  | { status: 'cancelled' }
  | {
      status: 'failed';
      /** What was picked, for saying which file could not be read. */
      name?: string;
    };

/** What to save, and where. A copy of the service's `MediaSaveRequest`. */
export interface MediaSaveRequest {
  /** The file, whose name carries the extension the media type is chosen by. */
  file: File;
  /** The media item's name. */
  name: string;
  /** The folder a new item is created in, or null for the root. */
  folder: string | null;
  /** The item this document came from or was last saved as, to overwrite rather than duplicate. */
  existing?: string;
  /** When `existing` was last changed as far as the document knows. Undefined skips the check. */
  expectedUpdateDate?: string | null;
  /** Overwrite `existing` even if it changed since. */
  force?: boolean;
}

/** How a save went. A copy of the service's `MediaSaveResult`. */
export type MediaSaveResult =
  | {
      ok: true;
      /** The media item's key. */
      unique: string;
      /** When the item was last changed, now that this save has changed it. */
      updateDate?: string | null;
    }
  | {
      ok: false;
      /** Nothing was written because somebody else changed the item since. */
      conflict?: true;
      /** Why, in the backoffice's own words where it gave any. */
      message?: string;
    };

/** Where Save As was told to put a new file. A copy of the service's `SaveFolderChoice`. */
export type SaveFolderChoice = { status: 'chosen'; folder: string | null } | { status: 'cancelled' };

/** Let the person pick a file from the media library, and read it. A test hands an element a fake. */
export type MediaOpener = () => Promise<MediaOpenResult>;

/** Save a file as a media item. */
export type MediaSaver = (request: MediaSaveRequest) => Promise<MediaSaveResult>;

/** Ask where a new file goes. */
export type SaveFolderPicker = () => Promise<SaveFolderChoice>;

/** Ask whether to overwrite an item somebody changed; true to overwrite. */
export type OverwriteQuestion = (name: string) => Promise<boolean>;

/** The part of the service's context Notepad and Paint use. */
interface MediaServiceContext extends UmbContextMinimal {
  /** Pick and read a file. */
  open(): Promise<MediaOpenResult>;
  /** Save a file. */
  save(request: MediaSaveRequest): Promise<MediaSaveResult>;
  /** Ask where a new file goes. */
  pickSaveFolder(): Promise<SaveFolderChoice>;
  /** Ask whether to overwrite. */
  confirmOverwrite(name: string): Promise<boolean>;
}

/** The service's context, by its published alias. */
const MEDIA_SERVICE_CONTEXT = new UmbContextToken<MediaServiceContext>('UmbraDesktopMediaContext');

/**
 * How long a call waits for a service it has not heard from yet: an app reopened as the desktop
 * loads can be asked to save before the service's context has finished loading. Short, because
 * without the service the wait is all the person gets.
 */
const SERVICE_WAIT_MS = 500;

/** What a test changes. */
export interface MediaServiceOptions {
  /** How long to wait for the service, in milliseconds. */
  waitMs?: number;
}

/**
 * One app's line to the media service.
 *
 * Accessories depends on the service's package, so the service is there wherever Accessories is. If
 * it is not (a broken install, or a context that failed to load), nothing is opened or saved and the
 * person is told the media library cannot be reached: Open reports a failure, and Save As answers
 * the root so the save reaches the saver, which gives that reason. Nothing is written there.
 *
 * Consumes rather than `getContext`, for the reason Entertainment's Arcade line gives: a consumer has
 * no animation-frame timeout, and is called back when the context arrives late.
 */
export class MediaService extends UmbControllerBase {
  /** The service, once and while provided. */
  #service?: MediaServiceContext;

  /** Resolves the first time the service is provided. */
  readonly #found: Promise<void>;

  /** How long to wait for it. */
  readonly #waitMs: number;

  /** For the one message this line says itself. */
  readonly #localize = new UmbLocalizationController(this);

  /**
   * @param host The app element.
   * @param options What a test changes.
   */
  constructor(host: UmbControllerHost, options: MediaServiceOptions = {}) {
    super(host);
    this.#waitMs = options.waitMs ?? SERVICE_WAIT_MS;
    let found: () => void;
    this.#found = new Promise((resolve) => (found = resolve));
    this.consumeContext(MEDIA_SERVICE_CONTEXT, (service) => {
      this.#service = service;
      if (service) found();
    });
  }

  /**
   * The service, waiting briefly for one that has not been provided yet.
   * @returns The service, or undefined without one.
   */
  async #reach(): Promise<MediaServiceContext | undefined> {
    if (!this.#service) await Promise.race([this.#found, new Promise((resolve) => setTimeout(resolve, this.#waitMs))]);
    return this.#service;
  }

  /** @returns A file from the media library, or why not. */
  open: MediaOpener = async () => {
    const service = await this.#reach();
    return service ? service.open() : { status: 'failed' };
  };

  /**
   * @param request What to save, and where.
   * @returns How it went.
   */
  save: MediaSaver = async (request) => {
    const service = await this.#reach();
    if (service) return service.save(request);
    return { ok: false, message: this.#localize.termOrDefault(`${AREA}_mediaUnavailable`, 'The media library cannot be reached.') };
  };

  /** @returns Where a new file goes; the root without the service, so the save can say why it failed. */
  pickSaveFolder: SaveFolderPicker = async () => {
    const service = await this.#reach();
    return service ? service.pickSaveFolder() : { status: 'chosen', folder: null };
  };

  /**
   * @param name The item's name.
   * @returns True to overwrite; false without the service.
   */
  confirmOverwrite: OverwriteQuestion = async (name) => {
    const service = await this.#reach();
    return service ? service.confirmOverwrite(name) : false;
  };
}
