import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../context/media-manager.context.js';
import type { UmbraDesktopMediaManagerContext } from '../context/media-manager.context.js';
import type { UmbraDesktopMediaRef } from '../operations/media-api.js';
import { undoOf } from '../undo/inverse.js';
import { OPTIMIZE_SERVICE_CONTEXT } from '../shared/optimize-service.js';
import type { OptimizeMediaRequest, OptimizeReport, OptimizeService } from '../shared/optimize-service.js';
import { UmbraDesktopMediaHealthClient } from './health.client.js';
import type { HealthCheck, HealthFolder, HealthItem, HealthKeep, HealthKeepDuration, HealthOrphan, HealthStatus } from './health.client.js';
import { HEALTH_KINDS, barOf, isStale, listsOf, sizeOfAll } from './health-model.js';
import type { HealthBar, HealthKind, HealthLists } from './health-model.js';
import { entriesOf, nextAfter } from './health-grid.js';
import { KEEP_KINDS, keepingOf } from './health-keep.js';
import type { HealthEntry } from './health-grid.js';
import { findDesktopWindows } from '../edit-image/desktop-windows.js';
import type { UmbraDesktopWindows } from '../edit-image/desktop-windows.js';
import { UMBRADESKTOP_MEDIA_MANAGER_APP } from '../manager/manager-window.context.js';
import { printLocation } from '../manager/location.js';

/** How often a running check is asked where it is: every two seconds (design §5). */
export const HEALTH_POLL_MS = 2000;

/**
 * How often an open window asks whether anything changed when no check is followed (design §16.12):
 * a colleague's check started or finished. Thirty seconds, since this is no busy app and one status
 * read is a few rows.
 */
export const HEALTH_WATCH_MS = 30000;

/** Why Clean up did not run: a newer check replaced the result shown, or the result is over a day old. */
export type UmbraDesktopMediaHealthRefusal = { refused: 'newer' | 'stale' };

/** The last check's result: everything the window and, later, the Manager show (design §16.2). */
export interface UmbraDesktopMediaHealthResult {
  /** The check's number, to tell a newer result from this one. */
  checkId: number;
  /** When the check finished. */
  checkedAt: Date;
  /** Every item the check classified, largest first, for the Manager's facts (steps 4 and 5). */
  items: HealthItem[];
  /** Every folder, by key, for Where the space goes and the grid's folder filter. */
  folders: HealthFolder[];
  /** Every orphaned file the check found, kept ones included, largest first. */
  orphans: HealthOrphan[];
  /** The three lists, each largest first, less everything kept now (design §16.6). */
  lists: HealthLists;
  /** The library cut by health, and what can be freed; kept things are never in "can be freed". */
  bar: HealthBar;
  /** Every keep, as the server last listed them. */
  keeps: HealthKeep[];
  /** An entry per keep that holds, for the Kept tab. */
  kept: HealthEntry[];
  /** The keeps that have ended, by entry id, for the "kept until" badge. */
  ended: Map<string, HealthKeep>;
  /** Per list, how many kept things would otherwise be in it, for the overview's "n kept". */
  keptCount: Record<HealthKind, number>;
}

/** Which part of a check runs: reading the library and its usage, walking the disk, or reading the result. */
export type UmbraDesktopMediaHealthStep = 'usage' | 'disk' | 'loading';

/** Where the check is. */
export type UmbraDesktopMediaHealthPhase =
  | { kind: 'idle' }
  | { kind: 'running'; step: UmbraDesktopMediaHealthStep; scanned: number; total: number }
  | { kind: 'failed'; message: string };

/**
 * Where a Clean up is, and once done, what came of it (design §16.3, mock scene 4b). It reports what
 * went, not what was asked: an item core refused to trash and a file skipped at its re-check are in
 * `failed` and `skipped`, and neither counts in `freedBytes` (plan Review Focus 3).
 */
export interface UmbraDesktopMediaHealthCleanupState {
  /** Running until the bin and the disk are done; Optimize images is not waited for. */
  phase: 'running' | 'done';
  /** Items trashed and files deleted so far, worked or not, for the window's progress. */
  done: number;
  /** Items to trash and files to delete in all. */
  total: number;
  /** The bytes that went: the items trashed and the files deleted. */
  freedBytes: number;
  /** The library before, items and orphaned files together, as the bar shows it. */
  beforeBytes: number;
  /** The library after: before, less what went. */
  afterBytes: number;
  /** The items in the recycle bin now, as refs with their own folder, for Undo. */
  trashed: UmbraDesktopMediaRef[];
  /** How many orphaned files were deleted. */
  deleted: number;
  /** The files left on disk, each with the server's reason. */
  skipped: Array<{ relativePath: string; reason: string }>;
  /** The keys of the items that did not go to the bin. */
  failed: string[];
  /**
   * How far the Optimize images window is, while it runs, and its location once the run has told it;
   * undefined before it starts and once it ends.
   */
  optimizing: { completed: number; total: number; location?: string } | undefined;
}

/** What the context holds: where the check is, the last result, the library's size, and Clean up. */
export interface UmbraDesktopMediaHealthState {
  phase: UmbraDesktopMediaHealthPhase;
  result: UmbraDesktopMediaHealthResult | undefined;
  /** The library's items now, from the last status read; undefined until the server has been asked. */
  mediaCount: number | undefined;
  /** The Clean up under way or just done, until the person goes back to the overview. */
  cleanup: UmbraDesktopMediaHealthCleanupState | undefined;
}

/** How a delete of orphaned files went, or why it did not. */
export type UmbraDesktopMediaHealthDeleteOutcome =
  | { deleted: number; skipped: Array<{ relativePath: string; reason: string }> }
  | { error: 'denied' | 'failed' };

/**
 * As much of the Media Manager's context as Media Health uses: its refs read in one call, and its
 * own trash and restore, so a Clean up has the Manager's undo, its Transfers row and core's rules.
 */
export interface UmbraDesktopMediaHealthManager {
  api: Pick<NonNullable<UmbraDesktopMediaManagerContext['api']>, 'item' | 'items'>;
  trash: UmbraDesktopMediaManagerContext['trash'];
  restore: UmbraDesktopMediaManagerContext['restore'];
}

/** What the context uses beyond its own code, so a test can hand in its own. */
/**
 * The cleanup list and its details pane (design §16.15), kept here rather than in the window because
 * the pane is not inside the window: it is the desktop's attached pane, or a window of its own grouped
 * with it, and both read the same state from the context. One Media Cleanup window at a time, so one
 * list.
 */
export interface UmbraDesktopMediaHealthBrowse {
  /** The entry the list marks as current and the pane shows; undefined before a row was clicked. */
  current: string | undefined;
  /** The list's rows in the order shown, which Previous, Next and moving on walk. */
  order: string[];
  /** The orphaned files a Delete asks about, while the window asks; deleting is for good. */
  deleting: string[] | undefined;
  /** The rows Keep… asks about, while the window shows its sheet (design §16.6). */
  keeping: string[] | undefined;
  /** What the last Delete left on disk, and why, said over the list. */
  skipped: Array<{ relativePath: string; reason: string }>;
}

export interface UmbraDesktopMediaHealthDeps {
  /** The add-on's Media Health API. */
  client?: UmbraDesktopMediaHealthClient;
  /**
   * Wait between polls.
   * @param ms How long.
   */
  wait?: (ms: number) => Promise<void>;
  /** The time now. */
  now?: () => Date;
  /** Whether a window can be seen; the watch asks nothing while it cannot. The page's own by default. */
  visible?: () => boolean;
  /** The Media Manager; the desktop's own unless a test hands one in. */
  manager?: UmbraDesktopMediaHealthManager;
  /**
   * Open Optimize images on items (Services.Media); the desktop's own unless a test hands one in.
   * @param request The items, the title and the progress callback.
   * @returns The run's report, when it ends.
   */
  optimize?: (request: OptimizeMediaRequest) => Promise<OptimizeReport>;
  /** The desktop's window manager, for Show in Media Manager; found from the desktop unless a test hands one in. */
  windows?: () => Pick<UmbraDesktopWindows, 'openApp'> | undefined;
}

/**
 * The Media Health context (design §3): the check, the last result and Clean up, kept on the desktop
 * rather than in the window so closing the window stops nothing and a Manager window can read the
 * facts later. A `umbraDesktopContext`, so the desktop makes it on open and destroys it on leave;
 * constructed with `(host)` by the desktop, the second parameter is for tests.
 *
 * The check itself runs on the server (design §15), which keeps the result in the site's database;
 * this follows it, polling every two seconds only while it runs, and reads the result when it is
 * done. Nothing heavy runs until {@link check} is pressed (design §2). {@link sync} and {@link watch}
 * are the only reads without it: a window opening asks the server once whether a check exists there
 * already, so a result is never shown as "No check yet" while the server has one, and then looks every
 * thirty seconds while it is open.
 *
 * The result shown is the server's last one, whatever its age (design §16.12): opening the window
 * starts nothing heavy. While a window is open the context watches the server every thirty seconds,
 * so a colleague's check shows up; Clean up refuses a result over a day old or one a newer check has
 * replaced; and what a Clean up changes is written back to the server's result as well.
 */
export class UmbraDesktopMediaHealthContext extends UmbContextBase {
  /** The API. */
  #client: UmbraDesktopMediaHealthClient;

  /** Waits between polls. */
  #wait: (ms: number) => Promise<void>;

  /** The time now. */
  #now: () => Date;

  /** Whether a window can be seen. */
  #visible: () => boolean;

  /** How many windows watch, so one watch serves them all and it ends with the last. */
  #watchers = 0;

  /** The watch under way, while any window watches. */
  #watching?: Promise<void>;

  /** The Media Manager handed in by a test, which then wins over the desktop's. */
  #givenManager?: UmbraDesktopMediaHealthManager;

  /** The desktop's Media Manager context, once found. */
  #manager?: UmbraDesktopMediaHealthManager;

  /** Optimize images handed in by a test. */
  #givenOptimize?: (request: OptimizeMediaRequest) => Promise<OptimizeReport>;

  /** The media service's context, once found, for Optimize images. */
  #optimizeService?: OptimizeService;

  /** The desktop's window manager, as a test hands it in or as found from the desktop. */
  #windows: () => Pick<UmbraDesktopWindows, 'openApp'> | undefined;

  /** Where the check is, the last result, the library's size and Clean up. */
  #state = new UmbObjectState<UmbraDesktopMediaHealthState>({ phase: { kind: 'idle' }, result: undefined, mediaCount: undefined, cleanup: undefined });

  /** The state, for the window and the Manager. */
  readonly state = this.#state.asObservable();

  /** The check being followed, so a second press joins it rather than starting another. */
  #running?: Promise<void>;

  /** Whether the server has been asked once whether it already holds a check. */
  #synced = false;

  /** Signed thumbnails by edge and URL, so each picture is signed once per desktop. */
  #thumbnails = new Map<string, string>();

  /** The items the last Clean up trashed, as the check saw them, so Undo can put them back in the lists. */
  #trashedItems: HealthItem[] = [];

  /** The list and its pane. */
  #browse = new UmbObjectState<UmbraDesktopMediaHealthBrowse>({ current: undefined, order: [], deleting: undefined, keeping: undefined, skipped: [] });

  /** The list and its pane, for the window and the pane. */
  readonly browse = this.#browse.asObservable();

  /** The result the entries were made from, and the entries, so they are made once per result. */
  #entries?: { from: UmbraDesktopMediaHealthResult | undefined; entries: HealthEntry[] };

  /**
   * @param host The desktop element.
   * @param deps Stand-ins, for tests.
   */
  constructor(host: UmbControllerHost, deps: UmbraDesktopMediaHealthDeps = {}) {
    super(host, UMBRADESKTOP_MEDIA_HEALTH_CONTEXT);
    this.#client = deps.client ?? new UmbraDesktopMediaHealthClient();
    this.#wait = deps.wait ?? ((ms) => new Promise((resolve) => window.setTimeout(resolve, ms)));
    this.#now = deps.now ?? (() => new Date());
    this.#visible = deps.visible ?? (() => document.visibilityState !== 'hidden');
    this.#givenManager = deps.manager;
    this.#givenOptimize = deps.optimize;
    this.#windows = deps.windows ?? (() => findDesktopWindows(this.getHostElement()));
    if (!deps.manager) this.consumeContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, (manager) => (this.#manager = manager?.api ? (manager as UmbraDesktopMediaHealthManager) : undefined));
    if (!deps.optimize) this.consumeContext(OPTIMIZE_SERVICE_CONTEXT, (service) => (this.#optimizeService = service ?? undefined));
  }

  /** The state now. */
  getState(): UmbraDesktopMediaHealthState {
    return this.#state.getValue();
  }

  /** The list and its pane now. */
  getBrowse(): UmbraDesktopMediaHealthBrowse {
    return this.#browse.getValue();
  }

  /**
   * Every entry of the last result, the list's and the pane's: made again only when the result
   * changes, so both hold the same objects.
   * @returns The entries, unused first, then orphaned, then oversized, then what is kept.
   */
  entries(): HealthEntry[] {
    const result = this.#state.getValue().result;
    if (this.#entries && this.#entries.from === result) return this.#entries.entries;
    this.#entries = { from: result, entries: result ? [...entriesOf(result.lists, result.ended), ...result.kept] : [] };
    return this.#entries.entries;
  }

  /**
   * The list's rows in the order it shows them, each time it draws a different order.
   * @param order The entries' ids.
   */
  setOrder(order: ReadonlyArray<string>): void {
    const now = this.#browse.getValue().order;
    if (now.length === order.length && now.every((id, at) => id === order[at])) return;
    this.#browse.update({ order: [...order] });
  }

  /**
   * Make a row the current one: what a click on a row does, and what the pane shows.
   * @param id The entry, or undefined for none.
   */
  setCurrent(id: string | undefined): void {
    if (this.#browse.getValue().current !== id) this.#browse.update({ current: id });
  }

  /**
   * Previous or Next: the row so many places on in the list, stopping at either end. A current row not
   * in the list goes to the list's first.
   * @param by -1 for the one before, 1 for the next.
   */
  step(by: number): void {
    const { order, current } = this.#browse.getValue();
    const at = current === undefined ? -1 : order.indexOf(current);
    const next = at < 0 ? order[0] : order[Math.min(order.length - 1, Math.max(0, at + by))];
    if (next !== undefined) this.setCurrent(next);
  }

  /**
   * Act on rows, each by its kind, as the selection bar and the pane do: unused items to the recycle bin
   * through the Manager, oversized images into Optimize images, orphaned files only once the window
   * asked (`deleting`), and only for an administrator, who alone may delete from disk. The current row,
   * if it went, moves on to the next one still there.
   * @param ids The entries.
   * @param options Whether the person is an administrator, and Optimize images' window title.
   */
  async act(ids: ReadonlyArray<string>, options: { admin: boolean; title?: string }): Promise<void> {
    const wanted = new Set(ids);
    const chosen = this.entries().filter((entry) => wanted.has(entry.id));
    const files = chosen.filter((entry) => entry.kind === 'orphaned');
    if (files.length && options.admin) this.#browse.update({ deleting: files.map((entry) => entry.id) });
    const trash = chosen.filter((entry) => entry.kind === 'unused' && entry.item);
    const optimize = chosen.filter((entry) => entry.kind === 'oversized' && entry.item);
    this.#moveOn([...trash, ...optimize].map((entry) => entry.id));
    if (optimize.length) this.optimize(optimize.map((entry) => entry.item!.key), { title: options.title });
    if (trash.length) await this.trash(trash.map((entry) => entry.item!.key));
  }

  /** Delete the files the window asked about, for good, and keep what stayed and why. */
  async confirmDelete(): Promise<void> {
    const ids = this.#browse.getValue().deleting;
    if (!ids) return;
    this.#browse.update({ deleting: undefined });
    const files = this.entries().filter((entry) => entry.orphan && ids.includes(entry.id));
    if (!files.length) return;
    const outcome = await this.deleteOrphaned(files.map((entry) => entry.orphan!.relativePath));
    const skipped = 'error' in outcome ? files.map((entry) => ({ relativePath: entry.orphan!.relativePath, reason: outcome.error })) : outcome.skipped;
    const stayed = new Set(skipped.map((each) => each.relativePath.toLowerCase()));
    this.#browse.update({ skipped });
    this.#moveOn(files.filter((entry) => !stayed.has(entry.orphan!.relativePath.toLowerCase())).map((entry) => entry.id));
  }

  /** Delete nothing: the window's question was cancelled. */
  cancelDelete(): void {
    this.#browse.update({ deleting: undefined });
  }

  /**
   * Ask the window to ask Keep… about rows (design §16.6): the list's selection bar and the pane both
   * come here, and the window shows the sheet, since the pane is not inside it.
   * @param ids The entries.
   */
  askKeep(ids: ReadonlyArray<string>): void {
    if (ids.length) this.#browse.update({ keeping: [...ids] });
  }

  /** Keep nothing: the sheet was cancelled. */
  cancelKeep(): void {
    this.#browse.update({ keeping: undefined });
  }

  /**
   * Keep the rows the sheet asked about, each from the list it is in, so Kept can say which; they leave
   * every list at once, and the current row moves on as after any action.
   * @param note Why, as typed; blank is none.
   * @param duration For how long.
   */
  async keep(note: string, duration: HealthKeepDuration): Promise<void> {
    const ids = this.#browse.getValue().keeping;
    this.#browse.update({ keeping: undefined });
    if (!ids?.length) return;
    const wanted = new Set(ids);
    const chosen = this.entries().filter((entry) => wanted.has(entry.id));
    const made: HealthKeep[] = [];
    for (const kind of HEALTH_KINDS) {
      const targets = chosen.filter((entry) => entry.kind === kind).map((entry) => (entry.orphan ? entry.orphan.relativePath : entry.item!.key));
      if (!targets.length) continue;
      const answer = await this.#client.keep({ kind: KEEP_KINDS[kind], targets, note: note.trim() || null, duration });
      made.push(...(answer.data ?? []));
    }
    if (!made.length) return;
    const replaced = new Set(made.map((keep) => `${keep.kind === 'Orphaned'}|${keep.target.toLowerCase()}`));
    const result = this.#state.getValue().result;
    const others = (result?.keeps ?? []).filter((keep) => !replaced.has(`${keep.kind === 'Orphaned'}|${keep.target.toLowerCase()}`));
    this.#moveOn(chosen.map((entry) => entry.id));
    this.#withKeeps([...made, ...others]);
  }

  /**
   * Stop keeping rows: they come back to their lists at once. This is how a colleague overrules a keep,
   * openly, with its note in front of them (design §16.6).
   * @param ids The entries.
   */
  async stopKeeping(ids: ReadonlyArray<string>): Promise<void> {
    const wanted = new Set(ids);
    const keeps = this.entries().filter((entry) => wanted.has(entry.id) && entry.keep).map((entry) => entry.keep!);
    if (!keeps.length) return;
    const answer = await this.#client.stopKeeping(keeps.map((keep) => keep.id));
    if (answer.error) return;
    const stopped = new Set(keeps.map((keep) => keep.id));
    const targets = new Set(keeps.map((keep) => keep.target.toLowerCase()));
    this.#moveOn([...wanted]);
    this.#withKeeps((this.#state.getValue().result?.keeps ?? []).filter((keep) => !stopped.has(keep.id) && !targets.has(keep.target.toLowerCase())));
  }

  /**
   * Read the keeps again, so one a colleague made since the result loaded is left out before anything
   * acts on the lists: Clean up asks this before its sheet (plan Review Focus 5). Trash cannot check
   * keeps on the server, so this is where a fresh keep is honoured; a failed read keeps what is there.
   */
  async loadKeeps(): Promise<void> {
    if (!this.#state.getValue().result) return;
    const answer = await this.#client.keeps();
    if (answer.data) this.#withKeeps(answer.data);
  }

  /**
   * Apply other keeps to the result shown, summing again.
   * @param keeps Every keep now.
   */
  #withKeeps(keeps: HealthKeep[]): void {
    const result = this.#state.getValue().result;
    if (!result) return;
    this.#patch({ result: resultOf(result.checkId, result.checkedAt, result.items, result.orphans, result.folders, keeps) });
  }

  /**
   * Move the current row on past rows that went, as the pane's actions do.
   * @param gone The entries that went.
   */
  #moveOn(gone: ReadonlyArray<string>): void {
    const { current, order } = this.#browse.getValue();
    if (current !== undefined && gone.length) this.setCurrent(nextAfter(order, current, gone));
  }

  /**
   * Run a check: ask the server to start one, or join the one it is running, then follow it to its
   * end and read the result. The check goes on while the window is closed, since it runs on the
   * server; this only follows it.
   * @returns When the check has ended, well or badly.
   */
  check(): Promise<void> {
    this.#running ??= this.#check().finally(() => (this.#running = undefined));
    return this.#running;
  }

  /**
   * Ask the server once whether it already holds a check, and read it if so; follow one still going.
   * For a window opening. Asks nothing after the first time, and nothing while a check is followed.
   */
  async sync(): Promise<void> {
    if (this.#synced || this.#running) return;
    this.#synced = true;
    const status = await this.#client.status();
    if (!status.data) return;
    if (status.data.running) {
      this.#running ??= this.#follow(status.data).finally(() => (this.#running = undefined));
      return this.#running;
    }
    await this.#settle(status.data);
  }

  /**
   * Watch the server while a window is open (design §16.12): every {@link HEALTH_WATCH_MS}, when no
   * check is followed and no Clean up runs, ask whether a check is running, which is then followed, or
   * whether a newer result is in, which is then read. Nothing is asked while no window can be seen.
   * Several windows share one watch.
   * @returns Call to stop watching, when the window closes.
   */
  watch(): () => void {
    this.#watchers++;
    this.#watching ??= this.#watch().finally(() => (this.#watching = undefined));
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.#watchers--;
    };
  }

  /** The watch itself, until the last window stops watching. */
  async #watch(): Promise<void> {
    while (this.#watchers > 0) {
      await this.#wait(HEALTH_WATCH_MS);
      if (this.#watchers === 0) return;
      if (!this.#visible() || this.#running || this.#state.getValue().cleanup?.phase === 'running') continue;
      const status = await this.#client.status();
      if (!status.data) continue;
      if (status.data.running) {
        this.#running ??= this.#follow(status.data).finally(() => (this.#running = undefined));
        continue;
      }
      const shown = this.#state.getValue().result?.checkId;
      if (status.data.last?.id !== shown || status.data.failed) await this.#settle(status.data);
      else this.#patch(countOf(status.data));
    }
  }

  /**
   * Stop the running check (design §16.12). The server marks it stopped and its work ends at the next
   * beat; the window goes back to the last result, or to No check yet.
   * @returns When the server has answered and the window shows what it holds.
   */
  async stop(): Promise<void> {
    const answer = await this.#client.stop();
    if (!answer.data) return;
    await this.#running;
    if (!answer.data.running) await this.#settle(answer.data);
  }

  /** The whole check: start it, then follow it. */
  async #check(): Promise<void> {
    this.#patch({ phase: { kind: 'running', step: 'usage', scanned: 0, total: 0 }, cleanup: undefined });
    const started = await this.#client.check();
    if (!started.data) return this.#phase({ kind: 'failed', message: started.error ?? 'failed' });
    await this.#follow(started.data);
  }

  /**
   * Follow a check the server is running: show where it is, ask again every two seconds until it is
   * no longer running, then read what it left.
   * @param status The status as the server last reported it.
   */
  async #follow(status: HealthStatus): Promise<void> {
    let current = status;
    while (current.running) {
      this.#patch({ phase: phaseOf(current.running), ...countOf(current) });
      await this.#wait(HEALTH_POLL_MS);
      const answer = await this.#client.status();
      if (!answer.data) return this.#phase({ kind: 'failed', message: answer.error ?? 'failed' });
      current = answer.data;
    }
    await this.#settle(current);
  }

  /**
   * Show what a server with no check running has: a failure since the last check, the last check's
   * result, or nothing.
   * @param status The status.
   */
  async #settle(status: HealthStatus): Promise<void> {
    if (status.failed) {
      this.#patch({ phase: { kind: 'failed', message: status.failed.error || 'failed' }, ...countOf(status) });
      return;
    }
    if (status.last) await this.#load(status.last, countOf(status));
    else this.#patch({ phase: { kind: 'idle' }, ...countOf(status) });
  }

  /**
   * Read a finished check: every item, the orphaned files and the folders, and sum them.
   * @param last The check.
   * @param count The library's item count from the same status.
   */
  async #load(last: HealthCheck, count: Partial<UmbraDesktopMediaHealthState>): Promise<void> {
    this.#patch({ phase: { kind: 'running', step: 'loading', scanned: 0, total: 0 }, ...count });
    const items = await this.#client.allItems();
    const orphaned = await this.#client.orphans();
    const folders = await this.#client.folders();
    if (!items.data || !orphaned.data || !folders.data) {
      return this.#phase({ kind: 'failed', message: items.error ?? orphaned.error ?? folders.error ?? 'failed' });
    }
    // Keeps only filter: a failed read shows the result without them rather than no result at all.
    const keeps = await this.#client.keeps();
    const checkedAt = last.finishedUtc ? new Date(last.finishedUtc) : this.#now();
    this.#patch({ phase: { kind: 'idle' }, result: resultOf(last.id, checkedAt, items.data, orphaned.data, folders.data, keeps.data ?? []) });
  }

  /**
   * Change part of the state.
   * @param change What changes.
   */
  #patch(change: Partial<UmbraDesktopMediaHealthState>): void {
    this.#state.setValue({ ...this.#state.getValue(), ...change });
  }

  /**
   * Set where the check is, keeping the rest.
   * @param phase The phase.
   */
  #phase(phase: UmbraDesktopMediaHealthPhase): void {
    this.#patch({ phase });
  }

  /**
   * Replace the result's items and orphaned files, keeping the rest, the keeps too, and sum again.
   * @param items The items now.
   * @param orphaned The orphaned files now, kept ones included.
   */
  #replace(items: HealthItem[], orphaned: HealthOrphan[]): void {
    const { result } = this.#state.getValue();
    if (!result) return;
    this.#patch({ result: resultOf(result.checkId, result.checkedAt, items, orphaned, result.folders, result.keeps) });
  }

  /**
   * Change the Clean up under way.
   * @param change What changes.
   */
  #cleanup(change: Partial<UmbraDesktopMediaHealthCleanupState>): void {
    const cleanup = this.#state.getValue().cleanup;
    if (cleanup) this.#patch({ cleanup: { ...cleanup, ...change } });
  }

  /**
   * Delete orphaned files from disk through the server, and drop the deleted ones from the result.
   * The server re-checks each is still orphaned and skips the rest, with a reason.
   * @param relativePaths The files.
   * @returns How it went.
   */
  async deleteOrphaned(relativePaths: ReadonlyArray<string>): Promise<UmbraDesktopMediaHealthDeleteOutcome> {
    const answer = await this.#client.deleteOrphans(relativePaths);
    if (!answer.data) return { error: answer.error ?? 'failed' };
    const gone = new Set(answer.data.deleted.map((path) => path.toLowerCase()));
    const result = this.#state.getValue().result;
    if (result) this.#replace(result.items, result.orphans.filter((each) => !gone.has(each.relativePath.toLowerCase())));
    return { deleted: answer.data.deleted.length, skipped: answer.data.skipped };
  }

  /**
   * Move items to the recycle bin, through the Manager (design §5: core's trash, everywhere), and
   * drop the ones that went from the result.
   * @param keys The items.
   * @param onProgress Told how many have gone, worked or not, as they go.
   * @returns The refs that went, and the keys that did not.
   */
  async trash(
    keys: ReadonlyArray<string>,
    onProgress?: (progress: { done: number; total: number }) => void,
  ): Promise<{ trashed: UmbraDesktopMediaRef[]; failed: string[] }> {
    const outcome = await this.#trashThroughManager(keys, onProgress);
    const gone = new Set(outcome.trashed.map((ref) => ref.unique));
    const result = this.#state.getValue().result;
    if (result) this.#replace(result.items.filter((each) => !gone.has(each.key)), result.orphans);
    this.#refresh([...gone]);
    return outcome;
  }

  /**
   * Clean up (design §16.3): the ticked rows in order, the bin first, then the disk, then Optimize
   * images. The window has already left out what the person may not do, so the orphaned row only
   * comes from an administrator. Resolves once the bin and the disk are done; Optimize images runs
   * in its own window, so its progress is followed in `optimizing` and its new sizes are taken when it
   * ends, without this waiting for it.
   * @param kinds The rows ticked.
   * @param options The Optimize images window's title, in the person's language.
   * @returns What came of it, or why it did not run: a newer check came in, or the result is over a day
   * old (design §16.12). Then nothing is trashed, deleted or opened.
   */
  async cleanUp(kinds: ReadonlySet<HealthKind>, options: { title?: string } = {}): Promise<UmbraDesktopMediaHealthCleanupState | UmbraDesktopMediaHealthRefusal> {
    const refusal = await this.#refusalOf();
    if (refusal) return refusal;
    const result = this.#state.getValue().result;
    const lists = result?.lists ?? { unused: [], orphaned: [], oversized: [] };
    const unused = kinds.has('unused') ? lists.unused : [];
    const orphaned = kinds.has('orphaned') ? lists.orphaned : [];
    const oversized = kinds.has('oversized') ? lists.oversized : [];
    const beforeBytes = result ? sizeOfAll(result.items) + sizeOfAll(result.orphans) : 0;
    this.#trashedItems = [];
    this.#patch({
      cleanup: {
        phase: 'running',
        done: 0,
        total: unused.length + orphaned.length,
        freedBytes: 0,
        beforeBytes,
        afterBytes: beforeBytes,
        trashed: [],
        deleted: 0,
        skipped: [],
        failed: [],
        optimizing: undefined,
      },
    });

    let freed = 0;
    if (unused.length) {
      const outcome = await this.trash(
        unused.map((each) => each.key),
        ({ done }) => this.#cleanup({ done }),
      );
      const went = new Set(outcome.trashed.map((ref) => ref.unique));
      this.#trashedItems = unused.filter((each) => went.has(each.key));
      freed += sizeOfAll(this.#trashedItems);
      this.#cleanup({ done: unused.length, trashed: outcome.trashed, failed: outcome.failed, freedBytes: freed });
    }

    if (orphaned.length) {
      const outcome = await this.deleteOrphaned(orphaned.map((each) => each.relativePath));
      if ('error' in outcome) {
        this.#cleanup({ done: unused.length + orphaned.length, skipped: orphaned.map((each) => ({ relativePath: each.relativePath, reason: outcome.error })) });
      } else {
        const kept = new Set(outcome.skipped.map((each) => each.relativePath.toLowerCase()));
        freed += sizeOfAll(orphaned.filter((each) => !kept.has(each.relativePath.toLowerCase())));
        this.#cleanup({ done: unused.length + orphaned.length, deleted: outcome.deleted, skipped: outcome.skipped, freedBytes: freed });
      }
    }

    if (oversized.length) {
      this.#cleanup({ optimizing: { completed: 0, total: oversized.length } });
      this.optimize(
        oversized.map((each) => each.key),
        { title: options.title, onProgress: (progress) => this.#cleanup({ optimizing: progress ? { ...progress } : undefined }) },
      );
    }
    this.#cleanup({ phase: 'done', freedBytes: freed, afterBytes: beforeBytes - freed });
    return this.#state.getValue().cleanup!;
  }

  /**
   * Open Optimize images on some images, and take their new sizes when the run ends, so the lists and
   * the bar follow without another check. Not awaited: the run is the person's, in its own window.
   * Clean up's oversized row comes through here, and so do the grid's and the preview's **Optimize**
   * (design §16.4, §16.5).
   * @param keys The images.
   * @param options The window's title, and who to tell how far the run is: its progress while it runs,
   * then `undefined` once it has ended.
   * @returns Whether Optimize images could be opened: false when there is no media service here.
   */
  optimize(
    keys: ReadonlyArray<string>,
    options: { title?: string; onProgress?: (progress: { completed: number; total: number; location?: string } | undefined) => void } = {},
  ): boolean {
    const optimize = this.#givenOptimize ?? (this.#optimizeService ? (request: OptimizeMediaRequest) => this.#optimizeService!.optimizeMedia(request) : undefined);
    if (!optimize || !keys.length) return false;
    void optimize({ items: [...keys], title: options.title, onProgress: (progress) => options.onProgress?.(progress) })
      .catch(() => undefined)
      .then((report) => {
        options.onProgress?.(undefined);
        const sizes = (report?.items ?? []).filter((each) => each.status === 'optimized' && each.after).map((each) => ({ unique: each.unique, sizeBytes: each.after!.size }));
        if (sizes.length) this.resized(sizes);
      });
    return true;
  }

  /**
   * Show an item in a Media Manager window (design §16.5), like Show in Finder: a new window at the
   * item's folder, or at Media for an item at the root, selecting it once core shows it. Core's
   * collection is paged, so an item past its first page opens its folder unselected (plan Decision 8).
   * An orphaned file is no item, so there is nothing to show it in.
   * @param entry The grid's entry.
   * @returns Whether a window was opened.
   */
  showInManager(entry: HealthEntry): boolean {
    const item = entry.item;
    const windows = this.#windows();
    if (!item || !windows) return false;
    const place = item.parentKey ? ({ kind: 'folder', unique: item.parentKey } as const) : ({ kind: 'root' } as const);
    return windows.openApp(UMBRADESKTOP_MEDIA_MANAGER_APP, { location: printLocation(place, undefined, item.key) });
  }

  /**
   * Open a folder in a Media Manager window: the breakdown's **Open in Media Manager** (design
   * §16.15), the library's root for the library.
   * @param folderKey The folder, or null for the root.
   * @returns Whether a window was opened.
   */
  showFolderInManager(folderKey: string | null): boolean {
    const windows = this.#windows();
    if (!windows) return false;
    const place = folderKey ? ({ kind: 'folder', unique: folderKey } as const) : ({ kind: 'root' } as const);
    return windows.openApp(UMBRADESKTOP_MEDIA_MANAGER_APP, { location: printLocation(place) });
  }

  /**
   * Whether Clean up must not act on the result shown (design §16.12): it is over a day old, or the
   * server holds a newer check or runs one. Asked of the server just before acting, since the watch
   * only looks every thirty seconds. A newer check is followed or read, so the window shows it.
   * @returns Why not, or undefined when Clean up may go ahead.
   */
  async #refusalOf(): Promise<UmbraDesktopMediaHealthRefusal | undefined> {
    const shown = this.#state.getValue().result;
    if (!shown || isStale(shown.checkedAt, this.#now())) return { refused: 'stale' };
    const status = await this.#client.status();
    if (!status.data) return undefined;
    if (status.data.running) {
      this.#running ??= this.#follow(status.data).finally(() => (this.#running = undefined));
      return { refused: 'newer' };
    }
    if (status.data.last && status.data.last.id !== shown.checkId) {
      await this.#settle(status.data);
      return { refused: 'newer' };
    }
    return undefined;
  }

  /**
   * Have the stored result follow items this window changed, so the next window, anyone's, sees what
   * is true (design §16.12). Not waited for: the window has already moved on, and a miss only means
   * the next check corrects it.
   * @param keys The items.
   */
  #refresh(keys: ReadonlyArray<string>): void {
    if (keys.length) void this.#client.refreshItems(keys).catch(() => undefined);
  }

  /**
   * Undo the last Clean up's trash (design §16.3): every item back from the recycle bin into the
   * folder it came from. Core restores to the root when told no folder (`release-17.6.0`), so each
   * item names its own, grouped by folder as the Manager's own undo does (`undo/inverse.ts`).
   * @returns The keys that did not come back.
   */
  async undoCleanup(): Promise<{ failed: string[] }> {
    const cleanup = this.#state.getValue().cleanup;
    const manager = this.#managerNow();
    if (!cleanup?.trashed.length || !manager) return { failed: cleanup?.trashed.map((ref) => ref.unique) ?? [] };
    const failed: string[] = [];
    const back = new Set<string>();
    for (const action of undoOf({ kind: 'trash', items: cleanup.trashed })) {
      if (action.kind !== 'restore') continue;
      const outcome = await manager.restore(action.items, action.target, { record: false });
      for (const each of outcome.succeeded) back.add(each.item.unique);
      failed.push(...outcome.failed.map((each) => each.item.unique));
    }
    const restored = this.#trashedItems.filter((each) => back.has(each.key));
    const result = this.#state.getValue().result;
    if (result) this.#replace([...result.items, ...restored], result.orphans);
    this.#refresh([...back]);
    const freed = cleanup.freedBytes - sizeOfAll(restored);
    this.#trashedItems = this.#trashedItems.filter((each) => !back.has(each.key));
    this.#cleanup({ trashed: cleanup.trashed.filter((ref) => !back.has(ref.unique)), freedBytes: freed, afterBytes: cleanup.beforeBytes - freed });
    return { failed };
  }

  /**
   * Signed thumbnails for some pictures, asking only for those not signed yet (design §16.7; a site
   * with an HMAC secret refuses unsigned resizer URLs). Items are signed by core's own imaging route,
   * by key, which also checks the person may see them; orphaned files, which are no item, by the
   * add-on's route, by URL. Whatever comes back unsigned is left out, and the screen draws a tile.
   * The preview asks with `fit`: the whole picture inside an edge-sized box rather than a square crop,
   * cached apart from the thumbnails (design §16.5).
   * @param subjects Each picture's URL, with its item's key when it is an item.
   * @param edge The edge in device pixels.
   * @param options `fit` for the preview's uncropped picture.
   * @returns Each signed URL by the file's URL.
   */
  async thumbnails(subjects: ReadonlyArray<{ url: string; key?: string }>, edge: number, options: { fit?: boolean } = {}): Promise<Map<string, string>> {
    const fit = !!options.fit;
    const cacheKey = (url: string) => `${fit ? 'fit' : 'crop'}|${edge}|${url}`;
    const missing = subjects.filter((each, index) => !this.#thumbnails.has(cacheKey(each.url)) && subjects.findIndex((other) => other.url === each.url) === index);
    const items = missing.filter((each) => each.key);
    const orphans = missing.filter((each) => !each.key);
    if (items.length) {
      const answer = await this.#client.itemThumbnails(items.map((each) => each.key!), edge, fit ? 'Max' : 'Crop');
      for (const each of items) if (answer.data?.[each.key!]) this.#thumbnails.set(cacheKey(each.url), answer.data[each.key!]);
    }
    if (orphans.length) {
      const answer = await this.#client.orphanThumbnails(orphans.map((each) => each.url), edge, fit);
      for (const [url, signed] of Object.entries(answer.data ?? {})) this.#thumbnails.set(cacheKey(url), signed);
    }
    return new Map(subjects.flatMap((each) => (this.#thumbnails.has(cacheKey(each.url)) ? [[each.url, this.#thumbnails.get(cacheKey(each.url))!] as const] : [])));
  }

  /** Back to the overview, from the Done screen. */
  dismissCleanup(): void {
    this.#patch({ cleanup: undefined });
  }

  /**
   * Take items' new sizes, as Optimize images reports them, so the rows and the bar follow without
   * another check, and have the stored result follow too.
   * @param sizes Each item's key and its size now.
   */
  resized(sizes: ReadonlyArray<{ unique: string; sizeBytes: number }>): void {
    const bySize = new Map(sizes.map((each) => [each.unique.toLowerCase(), each.sizeBytes]));
    const result = this.#state.getValue().result;
    if (!result) return;
    this.#replace(
      result.items.map((each) => (bySize.has(each.key.toLowerCase()) ? { ...each, sizeBytes: bySize.get(each.key.toLowerCase())! } : each)),
      result.orphans,
    );
    this.#refresh(sizes.map((each) => each.unique));
  }

  /** The Media Manager to act through: a test's, or the desktop's once found. */
  #managerNow(): UmbraDesktopMediaHealthManager | undefined {
    return this.#givenManager ?? this.#manager;
  }

  /**
   * The Manager's trash: the refs read in one call (`api.items` batches the request; a read per key
   * would be 733 requests before the first trash), then its operation, with undo and a row in
   * Transfers.
   * @param keys The items.
   * @param onProgress Told how many have gone, worked or not.
   * @returns The refs that went, and the keys that did not.
   */
  async #trashThroughManager(
    keys: ReadonlyArray<string>,
    onProgress?: (progress: { done: number; total: number }) => void,
  ): Promise<{ trashed: UmbraDesktopMediaRef[]; failed: string[] }> {
    const manager = this.#managerNow();
    if (!manager || !keys.length) return { trashed: [], failed: [...keys] };
    const { data } = await manager.api.items(keys);
    const refs = data ?? [];
    const found = new Set(refs.map((ref) => ref.unique));
    const failed = keys.filter((key) => !found.has(key));
    if (!refs.length) return { trashed: [], failed };
    const outcome = await manager.trash(refs, { onProgress: ({ done, total }) => onProgress?.({ done, total }) });
    const went = new Set(outcome.succeeded.map((each) => each.item.unique));
    failed.push(...refs.filter((ref) => !went.has(ref.unique)).map((ref) => ref.unique));
    return { trashed: refs.filter((ref) => went.has(ref.unique)), failed };
  }
}

/**
 * A result from its parts, with the keeps applied (design §16.6): the lists and the bar leave out what
 * is kept now. Exported so the screens' tests build their results the way the context does.
 * @param checkId The check's number.
 * @param checkedAt When the check finished.
 * @param items Every item.
 * @param orphaned Every orphaned file, kept ones included.
 * @param folders Every folder.
 * @param keeps Every keep; none by default.
 * @returns The result.
 */
export function resultOf(
  checkId: number,
  checkedAt: Date,
  items: HealthItem[],
  orphaned: HealthOrphan[],
  folders: HealthFolder[],
  keeps: HealthKeep[] = [],
): UmbraDesktopMediaHealthResult {
  const sorted = [...items].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
  const all = listsOf(sorted, orphaned);
  const keeping = keepingOf(all, sorted, keeps);
  return {
    checkId,
    checkedAt,
    items: sorted,
    orphans: all.orphaned,
    folders,
    lists: keeping.lists,
    bar: barOf(keeping.lists, sizeOfAll(sorted)),
    keeps,
    kept: keeping.kept,
    ended: keeping.ended,
    keptCount: keeping.keptCount,
  };
}

/**
 * The library's item count from a status, which every status carries, so No check yet can say how big
 * the job is (design §16.3); folded into the change it comes with, so the window draws once.
 * @param status The status.
 * @returns The change, empty when the server sent no count.
 */
function countOf(status: HealthStatus): Partial<UmbraDesktopMediaHealthState> {
  return typeof status.mediaCount === 'number' ? { mediaCount: status.mediaCount } : {};
}

/**
 * The window's phase for a check the server reports as running: its step and how far it is.
 * @param running The check.
 * @returns The phase.
 */
function phaseOf(running: HealthCheck): UmbraDesktopMediaHealthPhase {
  const step: UmbraDesktopMediaHealthStep = running.phase === 'Disk' ? 'disk' : running.phase === 'Saving' ? 'loading' : 'usage';
  return { kind: 'running', step, scanned: running.scanned, total: running.total };
}

/** The Media Health context, for the window and the Manager. */
export const UMBRADESKTOP_MEDIA_HEALTH_CONTEXT = new UmbContextToken<UmbraDesktopMediaHealthContext>('UmbraDesktopMediaHealthContext');

export { UmbraDesktopMediaHealthContext as api };
