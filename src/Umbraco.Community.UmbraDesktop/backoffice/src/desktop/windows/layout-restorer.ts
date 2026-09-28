import { serialiseLayout, snapshotLayout } from './layout';
import type { UmbraDesktopSavedWindow, UmbraDesktopWindowLayout } from './layout';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { Observable, Subscription } from '@umbraco-cms/backoffice/external/rxjs';

/** How long a saved window waits for its app to appear before it is dropped, in ms. */
export const UMBRADESKTOP_LAYOUT_RESTORE_DEADLINE_MS = 10_000;

/** How long the layout has to stay still before it is saved, in ms. */
export const UMBRADESKTOP_LAYOUT_SAVE_DELAY_MS = 1_000;

/** What the restorer needs. Narrow on purpose, so a test can hand it a real manager and fakes. */
export interface UmbraDesktopWindowLayoutRestorerSources {
  /** Where the layout is kept: this browser's localStorage (see `layout-persistence.ts`). */
  persistence: {
    load(): Promise<{ layout: UmbraDesktopWindowLayout }>;
    save(layout: UmbraDesktopWindowLayout): Promise<boolean>;
  };
  /** The window manager. */
  manager: {
    readonly windows: Observable<ReadonlyArray<UmbraDesktopWindow>>;
    getWindows(): ReadonlyArray<UmbraDesktopWindow>;
    restoreWindow(saved: UmbraDesktopSavedWindow, app: UmbraDesktopApp): void;
    focus(id: string): void;
  };
  /** The apps this user may open, as the catalogue delivers them: possibly a few at a time. */
  apps: Observable<ReadonlyArray<UmbraDesktopApp>>;
  /** Whether this user wants their windows reopened (Desktop settings > General). */
  reopen: boolean;
  /** How long a saved window waits for its app. Defaults to {@link UMBRADESKTOP_LAYOUT_RESTORE_DEADLINE_MS}. */
  deadlineMs?: number;
  /** How long the layout must stay still before it is saved. Defaults to {@link UMBRADESKTOP_LAYOUT_SAVE_DELAY_MS}. */
  saveDelayMs?: number;
}

/**
 * Reopens the windows a user had open when the desktop starts, and keeps their layout saved after.
 *
 * **Restoring waits for apps.** The catalogue delivers apps as their packages register, and a
 * package's bundle can land a while after the desktop is up, so a saved window whose app has not
 * appeared yet is kept waiting rather than dropped. Each is restored the moment its app appears, in
 * the saved stacking order within each arrival, and whatever is still waiting when the deadline
 * passes is dropped: an uninstalled package, or a section the user can no longer open. Then the
 * window that was active is given focus, once, rather than every window taking it in turn.
 *
 * **Saving starts only when restoring has finished.** Before then the open windows are a partial
 * picture of the saved layout, and saving it would overwrite the whole one: a window still waiting
 * for its package would be forgotten for good. After that, the layout is saved once it has stayed
 * still for a moment, so a drag is one save rather than one per pixel, and not at all when nothing
 * that is kept actually changed.
 *
 * Saving continues when reopening is switched off, so switching it back on reopens what the user
 * last had rather than something weeks old.
 */
export class UmbraDesktopWindowLayoutRestorer {
  /** What it works with. */
  #sources: UmbraDesktopWindowLayoutRestorerSources;

  /** Every subscription it holds, released by {@link stop}. */
  #subscriptions: Subscription[] = [];

  /** Every timer it holds, cleared by {@link stop}. */
  #timers = new Set<number>();

  /** The layout as last saved or loaded, to tell a real change from a repeat. */
  #lastSaved?: string;

  /** Whether {@link stop} has been called, after which nothing more happens. */
  #stopped = false;

  /**
   * @param sources What it works with.
   */
  constructor(sources: UmbraDesktopWindowLayoutRestorerSources) {
    this.#sources = sources;
  }

  /**
   * Load the layout, reopen it if the user wants, then start keeping it saved.
   * @returns A promise settling once restoring has finished, successfully or at the deadline.
   */
  async start(): Promise<void> {
    const { layout } = await this.#sources.persistence.load();
    if (this.#stopped) return;
    this.#lastSaved = serialiseLayout(layout);
    if (this.#sources.reopen && layout.windows.length > 0) {
      await this.#restore(layout);
      if (this.#stopped) return;
      // The restored windows are the saved layout, reopened: the same windows in the same places,
      // though not byte for byte (stacking numbers are renumbered, and a backoffice window now
      // records the address it opened at). Taking them as the baseline is what keeps the first
      // update after a restore from saving a layout nobody changed.
      this.#lastSaved = serialiseLayout(snapshotLayout(this.#sources.manager.getWindows()));
    }
    if (this.#stopped) return;
    this.#keepSaved();
  }

  /** Stop: release every subscription and timer. Nothing is restored or saved after this. */
  stop(): void {
    this.#stopped = true;
    for (const subscription of this.#subscriptions) subscription.unsubscribe();
    this.#subscriptions = [];
    for (const timer of this.#timers) window.clearTimeout(timer);
    this.#timers.clear();
  }

  /**
   * Reopen the saved windows as their apps appear, until they all have or the deadline passes, then
   * give focus to the one that was active.
   * @param layout The saved layout.
   * @returns A promise settling when restoring has finished.
   */
  #restore(layout: UmbraDesktopWindowLayout): Promise<void> {
    const waiting = [...layout.windows].sort((a, b) => a.z - b.z);
    const active = layout.windows.find((saved) => saved.active);
    let activeId: string | undefined;

    return new Promise<void>((resolve) => {
      let subscription: Subscription | undefined;
      let deadline: number | undefined;
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        subscription?.unsubscribe();
        if (deadline !== undefined) {
          window.clearTimeout(deadline);
          this.#timers.delete(deadline);
        }
        if (activeId && !this.#stopped) this.#sources.manager.focus(activeId);
        resolve();
      };

      subscription = this.#sources.apps.subscribe((apps) => {
        if (done || this.#stopped) return;
        for (const saved of [...waiting]) {
          const app = apps.find((candidate) => candidate.alias === saved.app);
          if (!app) continue;
          this.#sources.manager.restoreWindow(saved, app);
          waiting.splice(waiting.indexOf(saved), 1);
          const windows = this.#sources.manager.getWindows();
          if (saved === active) activeId = windows[windows.length - 1]?.id;
        }
        if (waiting.length === 0) finish();
      });
      this.#subscriptions.push(subscription);

      if (!done) {
        deadline = window.setTimeout(finish, this.#sources.deadlineMs ?? UMBRADESKTOP_LAYOUT_RESTORE_DEADLINE_MS);
        this.#timers.add(deadline);
      }
    });
  }

  /** Save the layout whenever it has changed and then stayed still for a moment. */
  #keepSaved(): void {
    let pending: number | undefined;
    const subscription = this.#sources.manager.windows.subscribe((windows) => {
      if (this.#stopped) return;
      const snapshot = snapshotLayout(windows);
      const payload = serialiseLayout(snapshot);
      if (pending !== undefined) {
        window.clearTimeout(pending);
        this.#timers.delete(pending);
        pending = undefined;
      }
      if (payload === this.#lastSaved) return;
      pending = window.setTimeout(() => {
        if (pending !== undefined) this.#timers.delete(pending);
        pending = undefined;
        if (this.#stopped) return;
        this.#lastSaved = payload;
        void this.#sources.persistence.save(snapshot);
      }, this.#sources.saveDelayMs ?? UMBRADESKTOP_LAYOUT_SAVE_DELAY_MS);
      this.#timers.add(pending);
    });
    this.#subscriptions.push(subscription);
  }
}
