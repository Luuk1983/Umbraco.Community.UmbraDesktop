import type { UmbraDesktopApp, UmbraDesktopPane, UmbraDesktopWindow, UmbraDesktopWindowState, Rect } from './types';
import {
  attachedKind,
  dockTargetAt,
  floatingRect,
  focusGroup,
  minimizeInGroup,
  paneTotal,
  placePane,
  removeGroup,
  removePane,
  resizePane,
} from './window-group';
import type { UmbraDesktopDockSide, UmbraDesktopDockZone } from './window-group';
import {
  focusWindow,
  moveWindow,
  nextWindowRect,
  nextZIndex,
  setWindowState,
  findAppWindow,
  setWindowRect,
  setWindowDirty,
  unsavedWindows,
  busyWindows,
  setWindowProgress,
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
import { isBusy, progressCaption, summariseTasks } from './progress/progress';
import type { UmbraDesktopTask } from './progress/progress';
import type { UmbraDesktopSnapTarget } from './snap';
import {
  UMBRADESKTOP_DEFAULT_METRICS,
  UMBRADESKTOP_SNAP_EDGE,
  UMBRADESKTOP_WINDOW_KEEP_VISIBLE,
  UMBRADESKTOP_WINDOW_MIN_SIZE,
  UMBRADESKTOP_DOCK_ZONE_WIDTH,
} from './constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from './window-manager.context-token';
import { minWindowSizeForContent, windowSizeForContent } from './window-chrome';
import { windowShowsPath } from './path/crumbs.js';
import { appAtLocation, restoredUrl } from './windows/layout';
import type { UmbraDesktopSavedWindow } from './windows/layout';
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
   * The tasks each window's sources report, by window id and then by source.
   *
   * Off the model for the reason {@link #subjects} is: the model carries only the summary every
   * surface reads, and keeping the raw reports here is what lets two sources — the frame watcher and
   * an element app — each replace their own list without knowing the other exists. See
   * {@link setTasks}.
   */
  #tasks = new Map<string, Map<string, ReadonlyArray<UmbraDesktopTask>>>();

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
   * Every place the floating attached window being dragged could dock, with the one under the
   * pointer marked active. Empty when no such drag is going on.
   *
   * Shown for the whole drag rather than only near an edge, because docking has to be discoverable:
   * a target that appears only once you have already found it teaches nobody that it exists. Each
   * zone is a band just inside the owner's edge, where the person aims; see `#dockZone`. The owner
   * window draws its own, inside its frame, so they sit at its level in the stack and the window
   * being dragged passes over them; drawn on the desktop above every window, they covered the very
   * window being dropped.
   */
  #dockZones = new UmbObjectState<ReadonlyArray<UmbraDesktopDockZone & { active: boolean; ownerId: string }>>([]);

  /** Observable dock zones; see {@link previewSnap}. */
  public readonly dockZones = this.#dockZones.asObservable();

  /**
   * The snap the current drag is offering, kept beside the ghost so {@link commitSnap} applies the
   * offer the user was actually looking at rather than recomputing one from a pointer position that
   * has since moved. Cleared with the ghost.
   *
   * Either a snap `target` or a `dock` side, never both: a floating attached window near its owner's
   * edge is offered docking there instead of a snap.
   */
  #pendingSnap?: { id: string; target?: UmbraDesktopSnapTarget; dock?: UmbraDesktopDockSide };

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
   *
   * An app window can be opened at a location (Help design D7): the app gets it as its `location`
   * property before it connects, and the window records it, so the layout saves it and a feature can
   * find the window showing it. The app's catalogue entry is not touched; the window gets a copy.
   * @param app The app to open.
   * @param options Where an app window should open. Ignored for a backoffice window, which opens at
   *   its own address.
   * @param options.location The app's own location string.
   */
  public open(app: UmbraDesktopApp, options: { location?: string } = {}): void {
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
    const located = options.location !== undefined && app.content.kind === 'element';
    const win: UmbraDesktopWindow = {
      id: crypto.randomUUID(),
      app: located ? appAtLocation(app, options.location!) : app,
      rect,
      z: nextZIndex(current),
      active: true,
      state: 'normal',
    };
    if (located) win.location = options.location;
    this.#windows.setValue(focusWindow([...current, win], win.id));
  }

  /**
   * Reopen a window from a saved layout, as it was: its rectangle, state and snap, and for a
   * backoffice window the page it was showing. Called once per saved window when the desktop starts
   * (see `windows/layout-restorer.ts`), in stacking order, so each lands above the last.
   *
   * It never takes focus. The saved layout says which window was active, and the restorer gives it
   * focus once every window is back; a window activating itself here would move focus once per
   * window restored. Its rectangle is taken as stored and pulled into reach by the same clamp that
   * runs on every desktop resize, so a layout saved on a larger screen still lands usable.
   * @param saved The saved window.
   * @param app The app it belongs to, resolved by alias against the apps this user may open.
   */
  public restoreWindow(saved: UmbraDesktopSavedWindow, app: UmbraDesktopApp): void {
    const current = this.#windows.getValue();
    const url = restoredUrl(app, saved.location);
    const appLocation = app.content.kind === 'element' ? saved.appLocation : undefined;
    const win: UmbraDesktopWindow = {
      id: crypto.randomUUID(),
      // A copy with the stored page as its address, so the frame loads where the editor was, or
      // with an app's own stored location as its property. The app's own entry is left untouched:
      // the launcher still opens it at its start.
      app: appLocation
        ? appAtLocation(app, appLocation)
        : url && app.content.kind === 'iframe' && url !== app.content.url
          ? { ...app, content: { kind: 'iframe', url } }
          : app,
      rect: { ...saved.rect },
      z: nextZIndex(current),
      active: false,
      state: saved.state,
    };
    if (url && app.content.kind === 'iframe') win.location = url;
    if (appLocation) win.location = appLocation;
    if (saved.snapped) win.snapped = saved.snapped;
    if (saved.restoreRect) win.restoreRect = { ...saved.restoreRect };
    const next = [...current, win];
    this.#windows.setValue(this.#bounds ? clampWindowsToBounds(next, this.#bounds, this.#keep) : next);
  }

  /**
   * Record the page a backoffice window's frame is showing, for the window layout to reopen it at.
   * Written without a re-render when nothing changed, because the frame reports on every route
   * change and most of those are to the page it is already on.
   * @param id The window.
   * @param location The frame's page, as a path on this site.
   */
  public setLocation(id: string, location: string): void {
    const current = this.#windows.getValue();
    const target = current.find((w) => w.id === id);
    if (!target || target.location === location) return;
    this.#windows.setValue(current.map((w) => (w.id === id ? { ...w, location } : w)));
  }

  /**
   * Open content attached to a window: a pane inside it when it fits, a floating window grouped with
   * it when it does not. Or focus the one of that kind already open, in either form.
   *
   * A pane widens its window so the editor keeps its width; beside a maximized or snapped window,
   * which cannot grow, it takes its width from the editor instead. When neither leaves the editor its
   * minimum, the content floats over the owner's edge. See `placePane`, and the design's D12.
   * @param ownerId The window to attach it to. A floating attached window cannot be one.
   * @param app The content: an element app, never a launcher app.
   * @param side Which side of the owner's content it goes on.
   * @returns The attached content's id, or undefined when `ownerId` is not an open ordinary window.
   */
  public openAttached(ownerId: string, app: UmbraDesktopApp, side: UmbraDesktopDockSide): string | undefined {
    const current = this.#windows.getValue();
    const owner = current.find((w) => w.id === ownerId);
    if (!owner || owner.owner) return undefined;
    const existing = attachedKind(current, ownerId, app.alias);
    if (existing?.kind === 'pane') {
      this.focus(ownerId);
      return existing.pane.id;
    }
    if (existing?.kind === 'window') {
      this.focus(existing.window.id);
      return existing.window.id;
    }
    const id = crypto.randomUUID();
    const docked = this.#withPane(current, ownerId, { id, app, side, width: this.#paneWidth(app) });
    if (docked) {
      this.#windows.setValue(focusGroup(docked, ownerId));
      return id;
    }
    this.#windows.setValue(focusGroup(this.#withFloating(current, ownerId, id, app, side), id));
    return id;
  }

  /**
   * Close attached content, as a pane or as a floating window, by its id. A pane gives back the
   * width its window grew by.
   * @param ownerId The owner.
   * @param id The attached content's id.
   */
  public closeAttached(ownerId: string, id: string): void {
    const current = this.#windows.getValue();
    const owner = current.find((w) => w.id === ownerId);
    if (owner?.panes?.some((p) => p.id === id)) {
      this.#windows.setValue(current.map((w) => (w.id === ownerId ? removePane(w, id) : w)));
      return;
    }
    this.close(id);
  }

  /**
   * Pop a pane out into a floating window: the window gives back the width it grew by, and the same
   * content opens as a window attached to it, with the same id, focused.
   *
   * Opened over the owner's edge by default, which is where the pop out button puts it. A drag that
   * pulls a pane out by its header passes the position instead, so the new window arrives under the
   * pointer and the drag carries on moving it.
   * @param ownerId The owner.
   * @param paneId The pane to pop out.
   * @param at Where to put the new window's top-left corner, when a drag decides it.
   * @returns The floating window's id, which is the pane's, or undefined when there was no such pane.
   */
  public undock(ownerId: string, paneId: string, at?: { x: number; y: number }): string | undefined {
    const current = this.#windows.getValue();
    const owner = current.find((w) => w.id === ownerId);
    const pane = owner?.panes?.find((p) => p.id === paneId);
    if (!owner || !pane) return undefined;
    const without = current.map((w) => (w.id === ownerId ? removePane(w, paneId) : w));
    let next = this.#withFloating(without, ownerId, pane.id, pane.app, pane.side, pane.width);
    if (at) next = moveWindow(next, pane.id, at.x, at.y);
    this.#windows.setValue(focusGroup(next, pane.id));
    return pane.id;
  }

  /**
   * Set a pane's width from its splitter, between its own minimum and the width that leaves the
   * editor its minimum.
   * @param ownerId The owner.
   * @param paneId The pane.
   * @param width The width asked for, in px.
   */
  public setPaneWidth(ownerId: string, paneId: string, width: number): void {
    const current = this.#windows.getValue();
    const owner = current.find((w) => w.id === ownerId);
    const pane = owner?.panes?.find((p) => p.id === paneId);
    if (!owner || !pane) return;
    const resized = resizePane(owner, paneId, width, this.#editorMin(owner).w, this.#paneMin(pane.app), this.#drawnRect(owner).w);
    this.#windows.setValue(current.map((w) => (w.id === ownerId ? resized : w)));
  }

  /**
   * Set attached content's width from the width its content should have, as a preview's phone,
   * tablet and desktop buttons do, whichever form it is in: a pane's width directly, a floating
   * window's with this theme's chrome added.
   * @param ownerId The owner.
   * @param alias The attached content's kind.
   * @param width The content width in px.
   */
  public setAttachedContentWidth(ownerId: string, alias: string, width: number): void {
    const match = attachedKind(this.#windows.getValue(), ownerId, alias);
    if (match?.kind === 'pane') {
      this.setPaneWidth(ownerId, match.pane.id, width);
      return;
    }
    if (match?.kind !== 'window') return;
    const target = match.window;
    const outer = windowSizeForContent({ w: width, h: 0 }, this.#metrics, 0).w;
    const capped = this.#bounds ? Math.min(outer, this.#bounds.w) : outer;
    this.resize(target.id, { ...target.rect, w: Math.max(this.#minWindowSize(target).w, capped) });
  }

  /**
   * The list with a pane added to its owner, or undefined when it does not fit and the content has
   * to float instead.
   * @param windows The current window list.
   * @param ownerId The owner.
   * @param pane The pane, at the width it asks for.
   * @returns The new list, or undefined.
   */
  #withPane(windows: UmbraDesktopWindow[], ownerId: string, pane: UmbraDesktopPane): UmbraDesktopWindow[] | undefined {
    const owner = windows.find((w) => w.id === ownerId);
    if (!owner) return undefined;
    const drawn = this.#drawnRect(owner);
    const fixed = owner.state === 'maximized' || owner.snapped !== undefined;
    const placed = placePane({
      owner: drawn,
      fixed,
      editorMinWidth: this.#editorMin(owner).w,
      panes: paneTotal(owner),
      side: pane.side,
      width: pane.width,
      minWidth: this.#paneMin(pane.app),
      bounds: this.#bounds ?? { w: window.innerWidth, h: window.innerHeight },
    });
    if (!placed.fits) return undefined;
    const grew = fixed ? 0 : placed.owner.w - owner.rect.w;
    const added: UmbraDesktopPane = { ...pane, width: placed.width, grew };
    return windows.map((w) =>
      w.id === ownerId
        ? { ...w, rect: fixed ? w.rect : placed.owner, panes: [...(w.panes ?? []), added] }
        : w,
    );
  }

  /**
   * The list with the content opened as a floating window attached to its owner, inside the owner's
   * edge on its side and one titlebar down, over the rectangle the owner is actually drawn in.
   * @param windows The current window list.
   * @param ownerId The owner.
   * @param id The id it keeps, which is a pane's id when it is popped out of one.
   * @param app The content.
   * @param side The side it belongs on.
   * @param width Its width when popped out of a pane, which it keeps; otherwise its app's own.
   * @returns The new list.
   */
  #withFloating(
    windows: UmbraDesktopWindow[],
    ownerId: string,
    id: string,
    app: UmbraDesktopApp,
    side: UmbraDesktopDockSide,
    width?: number,
  ): UmbraDesktopWindow[] {
    const owner = windows.find((w) => w.id === ownerId);
    if (!owner) return windows;
    // The strip under its titlebar is chrome, so it is added to the window rather than taken out of
    // the content, the same way a section window's path strip is. It is drawn at the path strip's
    // height, so it is paid for at that height too.
    const size = windowSizeForContent(app.defaultSize ?? DEFAULT_CONTENT_SIZE, this.#metrics, this.#metrics.pathbarHeight);
    const rect = floatingRect({
      owner: this.#drawnRect(owner),
      side,
      size: { w: width ?? size.w, h: size.h },
      bounds: this.#bounds ?? { w: window.innerWidth, h: window.innerHeight },
      titlebar: this.#metrics.titlebarHeight,
    });
    const floating: UmbraDesktopWindow = {
      id,
      app,
      rect,
      z: nextZIndex(windows),
      active: true,
      state: 'normal',
      owner: ownerId,
      dockSide: side,
    };
    return [...windows, floating];
  }

  /**
   * Dock a floating attached window back into its owner, on the side it came from, as its Dock
   * button asks. Does nothing when the pane would not fit; {@link canDock} is how the button knows to
   * say so beforehand.
   * @param id The floating attached window.
   */
  public dock(id: string): void {
    const current = this.#windows.getValue();
    const floating = current.find((w) => w.id === id);
    if (!floating?.owner) return;
    const docked = this.#docked(current, id, floating.dockSide ?? 'right');
    if (docked) this.#windows.setValue(docked);
  }

  /**
   * Whether a floating attached window would fit docked back into its owner right now.
   * @param id The floating attached window.
   * @returns True when {@link dock} would dock it.
   */
  public canDock(id: string): boolean {
    const current = this.#windows.getValue();
    const floating = current.find((w) => w.id === id);
    return !!floating?.owner && this.#docked(current, id, floating.dockSide ?? 'right') !== undefined;
  }

  /**
   * Where a window is actually drawn: its `rect`, or the whole desktop when it is maximized, which
   * is laid out at 100% and leaves `rect` as its restore rectangle.
   * @param w The window.
   * @returns The drawn rectangle.
   */
  #drawnRect(w: UmbraDesktopWindow): Rect {
    if (w.state !== 'maximized') return w.rect;
    const bounds = this.#bounds ?? { w: window.innerWidth, h: window.innerHeight };
    return { x: 0, y: 0, w: bounds.w, h: bounds.h };
  }

  /**
   * The width a pane asks for: its app's content width. A pane has no chrome of its own across its
   * width, only its header above, so the content width is the pane's.
   * @param app The pane's content.
   * @returns The width in px.
   */
  #paneWidth(app: UmbraDesktopApp): number {
    return (app.defaultSize ?? DEFAULT_CONTENT_SIZE).w;
  }

  /**
   * The narrowest a pane may be: its app's content minimum, or the desktop's global one.
   * @param app The pane's content.
   * @returns The width in px.
   */
  #paneMin(app: UmbraDesktopApp): number {
    return (app.minSize ?? UMBRADESKTOP_WINDOW_MIN_SIZE).w;
  }

  /**
   * Bring a window to the front and activate it, with the rest of its group: an owner and its
   * floating windows are one layer, with the focused one on top. See `focusGroup`.
   */
  public focus(id: string): void {
    this.#windows.setValue(focusGroup(this.#windows.getValue(), id));
  }

  /**
   * Close a window, unconditionally, and its floating windows with it when it is an owner. Prefer
   * {@link requestClose}, which guards unsaved work.
   */
  public close(id: string): void {
    const current = this.#windows.getValue();
    const remaining = removeGroup(current, id);
    for (const gone of current) {
      if (remaining.includes(gone)) continue;
      this.#subjects.delete(gone.id);
      this.#lastSubjectIdentity.delete(gone.id);
      this.#tasks.delete(gone.id);
    }
    this.#windows.setValue(remaining);
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
   * Record how many times a window's document has had a new saved version. Written by the window
   * element's dirty watcher; see `UmbraDesktopWindow.saves`. Hands back the same list when the count
   * has not moved, because the watcher reports every change to the frame's state and most of those
   * are not saves.
   * @param id The window.
   * @param saves The count the watcher reported.
   */
  public setSaves(id: string, saves: number): void {
    const current = this.#windows.getValue();
    const target = current.find((w) => w.id === id);
    if (!target || (target.saves ?? 0) === saves) return;
    this.#windows.setValue(current.map((w) => (w.id === id ? { ...w, saves } : w)));
  }

  /**
   * Record the tasks one source reports for a window, replacing whatever that source said before,
   * and put the summary of every source's tasks on the window.
   *
   * Per source, because a window has two and neither knows about the other: the frame watcher reads
   * core's media uploads, and an element app reports its own work through the host. Each replaces
   * only its own list, and the desktop sums them, so an app never has to average its work with work
   * it cannot see. An empty list is how a source says it is done, which is what clears the marker —
   * the same in a minimized window as in any other, since nothing here asks how the window looks.
   *
   * A window that is not open is ignored rather than resurrected: a frame can report once more while
   * its window is closing.
   * @param id The window.
   * @param source Which source is reporting, e.g. `frame` or `app`.
   * @param tasks Everything that source is doing now.
   */
  public setTasks(id: string, source: string, tasks: ReadonlyArray<UmbraDesktopTask>): void {
    const current = this.#windows.getValue();
    if (!current.some((w) => w.id === id)) return;
    const sources = this.#tasks.get(id) ?? new Map<string, ReadonlyArray<UmbraDesktopTask>>();
    if (tasks.length) sources.set(source, tasks);
    else sources.delete(source);
    if (sources.size) this.#tasks.set(id, sources);
    else this.#tasks.delete(id);
    const next = setWindowProgress(current, id, summariseTasks([...sources.values()].flat()));
    if (next !== current) this.#windows.setValue(next);
  }

  /**
   * Every open window with work in flight. Exit and the language reload count from this.
   * @returns The busy windows, in list order.
   */
  public busyWindows(): ReadonlyArray<UmbraDesktopWindow> {
    return busyWindows(this.#windows.getValue());
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
    let next = setWindowAcknowledged(
      setWindowServerState(current, id, { changedElsewhere: false, trashed: false, deleted: false }),
      id,
      false,
    );
    // Attached content describes the document its owner was showing, so a different document closes
    // it, panes and floating windows alike: a preview or a diff beside the wrong document is worse
    // than none. In the same update as the flags, for the same reason they are folded together above.
    const owner = next.find((w) => w.id === id);
    const stale = next.filter((w) => w.owner === id);
    if (owner?.panes?.length || stale.length) {
      for (const w of stale) {
        this.#subjects.delete(w.id);
        this.#lastSubjectIdentity.delete(w.id);
      }
      next = next
        .filter((w) => w.owner !== id)
        .map((w) => (w.id === id ? (w.panes ?? []).reduce((acc, p) => removePane(acc, p.id), w) : w));
    }
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
   * Ask whether a window's work in flight may be stopped, saying what it is and, when the window is
   * also holding unsaved changes, that those go too.
   *
   * One question for both, not the stop question followed by core's discard dialog: an editor asked
   * twice about one click learns to click through dialogs. Our own wording rather than core's discard
   * modal, whose sentence is about unsaved changes and would be untrue of an upload. It keeps that
   * dialog's shape, though — say what is at stake, then ask — so it reads as the same guard. Split
   * out, like {@link _askToDiscard}, so the decision is testable without a booted backoffice.
   * @param w The window whose work is at stake.
   * @returns True when the editor chose to stop it.
   */
  protected async _askToStopWork(w: UmbraDesktopWindow): Promise<boolean> {
    const caption = progressCaption(
      w.progress,
      (key, ...args) => this.#localize.term(key, ...args),
      (value) => this.#localize.string(value),
    );
    const body = this.#localize.term('umbraDesktop_stopWorkQuestion', caption);
    try {
      await umbConfirmModal(this, {
        headline: this.#localize.term('umbraDesktop_stopWorkHeadline'),
        content: w.dirty ? `${body} ${this.#localize.term('umbraDesktop_stopWorkUnsaved')}` : body,
        confirmLabel: this.#localize.term('umbraDesktop_stopWorkConfirm'),
        color: 'danger',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask, if there is anything to lose, whether a window's unsaved changes may be discarded.
   *
   * Answers without a dialog for a window that is clean and idle — or one that is no longer open, so a
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
    // Work in flight first, and in one question that also covers any unsaved changes: whatever the
    // document's state, the act this guards stops the work, and that is the news. Issue #108 D8.
    if (target && isBusy(target.progress)) return this._askToStopWork(target);
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
    // Closing an owner closes its floating windows too, so each is asked about as well, owner first,
    // and the first "no" keeps the whole group open. None of today's attached content can hold
    // unsaved work, but the rule is not allowed to depend on that.
    const current = this.#windows.getValue();
    const target = current.find((w) => w.id === id);
    const members = target?.owner ? [id] : [id, ...current.filter((w) => w.owner === id).map((w) => w.id)];
    for (const member of members) {
      if (!(await this.confirmDiscard(member))) return;
    }
    this.close(id);
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
    // Minimizing an owner takes its floating windows along; every other state is the window's own.
    // See `minimizeInGroup`.
    if (state === 'minimized') {
      this.#windows.setValue(minimizeInGroup(this.#windows.getValue(), id));
      return;
    }
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
    // The window's own content at its minimum, plus every pane at the width it has: resizing the
    // window narrower squeezes the editor, not the panes, whose width is the splitter's business.
    const editor = this.#editorMin(w);
    return { w: editor.w + paneTotal(w), h: editor.h };
  }

  /**
   * The smallest the window's own content column may be, chrome included, leaving its panes out.
   * What a pane may never squeeze the editor below.
   * @param w The window to measure.
   * @returns The floor for its own content.
   */
  #editorMin(w: UmbraDesktopWindow): { w: number; h: number } {
    return minWindowSizeForContent(
      w.app.minSize,
      UMBRADESKTOP_WINDOW_MIN_SIZE,
      this.#metrics,
      (windowShowsPath(w.app) ? this.#metrics.pathbarHeight : 0) + (w.owner ? this.#metrics.pathbarHeight : 0),
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
    const window = this.#windows.getValue().find((w) => w.id === id);
    // A floating attached window is shown every place it could dock for as long as it is dragged,
    // and docking where the pointer is takes precedence over any snap. A zone is offered only where
    // the commit would actually dock it, from the same arithmetic.
    if (window?.owner) {
      const current = this.#windows.getValue();
      const zones = (['left', 'right'] as const)
        .map((side) => ({ side, rect: this.#dockZone(current, id, side) }))
        .filter((z): z is UmbraDesktopDockZone => z.rect !== undefined);
      const side = dockTargetAt(pointer, zones, UMBRADESKTOP_SNAP_EDGE);
      this.#dockZones.setValue(zones.map((z) => ({ ...z, active: z.side === side, ownerId: window.owner! })));
      if (side) {
        this.#pendingSnap = { id, dock: side };
        if (this.#snapPreview.getValue()) this.#snapPreview.setValue(undefined);
        return;
      }
    }
    const target = snapTargetAt(pointer, bounds, UMBRADESKTOP_SNAP_EDGE);
    // A fixed-size window is never offered a snap: every snap is a new size, the top one included,
    // which maximizes. No offer means no ghost and nothing for commitSnap to take.
    if (!target || !window || !isResizable(window)) {
      this.#clearSnapOffer();
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
    if (pending.dock) {
      const docked = this.#docked(this.#windows.getValue(), id, pending.dock);
      if (docked) this.#windows.setValue(docked);
      return;
    }
    if (!pending.target) return;
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

  /**
   * The list with a floating attached window turned into a pane of its owner, keeping its id and its
   * width, and the owner focused; or undefined when the pane would not fit.
   * @param windows The current window list.
   * @param id The floating window.
   * @param side The side to dock it on.
   * @returns The new list, or undefined.
   */
  #docked(windows: UmbraDesktopWindow[], id: string, side: UmbraDesktopDockSide): UmbraDesktopWindow[] | undefined {
    const floating = windows.find((w) => w.id === id);
    if (!floating?.owner) return undefined;
    const ownerId = floating.owner;
    const docked = this.#withPane(
      windows.filter((w) => w.id !== id),
      ownerId,
      { id, app: floating.app, side, width: floating.rect.w },
    );
    return docked ? focusGroup(docked, ownerId) : undefined;
  }

  /**
   * The drop target for docking a floating window on one side of its owner: a band just inside the
   * owner's edge as the owner is now, from below its titlebar to the bottom, offered only when the
   * pane would actually fit there.
   *
   * On the owner as it is, not where the pane will end up. The first version drew the pane's future
   * rectangle, and a pane that widens its window by 920px lands mostly outside the window it is
   * docking into: the left target covered the editor and the right one covered empty desktop, so the
   * two between them covered nearly the whole screen. A target is where you aim; the window grows
   * when you let go.
   * @param windows The current window list.
   * @param id The floating window being dragged.
   * @param side The side to offer.
   * @returns The target rectangle, or undefined when the pane would not fit.
   */
  #dockZone(windows: UmbraDesktopWindow[], id: string, side: UmbraDesktopDockSide): Rect | undefined {
    const floating = windows.find((w) => w.id === id);
    const owner = floating?.owner ? windows.find((w) => w.id === floating.owner) : undefined;
    if (!owner || !this.#docked(windows, id, side)) return undefined;
    const drawn = this.#drawnRect(owner);
    const top = this.#metrics.titlebarHeight;
    const w = Math.min(UMBRADESKTOP_DOCK_ZONE_WIDTH, Math.floor(drawn.w / 3));
    const x = side === 'left' ? drawn.x : drawn.x + drawn.w - w;
    return { x, y: drawn.y + top, w, h: drawn.h - top };
  }

  /** Withdraw any snap or dock on offer, and the dock zones with it, leaving the window alone. */
  public clearSnapPreview(): void {
    this.#clearSnapOffer();
    if (this.#dockZones.getValue().length) this.#dockZones.setValue([]);
  }

  /**
   * Withdraw the snap ghost and the pending offer, but not the dock zones: a floating window dragged
   * away from every zone still shows them, since the point is that they can be found.
   */
  #clearSnapOffer(): void {
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
