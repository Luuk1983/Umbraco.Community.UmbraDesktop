import { UmbContextBase, UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { createMediaOpener } from '../files/media-open.js';
import type { MediaOpenResult } from '../files/media-open.js';
import { createMediaSaver, createOverwriteQuestion } from '../files/media-save.js';
import type { MediaSaveRequest, MediaSaveResult } from '../files/media-save.js';
import { createSaveFolderPicker } from '../files/save-location.js';
import type { SaveFolderChoice } from '../files/save-location.js';
import { UMBRADESKTOP_MEDIA_CONTEXT } from './media.context-token.js';

/**
 * The four operations, each run on the host it is given. Injectable, so a test needs no picker, no
 * dialog and no server.
 */
export interface MediaContextDeps {
  /** Let the person pick a file from the media library, and read it. */
  open(host: UmbControllerHost): Promise<MediaOpenResult>;
  /** Save a file as a media item, new or over an existing one. */
  save(host: UmbControllerHost, request: MediaSaveRequest): Promise<MediaSaveResult>;
  /** Ask where in the media library a new file goes. */
  pickSaveFolder(host: UmbControllerHost): Promise<SaveFolderChoice>;
  /** Ask whether to overwrite an item somebody else changed. */
  confirmOverwrite(host: UmbControllerHost, name: string): Promise<boolean>;
}

/** The real operations: Umbraco's own pickers, dialogs and media repositories. */
const REAL_DEPS: MediaContextDeps = {
  open: (host) => createMediaOpener(host)(),
  save: (host, request) => createMediaSaver(host)(request),
  pickSaveFolder: (host) => createSaveFolderPicker(host)(),
  confirmOverwrite: (host, name) => createOverwriteQuestion(host)(name),
};

/**
 * The host one call runs on. A controller of the context's, so everything created on it finds the
 * backoffice's contexts through the desktop element, and destroyed when the call is done, which takes
 * everything created on it along.
 */
class MediaCall extends UmbControllerBase {}

/**
 * Opening and saving media library files, for every app on the desktop.
 *
 * **Its four methods are published API** (`docs/developer/opening-and-saving-media.md`): another
 * package declares the part it uses and a token with this context's alias, and imports nothing.
 * They take and return plain data, so that declaration is a copy of a few types, and a method only
 * ever gains optional fields.
 *
 * A desktop context rather than a global one, as the Arcade's is: the apps that use it are elements
 * on the desktop, and nothing outside the desktop does.
 */
export class UmbraDesktopMediaContext extends UmbContextBase {
  /** The operations, real unless a test says otherwise. */
  readonly #deps: MediaContextDeps;

  /**
   * @param host The desktop element.
   * @param deps What a test injects.
   */
  constructor(host: UmbControllerHost, deps: MediaContextDeps = REAL_DEPS) {
    super(host, UMBRADESKTOP_MEDIA_CONTEXT);
    this.#deps = deps;
  }

  /**
   * Run one call on a host of its own.
   *
   * The operations create backoffice repositories and a localization controller on the host they are
   * given. In an app they were given the app element, which took them along when the window closed.
   * This context lives as long as the desktop, so given the context itself they would pile up for the
   * whole visit; a host per call is let go as soon as the call is done, failed or not.
   * @param work The operation.
   * @returns What it answered.
   */
  async #run<T>(work: (host: UmbControllerHost) => Promise<T>): Promise<T> {
    const call = new MediaCall(this);
    try {
      return await work(call);
    } finally {
      call.destroy();
    }
  }

  /**
   * Let the person pick a file from the media library with Umbraco's media picker, and read it.
   * Whether the file suits the app is the app's to decide once it has it.
   * @returns The file, or that it was cancelled or could not be read.
   */
  open(): Promise<MediaOpenResult> {
    return this.#run((host) => this.#deps.open(host));
  }

  /**
   * Save a file as a media item: over `existing` when the request names one and it is still there,
   * otherwise as a new item in `folder`. An existing item changed since `expectedUpdateDate` is not
   * overwritten unless the request says `force`; the answer is a conflict instead.
   * @param request What to save, and where.
   * @returns How it went.
   */
  save(request: MediaSaveRequest): Promise<MediaSaveResult> {
    return this.#run((host) => this.#deps.save(host, request));
  }

  /**
   * Ask where a new file goes, with Umbraco's media tree picker opened on the folder chosen last.
   * @returns The folder, or that it was cancelled.
   */
  pickSaveFolder(): Promise<SaveFolderChoice> {
    return this.#run((host) => this.#deps.pickSaveFolder(host));
  }

  /**
   * Ask, in Umbraco's confirm dialog, whether to overwrite an item somebody else changed.
   * @param name The item's name, for the question.
   * @returns True to overwrite.
   */
  confirmOverwrite(name: string): Promise<boolean> {
    return this.#run((host) => this.#deps.confirmOverwrite(host, name));
  }
}

export { UmbraDesktopMediaContext as api };
