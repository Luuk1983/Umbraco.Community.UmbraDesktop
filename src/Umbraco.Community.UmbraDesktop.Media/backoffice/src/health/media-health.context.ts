import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../context/media-manager.context.js';
import type { UmbraDesktopMediaManagerContext } from '../context/media-manager.context.js';
import type { UmbraDesktopMediaRef } from '../operations/media-api.js';
import { UmbraDesktopMediaHealthClient } from './health.client.js';
import type { HealthCheck, HealthItem, HealthOrphan, HealthStatus } from './health.client.js';
import { libraryOf, oversizedOf, topFoldersOf, unusedOf } from './health-model.js';
import type { HealthLibrary, HealthSegment } from './health-model.js';

/** How often a running check is asked where it is: every two seconds, and never otherwise (design §5). */
export const HEALTH_POLL_MS = 2000;

/** The last check's result: everything the window and, later, the Manager show (design §2, §3). */
export interface UmbraDesktopMediaHealthResult {
  /** When the check finished. */
  checkedAt: Date;
  /** The library in one line. */
  library: HealthLibrary;
  /** The bar. */
  segments: HealthSegment[];
  /** Every item the check classified, largest first, for the Manager's facts (steps 4 and 5). */
  items: HealthItem[];
  /** The unused items, largest first. */
  unused: HealthItem[];
  /** The files on disk no item owns, largest first. */
  orphaned: HealthOrphan[];
  /** The images over the threshold, largest first. */
  oversized: HealthItem[];
}

/** Which part of a check runs: reading the library and its usage, walking the disk, or reading the result. */
export type UmbraDesktopMediaHealthStep = 'usage' | 'disk' | 'loading';

/** Where the check is. */
export type UmbraDesktopMediaHealthPhase =
  | { kind: 'idle' }
  | { kind: 'running'; step: UmbraDesktopMediaHealthStep; scanned: number; total: number }
  | { kind: 'failed'; message: string };

/** What the context holds: where the check is, and the last result if there is one. */
export interface UmbraDesktopMediaHealthState {
  phase: UmbraDesktopMediaHealthPhase;
  result: UmbraDesktopMediaHealthResult | undefined;
}

/** How a delete of orphaned files went, or why it did not. */
export type UmbraDesktopMediaHealthDeleteOutcome =
  | { deleted: number; skipped: Array<{ relativePath: string; reason: string }> }
  | { error: 'denied' | 'failed' };

/** What the context uses beyond its own code, so a test can hand in its own. */
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
  /**
   * Move items to the recycle bin: the Manager's own trash, with its undo and its Transfers row.
   * @param keys The items.
   * @returns The keys that did not go.
   */
  trash?: (keys: ReadonlyArray<string>) => Promise<{ failed: string[] }>;
}

/**
 * The Media Health context (design §3): the check, and the last result, kept on the desktop rather
 * than in the window so closing the window stops nothing and a Manager window can read the facts
 * later. A `umbraDesktopContext`, so the desktop makes it on open and destroys it on leave;
 * constructed with `(host)` by the desktop, the second parameter is for tests.
 *
 * The check itself runs on the server (design §15), which keeps the result in the site's database;
 * this follows it, polling every two seconds only while it runs, and reads the result when it is
 * done. Nothing runs until {@link check} is pressed (design §2). {@link sync} is the one read without
 * it: a window opening asks the server once whether a check exists there already, so a result is
 * never shown as "No check yet" while the server has one.
 */
export class UmbraDesktopMediaHealthContext extends UmbContextBase {
  /** The API. */
  #client: UmbraDesktopMediaHealthClient;

  /** Waits between polls. */
  #wait: (ms: number) => Promise<void>;

  /** The time now. */
  #now: () => Date;

  /** The Manager's trash. */
  #trash: (keys: ReadonlyArray<string>) => Promise<{ failed: string[] }>;

  /** The Manager's context, for the trash. */
  #manager?: UmbraDesktopMediaManagerContext;

  /** Where the check is, and the last result. */
  #state = new UmbObjectState<UmbraDesktopMediaHealthState>({ phase: { kind: 'idle' }, result: undefined });

  /** Where the check is, and the last result, for the window and the Manager. */
  readonly state = this.#state.asObservable();

  /** The check being followed, so a second press joins it rather than starting another. */
  #running?: Promise<void>;

  /** Whether the server has been asked once whether it already holds a check. */
  #synced = false;

  /**
   * @param host The desktop element.
   * @param deps Stand-ins, for tests.
   */
  constructor(host: UmbControllerHost, deps: UmbraDesktopMediaHealthDeps = {}) {
    super(host, UMBRADESKTOP_MEDIA_HEALTH_CONTEXT);
    this.#client = deps.client ?? new UmbraDesktopMediaHealthClient();
    this.#wait = deps.wait ?? ((ms) => new Promise((resolve) => window.setTimeout(resolve, ms)));
    this.#now = deps.now ?? (() => new Date());
    this.#trash = deps.trash ?? ((keys) => this.#trashThroughManager(keys));
    this.consumeContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, (manager) => (this.#manager = manager ?? undefined));
  }

  /** The state now. */
  getState(): UmbraDesktopMediaHealthState {
    return this.#state.getValue();
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

  /** The whole check: start it, then follow it. */
  async #check(): Promise<void> {
    this.#phase({ kind: 'running', step: 'usage', scanned: 0, total: 0 });
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
      this.#phase(phaseOf(current.running));
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
      this.#phase({ kind: 'failed', message: status.failed.error || 'failed' });
      return;
    }
    if (status.last) await this.#load(status.last);
    else this.#phase({ kind: 'idle' });
  }

  /**
   * Read a finished check: every item, the orphaned files and the folders, and sum them.
   * @param last The check.
   */
  async #load(last: HealthCheck): Promise<void> {
    this.#phase({ kind: 'running', step: 'loading', scanned: 0, total: 0 });
    const items = await this.#client.allItems();
    const orphaned = await this.#client.orphans();
    const folders = await this.#client.folders();
    if (!items.data || !orphaned.data || !folders.data) {
      return this.#phase({ kind: 'failed', message: items.error ?? orphaned.error ?? folders.error ?? 'failed' });
    }
    const checkedAt = last.finishedUtc ? new Date(last.finishedUtc) : this.#now();
    this.#state.setValue({ phase: { kind: 'idle' }, result: this.#summed(checkedAt, items.data, orphaned.data, folders.data.length) });
  }

  /**
   * A result from its parts.
   * @param checkedAt When the check finished.
   * @param items Every item.
   * @param orphaned The orphaned files.
   * @param folders How many folders.
   * @returns The result.
   */
  #summed(checkedAt: Date, items: HealthItem[], orphaned: HealthOrphan[], folders: number): UmbraDesktopMediaHealthResult {
    const sorted = [...items].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
    return {
      checkedAt,
      library: libraryOf(sorted, folders),
      segments: topFoldersOf(sorted),
      items: sorted,
      unused: unusedOf(sorted),
      orphaned: [...orphaned].sort((a, b) => b.sizeBytes - a.sizeBytes),
      oversized: oversizedOf(sorted),
    };
  }

  /**
   * Set where the check is, keeping the result.
   * @param phase The phase.
   */
  #phase(phase: UmbraDesktopMediaHealthPhase): void {
    this.#state.setValue({ ...this.#state.getValue(), phase });
  }

  /**
   * Replace the result's items, keeping the rest, and sum again.
   * @param items The items now.
   * @param orphaned The orphaned files now.
   */
  #replace(items: HealthItem[], orphaned: HealthOrphan[]): void {
    const { phase, result } = this.#state.getValue();
    if (!result) return;
    this.#state.setValue({ phase, result: this.#summed(result.checkedAt, items, orphaned, result.library.folders) });
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
    if (result) this.#replace(result.items, result.orphaned.filter((each) => !gone.has(each.relativePath.toLowerCase())));
    return { deleted: answer.data.deleted.length, skipped: answer.data.skipped };
  }

  /**
   * Move items to the recycle bin, through the Manager (design §5: core's trash, everywhere), and
   * drop the ones that went from the result. The server's copy of the result still lists them until
   * the next check, as it lists anything trashed from the Media section: the result is a snapshot.
   * @param keys The items.
   * @returns The keys that did not go.
   */
  async trash(keys: ReadonlyArray<string>): Promise<{ failed: string[] }> {
    const outcome = await this.#trash(keys);
    const stayed = new Set(outcome.failed);
    const gone = new Set(keys.filter((key) => !stayed.has(key)));
    const result = this.#state.getValue().result;
    if (result) this.#replace(result.items.filter((each) => !gone.has(each.key)), result.orphaned);
    return outcome;
  }

  /**
   * Take items' new sizes, as Optimize images reports them, so the rows and the bar follow without
   * another check.
   * @param sizes Each item's key and its size now.
   */
  resized(sizes: ReadonlyArray<{ unique: string; sizeBytes: number }>): void {
    const bySize = new Map(sizes.map((each) => [each.unique.toLowerCase(), each.sizeBytes]));
    const result = this.#state.getValue().result;
    if (!result) return;
    this.#replace(
      result.items.map((each) => (bySize.has(each.key.toLowerCase()) ? { ...each, sizeBytes: bySize.get(each.key.toLowerCase())! } : each)),
      result.orphaned,
    );
  }

  /**
   * The Manager's trash: its refs read from the server, then its operation, with undo and a row in
   * Transfers.
   * @param keys The items.
   * @returns The keys that did not go.
   */
  async #trashThroughManager(keys: ReadonlyArray<string>): Promise<{ failed: string[] }> {
    const manager = this.#manager;
    if (!manager) return { failed: [...keys] };
    const refs: UmbraDesktopMediaRef[] = [];
    const failed: string[] = [];
    for (const key of keys) {
      const { data } = await manager.api.item(key);
      if (data) refs.push(data);
      else failed.push(key);
    }
    if (refs.length) {
      const outcome = await manager.trash(refs);
      failed.push(...outcome.failed.map((each) => each.item.unique));
      if (outcome.cancelled) {
        failed.push(...refs.filter((ref) => !outcome.succeeded.some((each) => each.item.unique === ref.unique) && !failed.includes(ref.unique)).map((ref) => ref.unique));
      }
    }
    return { failed };
  }
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
