import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';
import { contentHash, unversionedBase, versionedFileName } from '../file-menu/formats.js';
import { extensionOf } from '../files/extension.js';
import type { MediaOpenResult } from '../files/media-open.js';
import type { MediaSaveRequest, MediaSaveResult } from '../files/media-save.js';
import type { NormalisedOptions } from './options.js';
import { optionsOf, startingSettings } from './remembered.js';
import type { OptimizeSettings } from './remembered.js';
import { formatOfExtension } from './picture.js';
import type { RasterFormat } from './picture.js';
import { triage, windowTitle } from './triage.js';
import type { ItemFacts, SkipReason, TitleWords } from './triage.js';
import { filesSettings, kindOfFormat, optionsForFile } from './file-fixes.js';
import type {
  ImageFacts,
  OptimizeFileResult,
  OptimizeFilesRequest,
  OptimizeFix,
  OptimizeImageKind,
  OptimizeItemReport,
  OptimizeMediaRequest,
  OptimizeReport,
  UnchangedReason,
} from './types.js';

/** The words a run says, in the person's language: its title, a copy's name, and why items did not go. */
export interface RunWords extends TitleWords {
  /**
   * A copy's name (D12).
   * @param name The original's name.
   */
  copyName(name: string): string;
  /** The media library root's name, for a window whose images are all at the root. */
  rootName: string;
  /**
   * A run on files' title (#179): "Optimize and upload: Products (3)".
   * @param name The folder's name, or the caller's title.
   * @param count How many files.
   */
  uploadTitled(name: string, count: number): string;
  /** The caller's upload said no without a reason. */
  uploadFailed: string;
  /** Somebody else saved the item between its open and its save (design §7.1). */
  conflict: string;
  /** The item was in the recycle bin when it was opened (design §6.2). */
  gone: string;
  /** The item could not be read. */
  unreadable: string;
  /** The save was refused without a reason. */
  refused: string;
  /**
   * Why an item was skipped, for the report.
   * @param reason The reason's code.
   */
  skipped(reason: SkipReason): string;
  /**
   * Why an item was left as it was, for the report.
   * @param reason The reason's code.
   */
  unchanged(reason: UnchangedReason): string;
}

/**
 * What a run asks of the backoffice and the desktop. Injectable, so a test answers from tables; the
 * media context builds the real ones (`lookups.ts`, and its own opener and saver).
 */
export interface RunDeps {
  /**
   * What the media library says about items, in a few batched requests (design §5.1).
   * @param uniques The items.
   * @returns What it said, by key; an item it did not return is missing.
   */
  facts(uniques: string[]): Promise<Map<string, ItemFacts>>;
  /** The media types Umbraco calls folders. */
  folderTypes(): Promise<Set<string>>;
  /**
   * A folder's name, for the window's title.
   * @param unique The folder.
   */
  folderName(unique: string): Promise<string | undefined>;
  /**
   * A folder's path from the media library root, by name, itself last, for the settings' introduction
   * (design §16).
   * @param unique The folder.
   * @returns The names, or undefined when they could not be read.
   */
  folderPath(unique: string): Promise<string[] | undefined>;
  /**
   * How many places use an item, for the warning before replacing (design §5.1).
   * @param unique The item.
   * @returns The count, or undefined when it could not be read.
   */
  references(unique: string): Promise<number | undefined>;
  /**
   * Read an item, past the recent list (design §6.2).
   * @param unique The item.
   */
  open(unique: string): Promise<MediaOpenResult>;
  /**
   * Save a file, past the recent list but announcing it to the windows showing the item (§7.4).
   * @param request What to save.
   */
  save(request: MediaSaveRequest): Promise<MediaSaveResult>;
  /**
   * Optimize one file: `optimizeFile`, unless a test says otherwise.
   * @param file The file.
   * @param options What to do.
   */
  optimize(file: File, options: NormalisedOptions): Promise<OptimizeFileResult>;
  /** The words. */
  words: RunWords;
  /** A run id that no window from before a reload can name. */
  newId(): string;
  /**
   * Keep the settings a run started with for this person's next run.
   * @param settings The settings.
   */
  remember(settings: OptimizeSettings): void;
  /** This person's last settings, if any. */
  remembered(): OptimizeSettings | undefined;
}

/** Where one item of a run is. */
export type RunItemStatus = 'waiting' | 'running' | 'optimized' | 'unchanged' | 'skipped' | 'failed' | 'not-started';

/** One item of a run, as its window shows it. */
export interface RunItem {
  /** The media item's key. */
  unique: string;
  /** Its name. */
  name: string;
  /** Its folder, or null at the root. */
  parent: string | null;
  /** Its file's format, from its extension, for the warning before a run that grows files (§16). */
  format?: RasterFormat;
  /** Where it is. */
  status: RunItemStatus;
  /** Why it was skipped. */
  skip?: SkipReason;
  /** Why it was left as it was. */
  unchanged?: UnchangedReason;
  /** What it was, once read. */
  before?: ImageFacts;
  /** What it is now. */
  after?: ImageFacts;
  /** The copy's key, when saving copies. */
  copy?: string;
  /** Why it failed. */
  message?: string;
  /** A run on files: its row in the formats (#179). */
  kind?: OptimizeImageKind;
  /** A run on files: what the caller found it breaks, so the only fixes it gets; every fix when absent. */
  fix?: OptimizeFix[];
  /** A run on files: it has been uploaded, optimized or as it was. */
  uploaded?: true;
  /** A run on files: it was uploaded as it was dropped after failing, by Upload the original. */
  original?: true;
  /** A run on files: the item in hand has been optimized and is being uploaded. */
  stage?: 'uploading';
}

/** One run, as its window shows it. Published as plain data, a fresh copy on every change. */
export interface OptimizeRun {
  /** Its id: the window's location. */
  id: string;
  /**
   * What it works on: media items, saved over or copied (#139), or files, uploaded as each is done
   * (#179). Absent is media, as every run was before files.
   */
  mode?: 'media' | 'files';
  /** A run on files: where they are uploaded to. */
  destination?: OptimizeFilesRequest['destination'];
  /** A run on files: the caller's line under the heading. */
  note?: string;
  /** Its window's title. */
  title: string;
  /** Reading the selection, choosing settings, running, or ended. */
  phase: 'preparing' | 'settings' | 'running' | 'ended';
  /** What it runs with. */
  settings: OptimizeSettings;
  /** Every item asked for, in order. */
  items: RunItem[];
  /**
   * How many images are used and in how many places, and which, for the note before replacing and its
   * Show where (§16); undefined while counting, null when it could not.
   */
  usage?: { images: number; places: number; used: Array<{ unique: string; name: string; count: number }> } | null;
  /**
   * Where the images come from, for the settings' introduction: one folder's path from the root (empty
   * at the root itself), or how many folders when there are several. Undefined while preparing.
   */
  from?: { path: string[] } | { folders: number };
  /** How the last pass ended. */
  outcome?: 'finished' | 'cancelled';
  /** Cancel was pressed, and the item in hand is finishing. */
  cancelling: boolean;
  /** How many passes have run: the first, then one per Retry failed, Run the rest or animated run. */
  pass: number;
}

/** What the store keeps for a run beside what it shows. */
interface RunEntry {
  /** What the window shows. Mutated here, published as a copy. */
  run: OptimizeRun;
  /** Resolves the caller's report, once. */
  resolve(report: OptimizeReport): void;
  /** Whether the caller has had its report. */
  reported: boolean;
  /** The window closed: drop the run once its pass stops. */
  released: boolean;
  /** Whether a pass is going. */
  looping: boolean;
  /** A run on files: the files, by item index, kept here rather than in the run that is copied out. */
  files?: File[];
  /** A run on files: the caller's upload. */
  upload?: OptimizeFilesRequest['upload'];
}

/** How a pass treats the items it runs: optimized as asked, or uploaded as they were dropped. */
type PassKind = 'optimize' | 'original';

/** How many reference counts are asked at once while the settings show (design §13). */
const REFERENCE_LOOKUPS_AT_ONCE = 4;

/**
 * A run's report: what became of each item, and the bytes saved (design §8.2).
 * @param run The run.
 * @param words Why items did not go, in words.
 * @param status How it ended, when not its outcome.
 * @returns The report.
 */
export function reportOf(run: OptimizeRun, words: Pick<RunWords, 'skipped' | 'unchanged'>, status?: OptimizeReport['status']): OptimizeReport {
  const items = run.items.map((item): OptimizeItemReport => {
    const done = item.status === 'waiting' || item.status === 'running' ? 'not-started' : item.status;
    const reason = item.status === 'skipped' && item.skip ? words.skipped(item.skip) : item.status === 'unchanged' && item.unchanged ? words.unchanged(item.unchanged) : item.message;
    return {
      unique: item.unique,
      name: item.name,
      status: done,
      ...(item.before ? { before: item.before } : {}),
      ...(item.after ? { after: item.after } : {}),
      ...(item.copy ? { copy: item.copy } : {}),
      ...(reason ? { reason } : {}),
    };
  });
  const saved = run.items.reduce((sum, item) => sum + (item.status === 'optimized' && item.before && item.after ? item.before.size - item.after.size : 0), 0);
  return { status: status ?? run.outcome ?? 'not-started', items, saved };
}

/**
 * Every Optimize images run on the desktop, by id (design §8.3). Kept in Services.Media's desktop
 * context, as the Media add-on's Transfers store keeps its transfers, so a run outlives the window
 * that started it, and the Optimize images window is a view of a run rather than its owner.
 *
 * A run reads its selection, waits on the settings view, then optimizes one item at a time: open it
 * afresh, optimize the file, save it. One item failing never stops the rest. Cancel lets the item in
 * hand finish. Retry failed, Run the rest and the animated run are further passes over the same run.
 */
export class OptimizeRunStore {
  /** What the store asks of the backoffice. */
  readonly #deps: RunDeps;

  /** The runs, by id, in the order they started. */
  readonly #entries = new Map<string, RunEntry>();

  /** What the windows show. */
  readonly #state = new UmbArrayState<OptimizeRun>([], (run) => run.id);

  /** Every run, as it changes. */
  readonly runs: Observable<OptimizeRun[]> = this.#state.asObservable();

  /**
   * @param deps What the store asks of the backoffice.
   */
  constructor(deps: RunDeps) {
    this.#deps = deps;
  }

  /**
   * A run now.
   * @param id The run.
   * @returns A copy of it, or undefined when there is none, as after a reload.
   */
  get(id: string): OptimizeRun | undefined {
    const entry = this.#entries.get(id);
    return entry ? structuredClone(entry.run) : undefined;
  }

  /**
   * One run as it changes, for its window.
   * @param id The run.
   * @returns The run, and undefined once it is dropped or when there never was one.
   */
  observe(id: string): Observable<OptimizeRun | undefined> {
    return this.#state.asObservablePart((runs) => runs.find((run) => run.id === id));
  }

  /**
   * Start a run: read the selection, then wait on the settings, or run at once with `start`.
   * @param request What the caller asked for.
   * @returns The run's id, and its report, which resolves when its first pass ends or it is let go.
   */
  create(request: OptimizeMediaRequest): { id: string; report: Promise<OptimizeReport> } {
    const id = this.#deps.newId();
    let resolve!: (report: OptimizeReport) => void;
    const report = new Promise<OptimizeReport>((done) => (resolve = done));
    const run: OptimizeRun = {
      id,
      title: '',
      phase: 'preparing',
      settings: startingSettings(request, this.#deps.remembered()),
      items: request.items.map((unique) => ({ unique, name: '', parent: null, status: 'waiting' })),
      cancelling: false,
      pass: 0,
    };
    this.#entries.set(id, { run, resolve, reported: false, released: false, looping: false });
    this.#publish();
    void this.#prepare(id, request);
    return { id, report };
  }

  /**
   * Start a run on files (#179): nothing is read from the media library, and each file is uploaded
   * through the caller's `upload` as it is done. It starts at once, with no settings to confirm: the
   * caller chose them, and the person already chose Optimize where the files were listed. A settings
   * step after that asked the same question twice (owner, after the first real run).
   * @param request What the caller asked for.
   * @returns The run's id, and its report, which resolves when its first pass ends or it is let go.
   */
  createFiles(request: OptimizeFilesRequest): { id: string; report: Promise<OptimizeReport> } {
    const id = this.#deps.newId();
    let resolve!: (report: OptimizeReport) => void;
    const report = new Promise<OptimizeReport>((done) => (resolve = done));
    const entries = [...(request.files ?? [])];
    const items: RunItem[] = entries.map((entry, index) => {
      const format = formatOfExtension(extensionOf(entry.file.name) || entry.file.type.replace(/^image\//, ''));
      const raster = format && format !== 'svg' ? format : undefined;
      const kind = entry.kind ?? kindOfFormat(raster);
      return {
        unique: `file-${index}`,
        name: entry.file.name,
        parent: null,
        status: 'waiting',
        ...(raster ? { format: raster } : {}),
        ...(kind ? { kind } : {}),
        ...(entry.fix ? { fix: [...entry.fix] } : {}),
      };
    });
    const destination = { name: request.destination?.name ?? '', ...(request.destination?.path ? { path: [...request.destination.path] } : {}) };
    const run: OptimizeRun = {
      id,
      mode: 'files',
      destination,
      ...(request.note ? { note: request.note } : {}),
      title: this.#deps.words.uploadTitled(request.title || destination.name, items.length),
      phase: 'settings',
      settings: filesSettings(request.settings ?? {}),
      items,
      from: { path: destination.path ?? (destination.name ? [destination.name] : []) },
      cancelling: false,
      pass: 0,
    };
    this.#entries.set(id, {
      run,
      resolve,
      reported: false,
      released: false,
      looping: false,
      files: entries.map((entry) => entry.file),
      upload: request.upload,
    });
    this.#publish();
    this.start(id);
    return { id, report };
  }

  /**
   * A run on files' files, for its window's thumbnails.
   * @param id The run.
   * @returns The files by item index, or undefined for a run on media or none.
   */
  files(id: string): File[] | undefined {
    const files = this.#entries.get(id)?.files;
    return files ? [...files] : undefined;
  }

  /**
   * Change a run's settings, while the settings show.
   * @param id The run.
   * @param settings The settings.
   */
  update(id: string, settings: OptimizeSettings): void {
    const entry = this.#entries.get(id);
    if (!entry || entry.run.phase !== 'settings') return;
    entry.run.settings = { ...settings };
    this.#publish();
  }

  /**
   * Run with the settings chosen, and remember them for this person's next run.
   * @param id The run.
   */
  start(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry || entry.run.phase !== 'settings') return;
    // A run on files starts on its caller's settings, which are not this person's to remember.
    if (entry.run.mode !== 'files') this.#deps.remember(entry.run.settings);
    void this.#pass(entry, (item) => item.status === 'waiting');
  }

  /**
   * Stop after the item in hand. What is done stays done.
   * @param id The run.
   */
  cancel(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry || entry.run.phase !== 'running') return;
    entry.run.cancelling = true;
    this.#publish();
  }

  /**
   * Run the failed items again, each opened afresh, so a conflict is retried against the latest version.
   * @param id The run.
   */
  retryFailed(id: string): void {
    this.#again(id, (item) => item.status === 'failed');
  }

  /**
   * Run the items a cancel left, with the same settings.
   * @param id The run.
   */
  runRest(id: string): void {
    this.#again(id, (item) => item.status === 'not-started');
  }

  /**
   * Run the items skipped as animated, keeping only their first frame, once the person said yes to
   * losing the animation (D13). The run's own settings still skip them; only this pass does not.
   * @param id The run.
   */
  runAnimated(id: string): void {
    this.#again(id, (item) => item.status === 'skipped' && item.skip === 'animated', { animated: 'first-frame' });
  }

  /**
   * Run one failed file of a run on files again: optimized afresh, then uploaded (#179).
   * @param id The run.
   * @param index The file's index.
   */
  retryOne(id: string, index: number): void {
    const target = this.#entries.get(id)?.run.items[index];
    if (target) this.#again(id, (item) => item === target && item.status === 'failed');
  }

  /**
   * Upload one failed file of a run on files as it was dropped, nothing done to it (#179).
   * @param id The run.
   * @param index The file's index.
   */
  uploadOriginal(id: string, index: number): void {
    const target = this.#entries.get(id)?.run.items[index];
    if (target) this.#again(id, (item) => item === target && item.status === 'failed' && !item.uploaded, {}, 'original');
  }

  /**
   * The run's window closed (design D7, §5.4): before it ran, the run ends not started; while it runs,
   * it stops after the item in hand and is dropped then; once ended, it is dropped now.
   * @param id The run.
   */
  release(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    entry.released = true;
    if (entry.looping) {
      entry.run.cancelling = true;
      this.#publish();
      return;
    }
    this.#report(entry, 'not-started');
    this.#drop(id);
  }

  /** The desktop is going: stop every run after its item in hand, and let every caller have its report. */
  dispose(): void {
    for (const id of [...this.#entries.keys()]) this.release(id);
  }

  /**
   * Read the selection: what each item is, which are skipped and why, the title, and then, while the
   * settings show, how widely the images are used.
   * @param id The run.
   * @param request What the caller asked for.
   */
  async #prepare(id: string, request: OptimizeMediaRequest): Promise<void> {
    const uniques = [...new Set(request.items)];
    let facts = new Map<string, ItemFacts>();
    let folders = new Set<string>();
    try {
      [facts, folders] = await Promise.all([this.#deps.facts(uniques), this.#deps.folderTypes()]);
    } catch {
      // Nothing known: every item is missing, which the settings say.
    }
    const entry = this.#entries.get(id);
    if (!entry || entry.released) return;
    for (const item of entry.run.items) {
      const known = facts.get(item.unique);
      item.name = known?.name ?? item.unique;
      item.parent = known?.parent ?? null;
      const format = formatOfExtension(known?.extension ?? '');
      if (format && format !== 'svg') item.format = format;
      const skip = triage(known, folders);
      if (skip) {
        item.status = 'skipped';
        item.skip = skip;
      }
    }
    const images = entry.run.items.filter((item) => item.status !== 'skipped');
    const parents = new Set(images.map((item) => item.parent));
    const only = parents.size === 1 ? [...parents][0] : undefined;
    let folderName: string | undefined;
    if (!request.title && parents.size === 1) folderName = only === null ? this.#deps.words.rootName : await this.#deps.folderName(only!).catch(() => undefined);
    if (parents.size === 1) {
      const path = only === null ? [] : await this.#deps.folderPath(only!).catch(() => undefined);
      entry.run.from = { path: path ?? (folderName && only !== null ? [folderName] : []) };
    } else {
      entry.run.from = { folders: parents.size };
    }
    if (!this.#entries.has(id) || entry.released) return;
    entry.run.title = windowTitle(this.#deps.words, images, folderName, request.title);
    entry.run.phase = 'settings';
    this.#publish();
    if (request.start) this.start(id);
    else void this.#countUsage(entry, [...new Set(images.map((item) => item.unique))]);
  }

  /**
   * Count how many of the images are used elsewhere, and in how many places, a few at a time. Any
   * lookup failing gives up on the warning, since a count missing one image would understate it.
   * @param entry The run.
   * @param uniques The images.
   */
  async #countUsage(entry: RunEntry, uniques: string[]): Promise<void> {
    let images = 0;
    let places = 0;
    const used: Array<{ unique: string; name: string; count: number }> = [];
    try {
      for (let at = 0; at < uniques.length; at += REFERENCE_LOOKUPS_AT_ONCE) {
        if (entry.run.phase !== 'settings') return;
        const batch = uniques.slice(at, at + REFERENCE_LOOKUPS_AT_ONCE);
        const counts = await Promise.all(batch.map((unique) => this.#deps.references(unique)));
        if (counts.some((count) => count === undefined)) throw new Error('A count could not be read.');
        (counts as number[]).forEach((count, index) => {
          if (count <= 0) return;
          images += 1;
          places += count;
          const unique = batch[index];
          used.push({ unique, name: entry.run.items.find((item) => item.unique === unique)?.name ?? unique, count });
        });
      }
      entry.run.usage = { images, places, used };
    } catch {
      entry.run.usage = null;
    }
    if (this.#entries.has(entry.run.id)) this.#publish();
  }

  /**
   * Start another pass over the items that match, once the last one ended.
   * @param id The run.
   * @param which Which items go again.
   * @param override What this pass does differently from the run's settings.
   * @param kind Optimize the items, or upload them as they were.
   */
  #again(id: string, which: (item: RunItem) => boolean, override: Partial<NormalisedOptions> = {}, kind: PassKind = 'optimize'): void {
    const entry = this.#entries.get(id);
    if (!entry || entry.run.phase !== 'ended' || !entry.run.items.some(which)) return;
    void this.#pass(entry, which, override, kind);
  }

  /**
   * One pass: every matching item in order, one at a time, until the end or a cancel.
   * @param entry The run.
   * @param which Which items this pass runs.
   * @param override What this pass does differently from the run's settings.
   * @param kind Optimize the items, or, on files, upload them as they were.
   */
  async #pass(entry: RunEntry, which: (item: RunItem) => boolean, override: Partial<NormalisedOptions> = {}, kind: PassKind = 'optimize'): Promise<void> {
    const run = entry.run;
    const items = run.items.filter(which);
    const options = { ...optionsOf(run.settings), ...override };
    for (const item of items) {
      item.status = 'waiting';
      delete item.message;
      delete item.skip;
    }
    run.phase = 'running';
    run.cancelling = false;
    run.pass += 1;
    entry.looping = true;
    this.#publish();
    for (const item of items) {
      if (run.cancelling) break;
      item.status = 'running';
      this.#publish();
      if (run.mode === 'files') await this.#processFile(entry, item, kind, override);
      else await this.#process(item, run.settings.save, options);
      this.#publish();
    }
    for (const item of items) if (item.status === 'waiting') item.status = 'not-started';
    run.outcome = run.cancelling ? 'cancelled' : 'finished';
    run.cancelling = false;
    run.phase = 'ended';
    entry.looping = false;
    this.#report(entry);
    if (entry.released) this.#drop(run.id);
    else this.#publish();
  }

  /**
   * One item: open it afresh, refuse it if it was binned since, optimize its file, and save it over
   * itself or as a copy (design §6.2, §7). Whatever goes wrong fails this item only.
   * @param item The item, updated as it goes.
   * @param save Replace the original, or save a copy.
   * @param options What to do.
   */
  async #process(item: RunItem, save: OptimizeSettings['save'], options: NormalisedOptions): Promise<void> {
    const words = this.#deps.words;
    try {
      const opened = await this.#deps.open(item.unique);
      if (opened.status !== 'opened') return this.#fail(item, words.unreadable);
      // Services.Media's save over a binned item quietly makes a new one (`media-save.ts`), which a
      // run must never do, so a binned item fails here, before anything is saved.
      if (opened.isTrashed) return this.#fail(item, words.gone);
      item.name = opened.name;
      const fileName = opened.fileName || `${opened.name}.${opened.extension}`;
      const result = await this.#deps.optimize(new File([opened.blob], fileName, { type: opened.blob.type }), options);
      if (result.status === 'skipped') {
        item.status = 'skipped';
        item.skip = result.reason;
        return;
      }
      if (result.status === 'failed') return this.#fail(item, result.message);
      item.before = result.before;
      if (result.status === 'unchanged') {
        item.status = 'unchanged';
        item.unchanged = result.reason;
        return;
      }

      const extension = extensionOf(result.file.name);
      const base = fileName.replace(/\.[^.]*$/, '');
      const request: MediaSaveRequest =
        save === 'copy'
          ? {
              file: new File([result.file], `${unversionedBase(base)}-optimized.${extension}`, { type: result.file.type }),
              name: words.copyName(opened.name),
              folder: opened.folder ?? null,
              copyOf: item.unique,
            }
          : {
              // A new address on every replace, or every cache goes on showing the old picture (§7.1).
              file: new File([result.file], versionedFileName(base, contentHash(new Uint8Array(await result.file.arrayBuffer())), extension), { type: result.file.type }),
              name: opened.name,
              folder: opened.folder ?? null,
              existing: item.unique,
              expectedUpdateDate: opened.updateDate,
            };
      const saved = await this.#deps.save(request);
      if (!saved.ok) return this.#fail(item, saved.conflict ? words.conflict : saved.message || words.refused);
      item.status = 'optimized';
      item.after = result.after;
      if (save === 'copy') item.copy = saved.unique;
    } catch (error) {
      this.#fail(item, (error as Error)?.message || words.refused);
    }
  }

  /**
   * One file of a run on files (#179): optimized with only the fixes it needs, then uploaded through
   * the caller's upload, the optimized file or, when there was nothing to do, the original. A file the
   * optimizer would not touch, an animated one, is uploaded as it was too, since the person asked for
   * it to go in. A failure, optimizing or uploading, fails this file only and uploads nothing for it.
   * @param entry The run.
   * @param item The file's item, updated as it goes.
   * @param kind Optimize it, or upload it as it was dropped.
   * @param override What this pass does differently from the run's settings.
   */
  async #processFile(entry: RunEntry, item: RunItem, kind: PassKind, override: Partial<NormalisedOptions>): Promise<void> {
    const file = entry.files?.[entry.run.items.indexOf(item)];
    if (!file || !entry.upload) return this.#fail(item, this.#deps.words.unreadable);
    try {
      if (kind === 'original') {
        if (await this.#uploadFile(entry, item, file)) {
          item.status = 'unchanged';
          item.original = true;
        }
        return;
      }
      const asked = optionsForFile(item, entry.run.settings);
      if (!asked) {
        if (await this.#uploadFile(entry, item, file)) {
          item.status = 'unchanged';
          item.unchanged = 'nothing-asked';
        }
        return;
      }
      const result = await this.#deps.optimize(file, { ...asked, ...override });
      if (result.status === 'failed') return this.#fail(item, result.message);
      if (result.status === 'skipped') {
        if (await this.#uploadFile(entry, item, file)) {
          item.status = 'skipped';
          item.skip = result.reason;
        }
        return;
      }
      item.before = result.before;
      if (result.status === 'unchanged') {
        if (await this.#uploadFile(entry, item, file)) {
          item.status = 'unchanged';
          item.unchanged = result.reason;
        }
        return;
      }
      if (await this.#uploadFile(entry, item, result.file)) {
        item.status = 'optimized';
        item.after = result.after;
      }
    } catch (error) {
      this.#fail(item, (error as Error)?.message || this.#deps.words.uploadFailed);
    }
  }

  /**
   * Upload one file through the caller's upload, failing the item when it does not go in.
   * @param entry The run.
   * @param item The file's item.
   * @param file What to upload.
   * @returns True when it went in.
   */
  async #uploadFile(entry: RunEntry, item: RunItem, file: File): Promise<boolean> {
    item.stage = 'uploading';
    this.#publish();
    let result: Awaited<ReturnType<NonNullable<RunEntry['upload']>>> | undefined;
    try {
      result = await entry.upload!(file);
    } finally {
      delete item.stage;
    }
    if (!result?.ok) {
      this.#fail(item, result?.message || this.#deps.words.uploadFailed);
      return false;
    }
    item.uploaded = true;
    return true;
  }

  /**
   * Mark an item failed.
   * @param item The item.
   * @param message Why.
   */
  #fail(item: RunItem, message: string): void {
    item.status = 'failed';
    item.message = message;
  }

  /**
   * Give the caller its report, the first time only: a later pass is the window's, not the caller's.
   * @param entry The run.
   * @param status How it ended, when not its outcome.
   */
  #report(entry: RunEntry, status?: OptimizeReport['status']): void {
    if (entry.reported) return;
    entry.reported = true;
    entry.resolve(reportOf(entry.run, this.#deps.words, status));
  }

  /**
   * Forget a run.
   * @param id The run.
   */
  #drop(id: string): void {
    this.#entries.delete(id);
    this.#publish();
  }

  /** Tell the windows, with copies, since the state freezes what it is given. */
  #publish(): void {
    this.#state.setValue([...this.#entries.values()].map((entry) => structuredClone(entry.run)));
  }
}
