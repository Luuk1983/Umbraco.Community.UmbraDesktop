import { serialiseLayout, snapshotLayout } from './layout';
import type { UmbraDesktopSavedWindow, UmbraDesktopWindowLayout } from './layout';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import type { Observable, Subscription } from '@umbraco-cms/backoffice/external/rxjs';

/**
 * How long a saved window waits for its app to appear before it is given up on, in ms.
 *
 * The desktop is held behind the boot splash for as long as a restore runs, so this is also the
 * longest a missing app can hold up a load. Five seconds because the two ways of getting it wrong
 * are not equal. Too short, and a package that is merely slow to register (a slow connection is
 * enough) loses its window on every load. Too long only costs anything when an app has gone for
 * good, an uninstalled package or a section the user lost, and then only once: the window is
 * removed from the stored layout the moment it is given up on, so the next load does not wait.
 * Normally every app is already known and the restore is instant, whatever this says.
 */
export const UMBRADESKTOP_LAYOUT_RESTORE_DEADLINE_MS = 5_000;

/** How long the layout has to stay still before it is saved, in ms. */
export const UMBRADESKTOP_LAYOUT_SAVE_DELAY_MS = 1_000;

/** What the restorer needs. Narrow on purpose, so a test can hand it a real manager and fakes. */
export interface UmbraDesktopWindowLayoutRestorerSources {
  /** Where the layout is kept (see `layout-persistence.ts`). */
  store: {
    load(): UmbraDesktopWindowLayout;
    save(layout: UmbraDesktopWindowLayout): void;
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
  /**
   * Whether to reopen the stored layout. False when the restorer starts on a desktop that is
   * already in use, which is when the user switches reopening back on: there it only keeps the
   * layout saved from then on.
   */
  reopen: boolean;
  /** How long a saved window waits for its app. Defaults to {@link UMBRADESKTOP_LAYOUT_RESTORE_DEADLINE_MS}. */
  deadlineMs?: number;
  /** How long the layout must stay still before it is saved. Defaults to {@link UMBRADESKTOP_LAYOUT_SAVE_DELAY_MS}. */
  saveDelayMs?: number;
}

/**
 * Reopens the windows a user had open when the desktop starts, and keeps their layout saved after.
 *
 * **Restoring waits for apps, briefly.** The catalogue delivers apps as their packages register,
 * and a package's bundle can land a moment after the desktop is up, so a saved window whose app has
 * not appeared yet waits for it. Each is restored the moment its app appears, in the saved stacking
 * order within each arrival, and whatever is still waiting at the deadline is given up on. Then the
 * window that was active is given focus, once. None of this is visible: the desktop holds its first
 * paint until {@link start} settles, so nobody is using it while windows appear.
 *
 * **The restored layout is saved at once.** That forgets any window that was given up on, so the
 * next load does not wait for it again, and it gives a tab seeded from the copy kept between visits
 * a working copy of its own.
 *
 * **Nothing else is saved until restoring has finished.** Before then the open windows are a partial
 * picture of the saved layout, and saving it would overwrite the whole one. After that, the layout
 * is saved once it has stayed still for a moment, so a drag is one save rather than one per pixel,
 * not at all when nothing that is kept changed, and at once when the page is hidden, so an F5 right
 * after a change keeps it.
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

  /** Whether restoring has finished and the layout is being kept saved. */
  #saving = false;

  /** A save waiting out its delay: its timer, and what it will write. */
  #pending?: { timer: number; snapshot: UmbraDesktopWindowLayout; payload: string };

  /** Whether {@link stop} has been called, after which nothing more happens. */
  #stopped = false;

  /** Writes a pending save when the page goes away, so it is not lost with it. */
  #onPageHide = () => this.#flushPending();

  /**
   * @param sources What it works with.
   */
  constructor(sources: UmbraDesktopWindowLayoutRestorerSources) {
    this.#sources = sources;
  }

  /**
   * Load the layout, reopen it if asked to, then start keeping it saved.
   * @returns A promise settling once restoring has finished, successfully or at the deadline.
   */
  async start(): Promise<void> {
    const layout = this.#sources.store.load();
    this.#lastSaved = serialiseLayout(layout);
    if (this.#sources.reopen && layout.windows.length > 0) {
      await this.#restore(layout);
      if (this.#stopped) return;
      // Saved straight away, as the new baseline: see the class doc. It is the saved layout,
      // reopened, but not byte for byte (stacking is renumbered, a backoffice window records the
      // address it opened at, and a window given up on is gone), so this is also what keeps the
      // first update after a restore from saving a layout nobody changed.
      const restored = snapshotLayout(this.#sources.manager.getWindows());
      this.#lastSaved = serialiseLayout(restored);
      this.#sources.store.save(restored);
    }
    if (this.#stopped) return;
    this.#keepSaved();
  }

  /**
   * Save the layout now, changed or not, cancelling any save still waiting out its delay. For when
   * where it is kept has just changed, so the new place has it without waiting for the next move.
   * Does nothing until restoring has finished, for the same reason nothing else is saved before.
   */
  saveNow(): void {
    if (!this.#saving || this.#stopped) return;
    this.#cancelPending();
    const snapshot = snapshotLayout(this.#sources.manager.getWindows());
    this.#lastSaved = serialiseLayout(snapshot);
    this.#sources.store.save(snapshot);
  }

  /** Stop: release every subscription, timer and listener. Nothing is restored or saved after this. */
  stop(): void {
    this.#stopped = true;
    this.#saving = false;
    this.#pending = undefined;
    window.removeEventListener('pagehide', this.#onPageHide);
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
          waiting.splice(waiting.indexOf(saved), 1);
          // An update can turn an app into a shortcut to Desktop settings while a layout saved
          // before it still names the app. There is no window to put back (restoring one would load
          // an element that is never loaded), and nobody asked for settings on boot. Taken off the
          // waiting list like a restored window, so the splash is not held for it, and absent from
          // the layout saved when this finishes, so the next load has nothing to skip.
          if (app.opensSettings) continue;
          this.#sources.manager.restoreWindow(saved, app);
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
    this.#saving = true;
    window.addEventListener('pagehide', this.#onPageHide);
    const subscription = this.#sources.manager.windows.subscribe((windows) => {
      if (this.#stopped) return;
      const snapshot = snapshotLayout(windows);
      const payload = serialiseLayout(snapshot);
      this.#cancelPending();
      if (payload === this.#lastSaved) return;
      const timer = window.setTimeout(() => this.#flushPending(), this.#sources.saveDelayMs ?? UMBRADESKTOP_LAYOUT_SAVE_DELAY_MS);
      this.#timers.add(timer);
      this.#pending = { timer, snapshot, payload };
    });
    this.#subscriptions.push(subscription);
  }

  /** Write the save that is waiting out its delay, if there is one, now. */
  #flushPending(): void {
    const pending = this.#pending;
    if (!pending || this.#stopped) return;
    this.#cancelPending();
    this.#lastSaved = pending.payload;
    this.#sources.store.save(pending.snapshot);
  }

  /** Drop the save that is waiting out its delay, if there is one. */
  #cancelPending(): void {
    if (!this.#pending) return;
    window.clearTimeout(this.#pending.timer);
    this.#timers.delete(this.#pending.timer);
    this.#pending = undefined;
  }
}
