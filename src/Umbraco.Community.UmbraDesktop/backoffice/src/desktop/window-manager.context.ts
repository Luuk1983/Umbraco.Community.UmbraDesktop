import type { UmbraDesktopApp, UmbraDesktopWindow, UmbraDesktopWindowState, Rect } from './types';
import {
  focusWindow,
  moveWindow,
  nextWindowRect,
  nextZIndex,
  removeWindow,
  setWindowState,
  findAppWindow,
  setWindowRect,
  setWindowDirty,
  unsavedWindows,
  clampWindowsToBounds,
  setWindowServerState,
  setWindowAcknowledged,
  setWindowRefreshing,
  conflictedWindows,
  snapWindow,
  unsnapWindow,
  clearSnap,
  resnapWindows,
  isResizable,
} from './window-model';
import { snapRect, snapTargetAt } from './snap';
import type { UmbraDesktopSnapTarget } from './snap';
import {
  UMBRADESKTOP_DEFAULT_METRICS,
  UMBRADESKTOP_SNAP_EDGE,
  UMBRADESKTOP_WINDOW_KEEP_VISIBLE,
  UMBRADESKTOP_WINDOW_MIN_SIZE,
} from './constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from './window-manager.context-token';
import { minWindowSizeForContent, windowSizeForContent } from './window-chrome';
import { windowShowsPath } from './path/crumbs.js';
import type { UmbraDesktopThemeMetrics } from './theme/types';
import type { UmbraDesktopKeepVisible } from './window-model';
import type { UmbraDesktopServerStatePatch } from './window-model';
import type { UmbraDesktopWorkspaceSubject } from './dirty-watcher';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UMB_DISCARD_CHANGES_MODAL, umbConfirmModal, umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';

/**
 * The **content** box a window opens at when its app names no `defaultSize`.
 *
 * Content and not window, like every size an app declares: the active theme's chrome is added on
 * top, so an app with no opinion opens with the same amount of usable room under all five themes
 * rather than losing a taller theme's caption out of the bottom of it.
 */
const DEFAULT_CONTENT_SIZE = { w: 800, h: 600 };

/**
 * Owns the list of open desktop windows and the operations on it. Provided by
 * the desktop element so it is scoped to the desktop subtree.
 */
export class UmbraDesktopWindowManagerContext extends UmbContextBase {
  #windows = new UmbArrayState<UmbraDesktopWindow>([], (w) => w.id);

  /** Observable list of open windows. */
  public readonly windows = this.#windows.asObservable();

  /**
   * What each window is showing, by window id, for the server-event router to match events
   * against.
   *
   * Deliberately **not** on the window model. The model is an observable list whose identity drives
   * rendering, and a subject carries live functions (`reload`, `loadWithoutPersist`) that change
   * whenever a frame reloads: putting them there would re-render every window on the desktop each
   * time any frame navigated, and would put unserialisable members into state that is otherwise
   * plain data. The router reads this on demand instead, which is the only access pattern it needs.
   */
  #subjects = new Map<string, ReadonlyArray<UmbraDesktopWorkspaceSubject>>();

  /**
   * The identity of the last **non-empty** subject set each window reported, so {@link setSubjects}
   * can tell "this window now shows a different document" from the empty gap `#startDirtyWatch`
   * deliberately passes through on every frame reload.
   *
   * Identity, not the subjects themselves: comparing the objects `dirty-watcher.ts` hands over would
   * never match, because it rebuilds them on every keystroke (see its own `evaluate`). This stores
   * the same `entityType:unique` pairing a server event is matched against instead, which is stable
   * across a document being merely re-evaluated. Absent for a window that has never reported a
   * non-empty set, which is what keeps a window's very first document from being read as "changed
   * from nothing" and clearing flags that were never set.
   */
  #lastSubjectIdentity = new Map<string, string>();

  /**
   * The localizer for the two dialogs this context opens.
   *
   * A controller of its own because `this.localize` is a member of `UmbLitElement` and this is a
   * context: the guards are the only part of the manager that produces text, and they need the same
   * localizer the elements use rather than raw keys.
   */
  #localize = new UmbLocalizationController(this);

  /**
   * What must stay reachable while dragging, under the active theme. Defaults to the Umbraco
   * theme's geometry until the theme context resolves one.
   */
  #keep: UmbraDesktopKeepVisible = UMBRADESKTOP_WINDOW_KEEP_VISIBLE;

  /**
   * The active theme's full geometry, which is what {@link open} needs: sizing a window around an
   * app's content box takes the theme's chrome cost, and that is not one of the four fields
   * {@link keep} carries.
   *
   * Defaults to the base chrome's own metrics, which is the same object the Umbraco theme
   * publishes — so "before a theme resolves" and "under the identity theme" are one state rather
   * than two that happen to agree.
   */
  #metrics: UmbraDesktopThemeMetrics = UMBRADESKTOP_DEFAULT_METRICS;

  /** The last desktop size seen, so a theme change can re-clamp without waiting for a resize. */
  #bounds?: { w: number; h: number };

  /**
   * Where the window being dragged would land if it were released now, or undefined when no snap
   * is on offer. The desktop draws this as a ghost.
   *
   * On the manager rather than in the window element, even though only a drag ever sets it, because
   * the rectangle has to come from the same arithmetic the commit spends — a ghost that promised
   * one rectangle and delivered another would be worse than no ghost — and because the element that
   * has to *draw* it is the desktop, which is the dragged window's grandparent. One observable
   * answers both.
   */
  #snapPreview = new UmbObjectState<Rect | undefined>(undefined);

  /** Observable ghost rectangle; see {@link previewSnap}. */
  public readonly snapPreview = this.#snapPreview.asObservable();

  /**
   * The snap the current drag is offering, kept beside the ghost so {@link commitSnap} applies the
   * offer the user was actually looking at rather than recomputing one from a pointer position that
   * has since moved. Cleared with the ghost.
   */
  #pendingSnap?: { id: string; target: UmbraDesktopSnapTarget };

  /**
   * The active theme's keep-visible margins. Read by the window element, which clamps live during
   * a drag rather than going through this context.
   *
   * `Readonly` because this hands out the live object: a caller that wrote to it would corrupt the
   * clamp for every window, and there is nothing else to stop them.
   * @returns The margins in force.
   */
  public get keep(): Readonly<UmbraDesktopKeepVisible> {
    return this.#keep;
  }

  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT);
  }

  /**
   * Open a new window for the given app and focus it. If the app forbids multiple
   * instances and one is already open, focus that instead of opening another.
   *
   * `defaultSize` is the app's **content** box, so the active theme's chrome is added here rather
   * than being the app's problem: the app cannot read a titlebar height from another package, and
   * the one that tried guessed a single allowance for five different titlebars.
   * @param app The app to open.
   */
  public open(app: UmbraDesktopApp): void {
    const current = this.#windows.getValue();
    if (app.allowMultiple === false) {
      const existing = findAppWindow(current, app.alias);
      if (existing) {
        this.focus(existing.id);
        return;
      }
    }
    const rect = nextWindowRect(
      current.length,
      windowSizeForContent(
        app.defaultSize ?? DEFAULT_CONTENT_SIZE,
        this.#metrics,
        // A section window's path strip is chrome, so it is added to the window rather than taken
        // out of the app: a Media window asking for 960x680 of backoffice still gets 680.
        windowShowsPath(app) ? this.#metrics.pathbarHeight : 0,
      ),
    );
    const win: UmbraDesktopWindow = {
      id: crypto.randomUUID(),
      app,
      rect,
      z: nextZIndex(current),
      active: true,
      state: 'normal',
    };
    this.#windows.setValue(focusWindow([...current, win], win.id));
  }

  /** Bring a window to the front and activate it. */
  public focus(id: string): void {
    this.#windows.setValue(focusWindow(this.#windows.getValue(), id));
  }

  /** Close a window, unconditionally. Prefer {@link requestClose}, which guards unsaved work. */
  public close(id: string): void {
    this.#subjects.delete(id);
    this.#lastSubjectIdentity.delete(id);
    this.#windows.setValue(removeWindow(this.#windows.getValue(), id));
  }

  /**
   * Record whether a window's frame is holding unsaved changes. Written by the window element's
   * dirty watcher; read by the titlebar marker and by every guard below.
   *
   * Going clean also clears `changedElsewhere` and `acknowledged`, because **a clean window has no
   * conflict**: the editor either saved, which made their own version the server's, or discarded,
   * which took the server's version instead. There is no third way for a window to become clean, and
   * either way the argument is over. Without this, a stale `changedElsewhere` survives a save and
   * reappears the moment the editor types again for a conflict nothing caused, and a stale
   * `acknowledged` survives to swallow the banner on a genuinely new conflict raised later. Both
   * flags are cleared in the same update as `dirty` — composed from the same pure helpers a plain
   * dirty transition uses, so no render ever sees a window that is clean yet still flagged as
   * conflicted. `trashed` and `deleted` are untouched: the document is still in the bin, or still
   * gone, whatever the editor did with their own edits.
   * @param id The window to mark.
   * @param dirty Whether it holds unsaved changes.
   */
  public setDirty(id: string, dirty: boolean): void {
    const current = this.#windows.getValue();
    let next = setWindowDirty(current, id, dirty);
    if (!dirty) {
      next = setWindowAcknowledged(setWindowServerState(next, id, { changedElsewhere: false }), id, false);
    }
    if (next !== current) this.#windows.setValue(next);
  }

  /**
   * Every open window holding unsaved changes. Exit warns from this; see the taskbar.
   * @returns The marked windows, in list order.
   */
  public unsavedWindows(): ReadonlyArray<UmbraDesktopWindow> {
    return unsavedWindows(this.#windows.getValue());
  }

  /**
   * The current window list, for callers that need a snapshot rather than the observable.
   *
   * The server-event router reads this: it answers one event against whatever is open at that
   * moment and has no use for a subscription, so an accessor is the honest shape rather than making
   * it consume `windows` and hold a copy.
   * @returns The open windows, in list order.
   */
  public getWindows(): ReadonlyArray<UmbraDesktopWindow> {
    return this.#windows.getValue();
  }

  /**
   * Record what the server says happened to a window's subject. Written by the server-event router.
   * @param id The window to mark.
   * @param patch The flags to set; see {@link UmbraDesktopServerStatePatch}.
   */
  public setServerState(id: string, patch: UmbraDesktopServerStatePatch): void {
    this.#windows.setValue(setWindowServerState(this.#windows.getValue(), id, patch));
  }

  /**
   * Record what a window is showing, so the router can match server events against it. Written by
   * the window element each time its frame's workspaces change.
   *
   * Also clears `changedElsewhere`, `trashed`, `deleted` and `acknowledged` when the window has
   * started showing a **different** document, because those four flags describe the subject the
   * server-event router matched them against and not the window itself. A window hosting the
   * Content section navigates internally all the time, and in-window navigation is not an iframe
   * load, so `#startDirtyWatch`'s own reset — which runs only on a real frame load — never reaches
   * this case on its own.
   *
   * The precise rule, because the edge cases decide it: clear only when the incoming set is
   * **non-empty and different** from the last non-empty set this window reported, per
   * {@link #lastSubjectIdentity}. An empty set — what `#startDirtyWatch` deliberately reports while
   * a frame is between documents — clears nothing and is not remembered as "the last subject",
   * because a reload of a document that was permanently deleted must keep saying so rather than
   * silently forgetting the moment the frame starts reloading it. A window's very first subject
   * likewise clears nothing, since there is no earlier document for it to differ from.
   *
   * Without this, opening node A, having a colleague empty the recycle bin under it (`deleted:
   * true`), and then clicking node B in the same window's tree would carry `deleted` onto B: B's
   * `confirmDiscard` would short-circuit on `target.deleted` and let the editor close over
   * unsaved work on B with no prompt at all — a regression of the unsaved-changes guard this
   * feature must not cause.
   *
   * One state update, not two: both `#windows.setValue` calls below are folded into the pure
   * helpers first, so no render ever sees a window with its subject moved but its old flags still
   * standing.
   * @param id The window.
   * @param subjects What it is showing.
   */
  public setSubjects(id: string, subjects: ReadonlyArray<UmbraDesktopWorkspaceSubject>): void {
    this.#subjects.set(id, subjects);
    if (subjects.length === 0) return;
    const identity = subjects.map((s) => `${s.entityType}:${s.unique}`).join(',');
    const previous = this.#lastSubjectIdentity.get(id);
    this.#lastSubjectIdentity.set(id, identity);
    if (previous === undefined || previous === identity) return;
    const current = this.#windows.getValue();
    const next = setWindowAcknowledged(
      setWindowServerState(current, id, { changedElsewhere: false, trashed: false, deleted: false }),
      id,
      false,
    );
    if (next !== current) this.#windows.setValue(next);
  }

  /**
   * What a window is showing.
   * @param id The window.
   * @returns Its subjects, or an empty list for a window that has none or is gone.
   */
  public subjectsOf(id: string): ReadonlyArray<UmbraDesktopWorkspaceSubject> {
    return this.#subjects.get(id) ?? [];
  }

  /**
   * Every open window whose unsaved work is also about to overwrite somebody else's. What the Exit
   * dialog counts for its second sentence.
   * @returns The windows at risk, in list order.
   */
  public conflictedWindows(): ReadonlyArray<UmbraDesktopWindow> {
    return conflictedWindows(this.#windows.getValue());
  }

  /**
   * Mark a window as re-fetching itself, which spins its titlebar reload glyph.
   *
   * Called by the server-event router around every workspace reload it performs, and by the
   * banner's discard action. Both are refreshes the editor did not ask for at that moment, and the
   * spinning glyph is the whole of what the desktop says about them: design D7 settles that a
   * silent refresh is right, because desktop applications update while you read them without
   * announcing it, but a refresh with no visible cause at all reads as a glitch.
   * @param id The window.
   * @param refreshing Whether a fetch is in flight.
   */
  public setRefreshing(id: string, refreshing: boolean): void {
    this.#windows.setValue(setWindowRefreshing(this.#windows.getValue(), id, refreshing));
  }

  /**
   * Confirm that the editor means to keep their own version over somebody else's, and record it if
   * they do.
   *
   * Gated by a confirmation rather than applied on click, because "keep my changes" is the one
   * action here that chooses data loss: it is the other editor's change that goes, and it goes
   * later, at a save the editor has not made yet. Confirming quiets this notice's banner and
   * nothing else. Design D10.
   * @param id The window whose conflict is being acknowledged.
   */
  public async acknowledge(id: string): Promise<void> {
    if (!(await this._askToKeepMine())) return;
    this.#windows.setValue(setWindowAcknowledged(this.#windows.getValue(), id, true));
  }

  /**
   * Open the confirmation behind "keep my changes".
   *
   * Split out for the same reason {@link _askToDiscard} is: a modal manager context only resolves
   * inside a booted backoffice, and the decision is worth testing without one.
   * @returns True when the editor confirmed.
   */
  protected async _askToKeepMine(): Promise<boolean> {
    try {
      await umbConfirmModal(this, {
        headline: this.#localize.term('umbraDesktop_noticeKeepHeadline'),
        content: this.#localize.term('umbraDesktop_noticeKeepQuestion'),
        confirmLabel: this.#localize.term('umbraDesktop_noticeKeepConfirm'),
        color: 'warning',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open the close-this-window question for a window whose document also changed on the server.
   *
   * A second wording rather than a reuse of core's discard dialog, because the two say opposite
   * things. Core's is built to discourage closing, which is right when closing is what loses work.
   * Here saving is what loses work, closing is the safe act, and a dialog that warns against the
   * safe act pushes the editor towards the destructive one. Design §9.
   * @returns True when the editor chose to close.
   */
  protected async _askToDiscardConflicted(): Promise<boolean> {
    try {
      await umbConfirmModal(this, {
        headline: this.#localize.term('umbraDesktop_discardConflictedHeadline'),
        content: this.#localize.term('umbraDesktop_discardConflictedQuestion'),
        confirmLabel: this.#localize.term('umbraDesktop_noticeCloseWindow'),
        color: 'warning',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open the backoffice's own discard-changes dialog.
   *
   * Split out as its own method purely so it can be substituted in tests — a modal manager context
   * only resolves inside a booted backoffice, and the guard's decisions are worth testing without
   * one. Resolving the modal means discard; rejecting it means the user chose to stay.
   * @returns True when the user chose to discard.
   */
  protected async _askToDiscard(): Promise<boolean> {
    try {
      await umbOpenModal(this, UMB_DISCARD_CHANGES_MODAL);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask, if there is anything to lose, whether a window's unsaved changes may be discarded.
   *
   * Answers without a dialog for a window that is clean — or one that is no longer open, so a
   * caller racing a close is not stranded. Reused rather than inlined into {@link requestClose}
   * because the titlebar's reload button needs the same question and then does something else
   * entirely with the answer: it reloads the frame in place rather than closing the window.
   *
   * The dialog is core's `UMB_DISCARD_CHANGES_MODAL`, the same token `entity-detail-workspace-base`
   * opens when you navigate away from a dirty workspace. Reusing the token is what makes this *the
   * same wording* the backoffice uses elsewhere, rather than a copy of it that drifts.
   * @param id The window whose changes are at stake.
   * @returns True when the window may be discarded.
   */
  public async confirmDiscard(id: string): Promise<boolean> {
    const target = this.#windows.getValue().find((w) => w.id === id);
    if (!target?.dirty) return true;
    // A document that no longer exists cannot be saved to, so "discard your changes?" offers a
    // choice that does not exist. Closing is the only thing left and it asks nothing.
    if (target.deleted) return true;
    // Keyed on `changedElsewhere` rather than on severity, which is the distinction that decides
    // which of the two things closing does. Somebody else's change is at stake only here: closing
    // keeps their version and discards yours, so closing is the safe act and the dialog says so.
    // A trashed document is also a warning, and there the ordinary question is the right one:
    // core's read-only guard means the work cannot be saved from that window at all once it
    // reloads, so closing still loses only your own work and nobody else's.
    if (target.changedElsewhere) return this._askToDiscardConflicted();
    return this._askToDiscard();
  }

  /**
   * Close a window, asking first when it holds unsaved changes. Cancelling leaves the window open
   * with its edits still in it. This is what the titlebar's close button calls.
   * @param id The window to close.
   */
  public async requestClose(id: string): Promise<void> {
    if (await this.confirmDiscard(id)) this.close(id);
  }

  /**
   * Move a window to an absolute desktop position, which also ends any snap it was in.
   *
   * A dragged snapped window is un-snapped before the first move reaches here (the window element
   * restores it under the pointer first), so the release is belt and braces rather than the path
   * anything takes. It is what keeps the invariant simple: if `snapped` is set, `rect` is the
   * desktop's arithmetic and nobody else's.
   * @param id The window to move.
   * @param x The new left, in px.
   * @param y The new top, in px.
   */
  public move(id: string, x: number, y: number): void {
    this.#windows.setValue(clearSnap(moveWindow(this.#windows.getValue(), id, x, y), id));
  }

  /**
   * Resize a window to an absolute rectangle (already clamped by the caller). Ignored for a
   * `resizable: false` window, which has no handles to drag, so this only guards other callers.
   * @param id The window to resize.
   * @param rect The new rectangle.
   */
  public resize(id: string, rect: Rect): void {
    if (this.#isFixedSize(id)) return;
    // Resizing a snapped window ends the snap: the size is the user's now, and the next desktop
    // resize must not re-derive it back to a half and undo them.
    this.#windows.setValue(clearSnap(setWindowRect(this.#windows.getValue(), id, rect), id));
  }

  /**
   * Un-maximize a window straight to a given position, in one update. Dragging a maximized window
   * restores it, and doing that as a state change followed by a move would paint the window
   * full-size for a frame before it snapped under the pointer.
   * @param id The window to restore.
   * @param x The position to restore it at.
   * @param y The position to restore it at.
   */
  public restoreTo(id: string, x: number, y: number): void {
    const restored = setWindowState(this.#windows.getValue(), id, 'normal');
    this.#windows.setValue(moveWindow(restored, id, x, y));
  }

  /**
   * Re-clamp every window into the desktop's current size. Called when the desktop surface itself
   * resizes — a viewport that shrinks under a window would otherwise strand it out of reach with no
   * way to drag it back. Skips the update entirely when nothing had to move, so a resize that
   * affects no window costs no re-render.
   *
   * Also **remembers** `bounds`, so that switching theme — which can move the window controls to
   * the other end of the titlebar and change what "reachable" means — can re-clamp immediately
   * instead of waiting for the next resize that may never come. See {@link setMetrics}.
   * @param bounds The new desktop surface size in px.
   */
  public clampToBounds(bounds: { w: number; h: number }): void {
    this.#bounds = bounds;
    const current = this.#windows.getValue();
    // Snapped windows first: a half of the old desktop is not a half of this one, and the clamp
    // below should see the rectangles these windows are actually going to have.
    const next = clampWindowsToBounds(
      resnapWindows(current, bounds, (w) => this.#minWindowSize(w)),
      bounds,
      this.#keep,
    );
    if (next !== current) this.#windows.setValue(next);
  }

  /**
   * Adopt the active theme's geometry, then pull any window the new chrome has stranded back into
   * reach — a window parked against the right edge under trailing controls sits outside the clamp
   * once those controls move to the left.
   *
   * The whole object is kept, not only the four fields the clamp reads: {@link open} sizes a window
   * around an app's content box and needs this theme's chrome cost to do it. Windows already open
   * keep the size they have, which is the same decision the clamp makes — a theme change moves a
   * window only when the new chrome would otherwise put it out of reach.
   * @param metrics The active theme's metrics.
   */
  public setMetrics(metrics: UmbraDesktopThemeMetrics): void {
    this.#metrics = metrics;
    this.#keep = {
      grab: metrics.grab,
      leading: metrics.leadingControlsWidth,
      trailing: metrics.trailingControlsWidth,
      titlebar: metrics.titlebarHeight,
    };
    if (this.#bounds) this.clampToBounds(this.#bounds);
  }

  /**
   * Set a window's state (normal / minimized / maximized).
   *
   * Maximizing a `resizable: false` window is ignored, here rather than at the maximize button,
   * because the button is only one of the ways in: a titlebar double-click and a drag into the top
   * edge both arrive here too. Minimizing and restoring change nothing about a window's size, so
   * they are allowed.
   * @param id The window to change.
   * @param state The state to put it in.
   */
  public setState(id: string, state: UmbraDesktopWindowState): void {
    if (state === 'maximized' && this.#isFixedSize(id)) return;
    this.#windows.setValue(setWindowState(this.#windows.getValue(), id, state));
  }

  /**
   * Whether the window asked to keep its size, `resizable: false`. See `isResizable`.
   *
   * Every method that could change a window's size asks this first, which is what makes the flag a
   * property of the window rather than of whichever piece of chrome happened to check it.
   * @param id The window to ask about.
   * @returns True for an open window whose app is fixed-size; false otherwise.
   */
  #isFixedSize(id: string): boolean {
    const window = this.#windows.getValue().find((w) => w.id === id);
    return window !== undefined && !isResizable(window);
  }

  /**
   * The smallest this window may be, chrome included, under the active theme.
   *
   * The same sum {@link open} spends to size a window and the window element spends to floor a
   * resize, from the same terms — so the size a window snaps to and the size it may be dragged to
   * cannot disagree about the path strip or about the chrome.
   * @param w The window to measure.
   * @returns The floor for that window.
   */
  #minWindowSize(w: UmbraDesktopWindow): { w: number; h: number } {
    return minWindowSizeForContent(
      w.app.minSize,
      UMBRADESKTOP_WINDOW_MIN_SIZE,
      this.#metrics,
      windowShowsPath(w.app) ? this.#metrics.pathbarHeight : 0,
    );
  }

  /**
   * Offer — or withdraw — a snap for the window being dragged, given where its pointer is now.
   *
   * An offer and not a snap: nothing about the window changes, only the ghost. The drag keeps
   * moving the window underneath, so letting go anywhere but an edge leaves it exactly where the
   * pointer put it.
   *
   * Silently does nothing before the desktop has reported its size, which is a real moment rather
   * than a defensive one — the surface is behind the settings hold on the first render — and a
   * snap has nothing to be half of until then.
   * @param id The window being dragged.
   * @param pointer The pointer position, relative to the desktop surface's top-left corner.
   */
  public previewSnap(id: string, pointer: { x: number; y: number }): void {
    const bounds = this.#bounds;
    if (!bounds) return;
    const target = snapTargetAt(pointer, bounds, UMBRADESKTOP_SNAP_EDGE);
    const window = this.#windows.getValue().find((w) => w.id === id);
    // A fixed-size window is never offered a snap: every snap is a new size, the top one included,
    // which maximizes. No offer means no ghost and nothing for commitSnap to take.
    if (!target || !window || !isResizable(window)) {
      this.clearSnapPreview();
      return;
    }
    this.#pendingSnap = { id, target };
    this.#snapPreview.setValue(snapRect(target, bounds, this.#minWindowSize(window)));
  }

  /**
   * Take whatever snap is currently on offer for `id`, and clear the ghost either way.
   *
   * A top snap maximizes rather than writing a full-surface rectangle into `rect`. Maximized
   * already means this, already restores under a dragged pointer and already re-derives itself
   * against the desktop for free, since it is laid out at 100% rather than in pixels; a second
   * full-screen state beside it would be two answers to one question.
   * @param id The window whose drag has ended.
   */
  public commitSnap(id: string): void {
    const pending = this.#pendingSnap;
    const bounds = this.#bounds;
    this.clearSnapPreview();
    if (!pending || pending.id !== id || !bounds) return;
    if (pending.target === 'top') {
      this.setState(id, 'maximized');
      return;
    }
    const current = this.#windows.getValue();
    const window = current.find((w) => w.id === id);
    if (!window) return;
    this.#windows.setValue(
      snapWindow(current, id, pending.target, snapRect(pending.target, bounds, this.#minWindowSize(window))),
    );
  }

  /** Withdraw any snap on offer, leaving the window alone. */
  public clearSnapPreview(): void {
    this.#pendingSnap = undefined;
    if (this.#snapPreview.getValue()) this.#snapPreview.setValue(undefined);
  }

  /**
   * Un-snap a window straight to a given position, in one update — the snapped counterpart of
   * {@link restoreTo}, and it exists for the same reason: a state change followed by a move paints
   * the window in the wrong place for a frame.
   * @param id The window to release.
   * @param x The position to restore it at.
   * @param y The position to restore it at.
   */
  public unsnapTo(id: string, x: number, y: number): void {
    this.#windows.setValue(unsnapWindow(this.#windows.getValue(), id, { x, y }));
  }
}

export default UmbraDesktopWindowManagerContext;
