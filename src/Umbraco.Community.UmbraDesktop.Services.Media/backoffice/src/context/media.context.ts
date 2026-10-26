import { UmbContextBase, UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbId } from '@umbraco-cms/backoffice/id';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { createMediaOpener } from '../files/media-open.js';
import type { MediaOpenOptions, MediaOpenResult } from '../files/media-open.js';
import { createMediaSaver, createOverwriteQuestion } from '../files/media-save.js';
import type { MediaSaveRequest, MediaSaveResult } from '../files/media-save.js';
import { createSaveFolderPicker } from '../files/save-location.js';
import type { SaveFolderChoice } from '../files/save-location.js';
import { UMBRADESKTOP_MEDIA_CONTEXT } from './media.context-token.js';
// Side-effect imports: the file menu and the open view are defined wherever this context is, so an
// app that finds the context can render `<umbradesktop-media-file-menu>` and
// `<umbradesktop-media-open-view>` by their tags and find them defined. Issue #136.
import '../file-menu/file-menu.element.js';
import '../file-menu/open-view.element.js';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UMB_ACTION_EVENT_CONTEXT } from '@umbraco-cms/backoffice/action';
import {
  UmbEntityUpdatedEvent,
  UmbRequestReloadChildrenOfEntityEvent,
  UmbRequestReloadStructureForEntityEvent,
} from '@umbraco-cms/backoffice/entity-action';
import { extensionOf } from '../files/extension.js';
import { RecentMediaList, browserStorage, recentKeyFor } from '../recent/recent-media.js';
import type { RecentMediaEntry, RecentStorage } from '../recent/recent-media.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { UMBRADESKTOP_OPTIMIZE_APP } from '../optimize/constants.js';
import { backofficeLookups } from '../optimize/lookups.js';
import type { RunLookups } from '../optimize/lookups.js';
import { optimizeFile } from '../optimize/optimize-file.js';
import { readRemembered, rememberedKeyFor, writeRemembered } from '../optimize/remembered.js';
import { OptimizeRunStore } from '../optimize/run-store.js';
import type { RunWords } from '../optimize/run-store.js';
import type { Place } from '../optimize/where-used.js';
import type { OptimizeFileResult, OptimizeMediaRequest, OptimizeOptions, OptimizeReport } from '../optimize/types.js';

/**
 * The four operations, each run on the host it is given. Injectable, so a test needs no picker, no
 * dialog and no server.
 */
export interface MediaContextDeps {
  /** Let the person pick a file from the media library, or open the one named, and read it. */
  open(host: UmbControllerHost, options?: MediaOpenOptions): Promise<MediaOpenResult>;
  /** Save a file as a media item, new or over an existing one. */
  save(host: UmbControllerHost, request: MediaSaveRequest): Promise<MediaSaveResult>;
  /** Ask where in the media library a new file goes. */
  pickSaveFolder(host: UmbControllerHost): Promise<SaveFolderChoice>;
  /** Ask whether to overwrite an item somebody else changed. */
  confirmOverwrite(host: UmbControllerHost, name: string): Promise<boolean>;
  /** What an Optimize images run reads from the media library (#139); the backoffice's own when absent. */
  lookups?(host: UmbControllerHost): RunLookups;
}

/** The real operations: Umbraco's own pickers, dialogs and media repositories. */
const REAL_DEPS: MediaContextDeps = {
  open: (host, options) => createMediaOpener(host)(options),
  save: (host, request) => createMediaSaver(host)(request),
  pickSaveFolder: (host) => createSaveFolderPicker(host)(),
  confirmOverwrite: (host, name) => createOverwriteQuestion(host)(name),
  lookups: (host) => backofficeLookups(host),
};

/** As much of the desktop's window manager as the service uses: `openApp` for a run's window, `entityChanged` after a save. */
interface UmbraDesktopWindows extends UmbContextMinimal {
  /**
   * Open an app at a location.
   * @param alias The app's manifest alias.
   * @param options Where to open it.
   * @returns Whether a window was opened.
   */
  openApp(alias: string, options?: { location?: string }): boolean;
  /**
   * Tell every window showing an entity that it just changed (#176). Optional: a desktop older than
   * this does not have it, and its windows then follow when the server's event arrives.
   * @param entityType The entity type.
   * @param unique The entity's key.
   */
  entityChanged?(entityType: string, unique: string): void;
}

/** The desktop's window manager, by the alias it publishes (`desktop-contexts.md` §5). */
const UMBRADESKTOP_WINDOW_MANAGER = new UmbContextToken<UmbraDesktopWindows>('UmbraDesktopWindowManagerContext');

/** Why an item was skipped, as the dictionary words it. */
const SKIP_WORDS = {
  folder: 'optimizeWhyFolder',
  'no-file': 'optimizeWhyNoFile',
  trashed: 'optimizeWhyTrashed',
  'not-an-image': 'optimizeWhyNotImage',
  vector: 'optimizeWhyVector',
  animated: 'optimizeWhyAnimated',
  missing: 'optimizeWhyMissing',
} as const satisfies Record<string, WordKey>;

/** Why an item was left as it was, as the dictionary words it. */
const UNCHANGED_WORDS = {
  fits: 'optimizeWhyFits',
  'no-metadata': 'optimizeWhyNoMetadata',
  'nothing-asked': 'optimizeWhyNothingAsked',
  'not-smaller': 'optimizeWhyNotSmaller',
} as const satisfies Record<string, WordKey>;

/**
 * The host one call runs on. A controller of the context's, so everything created on it finds the
 * backoffice's contexts through the desktop element, and destroyed when the call is done, which takes
 * everything created on it along.
 */
class MediaCall extends UmbControllerBase {}

/**
 * Opening and saving media library files, for every app on the desktop.
 *
 * **Its methods are published API** (`docs/developer/opening-and-saving-media.md`): another
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

  /** Where the recent lists live: the browser's storage unless a test says otherwise. */
  readonly #storage: RecentStorage | null;

  /**
   * The signed-in user's recent list, or undefined until the current user is known. Nothing is
   * recorded or listed before then, so a file can never land on somebody else's list.
   */
  #recent?: RecentMediaList;

  /** The signed-in user's key, once known: whose Optimize images settings are remembered. */
  #user?: string;

  /** The desktop's window manager, once found, for a run's window. */
  #windows?: UmbraDesktopWindows;

  /** The words this context says itself: a run's title, its copies' names and its failures. */
  readonly #words = wordsOf(new UmbLocalizationController(this));

  /**
   * Every Optimize images run on the desktop (#139, design §8.3), for this package's window to show.
   * Not published: another package starts a run with {@link optimizeMedia} and gets its report.
   */
  readonly optimizeRuns: OptimizeRunStore;

  /**
   * @param host The desktop element.
   * @param deps What a test injects.
   * @param storage Where the recent lists live, for a test; the browser's `localStorage` otherwise.
   */
  constructor(host: UmbControllerHost, deps: MediaContextDeps = REAL_DEPS, storage: RecentStorage | null = browserStorage()) {
    super(host, UMBRADESKTOP_MEDIA_CONTEXT);
    this.#deps = deps;
    this.#storage = storage;
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (user) => {
      this.observe(
        user?.unique,
        (unique) => {
          this.#user = unique ?? undefined;
          this.#recent = unique ? new RecentMediaList(this.#storage, recentKeyFor(unique)) : undefined;
        },
        'umbraDesktopMediaRecentUser',
      );
    });
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER, (windows) => (this.#windows = windows ?? undefined));
    const lookups = (host: UmbControllerHost) => (deps.lookups ?? REAL_DEPS.lookups!)(host);
    this.optimizeRuns = new OptimizeRunStore({
      facts: (uniques) => this.#run((host) => lookups(host).facts(uniques)),
      folderTypes: () => this.#run((host) => lookups(host).folderTypes()),
      folderName: (unique) => this.#run((host) => lookups(host).folderName(unique)),
      folderPath: (unique) => this.#run((host) => lookups(host).folderPath(unique)),
      references: (unique) => this.#run((host) => lookups(host).references(unique)),
      open: (unique) => this.#run((host) => this.#deps.open(host, { unique })),
      save: (request) => this.#saveAndAnnounce(request),
      optimize: (file, options) => optimizeFile(file, options),
      words: this.#runWords(),
      newId: () => UmbId.new(),
      remember: (settings) => (this.#user ? writeRemembered(this.#storage, rememberedKeyFor(this.#user), settings) : undefined),
      remembered: () => (this.#user ? readRemembered(this.#storage, rememberedKeyFor(this.#user)) : undefined),
    });
  }

  /**
   * Thumbnails for a run's rows, through the backoffice's imaging endpoint.
   * @param uniques The images.
   * @returns Each one's thumbnail address, by key; empty when they could not be read.
   */
  optimizeThumbnails(uniques: string[]): Promise<Map<string, string>> {
    return this.#run((host) => (this.#deps.lookups ?? REAL_DEPS.lookups!)(host).thumbnails(uniques)).catch(() => new Map());
  }

  /**
   * Where an image is used, place by place with its path, for Show where (design §16).
   * @param unique The image.
   * @returns The places, or undefined when they could not be read.
   */
  optimizePlaces(unique: string): Promise<Place[] | undefined> {
    return this.#run((host) => (this.#deps.lookups ?? REAL_DEPS.lookups!)(host).places(unique)).catch(() => undefined);
  }

  /** The desktop is going: every run stops after the image in hand, and every caller gets its report. */
  override destroy(): void {
    this.optimizeRuns?.dispose();
    super.destroy();
  }

  /**
   * A run's words, each read from the dictionary when it is said, so a language switched mid-run is
   * the one the rest of the run speaks.
   * @returns The words.
   */
  #runWords(): RunWords {
    const words = (key: WordKey, ...args: unknown[]) => this.#words(key, ...args);
    return {
      titled: (name, count) => words('optimizeTitle', name, count),
      mixed: (count) => words('optimizeTitleMixed', count),
      copyName: (name) => words('optimizeCopyName', name),
      get rootName() {
        return words('optimizeRoot');
      },
      get conflict() {
        return words('optimizeConflict');
      },
      get gone() {
        return words('optimizeGone');
      },
      get unreadable() {
        return words('optimizeUnreadable');
      },
      get refused() {
        return words('optimizeRefused');
      },
      skipped: (reason) => words(SKIP_WORDS[reason]),
      unchanged: (reason) => words(UNCHANGED_WORDS[reason]),
    };
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
   * Let the person pick a file from the media library with Umbraco's media picker, and read it; or,
   * given a key, read that item without the picker. Whether the file suits the app is the app's to
   * decide once it has it.
   * @param options What to open; without a key, the picker asks.
   * @returns The file, or that it was cancelled or could not be read.
   */
  async open(options?: MediaOpenOptions): Promise<MediaOpenResult> {
    const result = await this.#run((host) => this.#deps.open(host, options));
    if (result.status === 'opened') {
      this.#recent?.record({
        unique: result.unique,
        name: result.name,
        extension: result.extension,
        folder: result.folder ?? null,
        folderName: result.folderName,
      });
    }
    return result;
  }

  /**
   * Save a file as a media item: over `existing` when the request names one and it is still there,
   * otherwise as a new item in `folder`. An existing item changed since `expectedUpdateDate` is not
   * overwritten unless the request says `force`; the answer is a conflict instead.
   * @param request What to save, and where.
   * @returns How it went.
   */
  async save(request: MediaSaveRequest): Promise<MediaSaveResult> {
    const result = await this.#saveAndAnnounce(request);
    if (result.ok) {
      // An overwrite stays in its folder and its request says none, so an earlier entry's folder is
      // kept; a new item is in the folder it was saved to, whose name this request does not carry.
      this.#recent?.record(
        { unique: result.unique, name: request.name, extension: extensionOf(request.file.name), folder: request.folder },
        Date.now(),
        { keepFolder: !!request.existing },
      );
    }
    return result;
  }

  /**
   * Save, and tell the windows showing the item, without putting it on the recent list: the half of
   * {@link save} an Optimize images run shares, so fifty images do not push every real entry out of
   * Open recent in the Image Editor, Notepad and Paint (design §6.2, §7.4).
   * @param request What to save, and where.
   * @returns How it went.
   */
  async #saveAndAnnounce(request: MediaSaveRequest): Promise<MediaSaveResult> {
    const result = await this.#run((host) => this.#deps.save(host, request));
    if (result.ok) await this.#announce(request, result.unique);
    return result;
  }

  /**
   * Optimize one image file: resize it, convert it, or strip its metadata (#139, design §8.1). Nothing
   * is saved and nothing shows: for an app that has an image before it reaches the media library.
   * @param file The file, whose name or type says its format.
   * @param options What to do; every field is optional.
   * @returns How it went, with the new file when there is one.
   */
  optimizeFile(file: File, options?: OptimizeOptions): Promise<OptimizeFileResult> {
    return optimizeFile(file, options);
  }

  /**
   * Optimize media items in an Optimize images window of their own (#139, design §8.2): the window
   * opens on its settings, or runs at once with `start`, and this resolves when the run ends. A Retry
   * failed or Run the rest in the same window afterwards is the person's, not reported here.
   * @param request The items and the starting settings.
   * @returns The report: finished, cancelled (Cancel, or the window closed while running), or not
   *   started (Cancel on the settings, or no desktop to open the window on).
   */
  async optimizeMedia(request: OptimizeMediaRequest): Promise<OptimizeReport> {
    const items = [...(request.items ?? [])];
    // Found before the run is made, so a run that starts at once never starts without a window.
    const windows = this.#windows ?? (await this.getContext(UMBRADESKTOP_WINDOW_MANAGER).catch(() => undefined));
    if (!windows) return { status: 'not-started', items: items.map((unique) => ({ unique, name: '', status: 'not-started' })), saved: 0 };
    const { id, report } = this.optimizeRuns.create({ ...request, items });
    if (!windows.openApp(UMBRADESKTOP_OPTIMIZE_APP, { location: id })) this.optimizeRuns.release(id);
    return report;
  }

  /**
   * Tell the windows on the desktop page what a save changed, through core's own action events, as
   * core's media workspace does after its own save (#137). Without it a Media Manager window went on
   * showing the old preview until its folder was loaded again: core clears its thumbnail cache when an
   * item saves, but a card only asks again when it hears the item changed.
   *
   * An overwrite says the item changed (its thumbnails ask for the new address) and asks the
   * collections showing it to load again (its name may have changed too). A new item asks for its
   * folder to load again, so it shows there. A window that is a backoffice page in a frame has an event
   * context of its own and hears none of this; the desktop refreshes those, told here with
   * `entityChanged` as well as by the server's event (#176).
   * @param request What was saved.
   * @param unique The item it was saved as.
   */
  async #announce(request: MediaSaveRequest, unique: string): Promise<void> {
    // The windows and item panes showing an overwritten item, through the desktop itself (#176): the
    // server's event connection can be down or late, and a pane beside the save then kept the old file.
    if (request.existing && request.existing === unique) {
      const windows = this.#windows ?? (await this.getContext(UMBRADESKTOP_WINDOW_MANAGER).catch(() => undefined));
      windows?.entityChanged?.('media', unique);
    }
    let events: EventTarget | undefined;
    try {
      events = await this.getContext(UMB_ACTION_EVENT_CONTEXT);
    } catch {
      return;
    }
    if (!events) return;
    if (request.existing && request.existing === unique) {
      events.dispatchEvent(new UmbEntityUpdatedEvent({ entityType: 'media', unique }));
      events.dispatchEvent(new UmbRequestReloadStructureForEntityEvent({ entityType: 'media', unique }));
    } else {
      const folder = request.folder;
      events.dispatchEvent(new UmbRequestReloadChildrenOfEntityEvent({ entityType: folder ? 'media' : 'media-root', unique: folder }));
    }
  }

  /**
   * The media files this user opened or saved lately through this service, by any app, newest
   * first. Empty until the current user is known, and empty where the browser keeps no storage.
   * @param accept The file extensions to list, without dots; all of them when omitted.
   * @returns The entries. Each may since have been deleted or hidden: open it by key and the open
   *   answers `failed`, or check it first and call {@link forgetRecent}.
   */
  async recent(accept?: readonly string[]): Promise<RecentMediaEntry[]> {
    return this.#recent?.list(accept) ?? [];
  }

  /**
   * Take an item off this user's recent list: one that was deleted, trashed, or can no longer be
   * seen by them.
   * @param unique The item.
   */
  forgetRecent(unique: string): void {
    this.#recent?.forget(unique);
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
