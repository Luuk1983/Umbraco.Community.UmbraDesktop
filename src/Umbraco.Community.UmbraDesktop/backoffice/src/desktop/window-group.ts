import type { Rect, UmbraDesktopPane, UmbraDesktopWindow } from './types';
import { nextZIndex } from './window-model';

/**
 * The rules for attached content: something that belongs to a window and is shown either as a pane
 * inside it or as a floating window grouped with it.
 *
 * Its own file rather than more of `window-model.ts`, because every function here answers a question
 * about an owner and what is attached to it, which that model has no notion of. Everything is pure
 * and hands back plain values, so the manager composes these the same way it composes the model's
 * functions. Design: `docs/design/2026-09-27-attached-windows-design.md`.
 */

/** Which side of its owner's content a pane sits on, or which edge a floating window docks at. */
export type UmbraDesktopDockSide = 'left' | 'right';

/** An owner window and the floating windows attached to it. */
export interface UmbraDesktopWindowGroup {
  /** The owner. For an ordinary window, the window itself. */
  owner: UmbraDesktopWindow;
  /** Its floating attached windows, in list order. Empty for an ordinary window. */
  attached: UmbraDesktopWindow[];
}

/**
 * The group a window belongs to, asked from any member of it.
 *
 * An ordinary window is a group of one, rather than "no group", so that every caller can treat every
 * window the same way and a desktop with no attached content at all goes down exactly the path it
 * went down before there was any. A floating window whose owner is not in the list, which closing the
 * owner never leaves behind since {@link removeGroup} takes both, is answered as its own group rather
 * than dropped from every operation. Pure.
 * @param windows The current window list.
 * @param id Any member's id.
 * @returns The group, or undefined when no such window is open.
 */
export function groupOf(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
): UmbraDesktopWindowGroup | undefined {
  const target = windows.find((w) => w.id === id);
  if (!target) return undefined;
  const owner = (target.owner && windows.find((w) => w.id === target.owner)) || target;
  return { owner, attached: windows.filter((w) => w.owner === owner.id && w !== owner) };
}

/** Where a kind of attached content is open: as a pane on its owner, or as a floating window. */
export type UmbraDesktopAttachedMatch =
  | { kind: 'pane'; pane: UmbraDesktopPane }
  | { kind: 'window'; window: UmbraDesktopWindow };

/**
 * Whether an owner already has attached content of one kind, in either form.
 *
 * The kind is the attached app's alias, and it is counted across panes and floating windows
 * together: an owner has at most one of each, and asking for a kind already open focuses it rather
 * than opening a second. An ordinary window hosting the same app is not a match, since it belongs to
 * nobody. Pure.
 * @param windows The current window list.
 * @param ownerId The owner's id.
 * @param alias The attached app's alias.
 * @returns Where it is open, or undefined.
 */
export function attachedKind(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  ownerId: string,
  alias: string,
): UmbraDesktopAttachedMatch | undefined {
  const owner = windows.find((w) => w.id === ownerId);
  const pane = owner?.panes?.find((p) => p.app.alias === alias);
  if (pane) return { kind: 'pane', pane };
  const window = windows.find((w) => w.owner === ownerId && w.app.alias === alias);
  return window ? { kind: 'window', window } : undefined;
}

/**
 * Bring a window's whole group to the front, with that window on top and active.
 *
 * The group is one layer: its members take the next z-indices together, so no other window comes
 * between them. Within it the focused window goes on top and the rest keep the order they had,
 * because the editor has to be able to bring the document in front of its own preview and back.
 *
 * A minimized group comes back as it went: the owner, and the floating windows that were minimized
 * along with it, but not one the editor had minimized on its own. That one comes back only when it
 * is the window being focused. For an ordinary window this is exactly `focusWindow`. Pure.
 * @param windows The current window list.
 * @param id The window being focused.
 * @returns A new list.
 */
export function focusGroup(windows: ReadonlyArray<UmbraDesktopWindow>, id: string): UmbraDesktopWindow[] {
  const group = groupOf(windows, id);
  const members = group ? [group.owner, ...group.attached] : [];
  const order = [
    ...members.filter((w) => w.id !== id).sort((a, b) => a.z - b.z),
    ...members.filter((w) => w.id === id),
  ];
  const top = nextZIndex(windows);
  const z = new Map(order.map((w, i) => [w.id, top + i]));
  const ownerReturning = group?.owner.state === 'minimized';
  return windows.map((w) => {
    const raised = z.get(w.id);
    if (raised === undefined) return { ...w, active: false };
    const returns =
      w.state === 'minimized' &&
      (w.id === id || w.id === group?.owner.id || (ownerReturning && w.minimizedWithOwner === true));
    return {
      ...w,
      active: w.id === id,
      z: raised,
      state: returns ? 'normal' : w.state,
      minimizedWithOwner: returns ? undefined : w.minimizedWithOwner,
    };
  });
}

/**
 * Minimize a window, with what that means for its group.
 *
 * Minimizing an owner takes its floating windows along, and marks the ones it took, so restoring the
 * owner brings back exactly those. A floating window that was already minimized stays as the editor
 * left it. Minimizing a floating window hides only that one: it has its own taskbar button to come
 * back from. Pure.
 * @param windows The current window list.
 * @param id The window being minimized.
 * @returns A new list.
 */
export function minimizeInGroup(windows: ReadonlyArray<UmbraDesktopWindow>, id: string): UmbraDesktopWindow[] {
  const target = windows.find((w) => w.id === id);
  if (!target) return windows as UmbraDesktopWindow[];
  if (target.owner) {
    return windows.map((w) => (w.id === id ? { ...w, state: 'minimized', minimizedWithOwner: undefined } : w));
  }
  return windows.map((w) => {
    if (w.id === id) return { ...w, state: 'minimized' };
    if (w.owner === id && w.state !== 'minimized') return { ...w, state: 'minimized', minimizedWithOwner: true };
    return w;
  });
}

/**
 * Close a window, and its floating windows with it when it is an owner.
 *
 * One way only: attached content describes its owner and means nothing without it, while the owner
 * is whole without any of it, so closing a floating window closes that window alone. An owner's
 * panes need nothing here: they are part of it and go with it. Pure.
 * @param windows The current window list.
 * @param id The window being closed.
 * @returns A new list.
 */
export function removeGroup(windows: ReadonlyArray<UmbraDesktopWindow>, id: string): UmbraDesktopWindow[] {
  const target = windows.find((w) => w.id === id);
  if (target?.owner) return windows.filter((w) => w.id !== id);
  return windows.filter((w) => w.id !== id && w.owner !== id);
}

/**
 * The total width of the panes a window draws beside its own content.
 *
 * One function for the two places that need it, the manager's resize floor and the window element's
 * inline minimum, so the size a window may be dragged to and the size it is drawn at cannot disagree
 * about its panes. Pure.
 * @param w The window.
 * @returns The width in px, zero for a window with no panes.
 */
export function paneTotal(w: Pick<UmbraDesktopWindow, 'panes'>): number {
  return (w.panes ?? []).reduce((total, p) => total + p.width, 0);
}

/** What {@link placePane} needs to know to fit one new pane into its owner. */
export interface UmbraDesktopPaneRequest {
  /** The owner's drawn rectangle: its `rect`, or the whole desktop when it is maximized. */
  owner: Rect;
  /** Whether the owner cannot grow, because it is maximized or snapped. */
  fixed: boolean;
  /** The narrowest the owner's own content column may be, chrome included. */
  editorMinWidth: number;
  /** The total width of the panes the owner already draws. */
  panes: number;
  /** The side the new pane's feature asks for. */
  side: UmbraDesktopDockSide;
  /** The width the new pane asks for. */
  width: number;
  /** The narrowest the new pane may be. */
  minWidth: number;
  /** The desktop surface size in px. */
  bounds: { w: number; h: number };
}

/**
 * Where a new pane goes: it fits, with the owner's new rectangle and the pane's width, or it does
 * not, and the content opens floating instead.
 */
export type UmbraDesktopPanePlacement = { fits: true; owner: Rect; width: number } | { fits: false };

/**
 * Fit a new pane into its owner window.
 *
 * An owner in its ordinary state grows by the pane, so the editor keeps the width it had: a pane
 * that took its width from the editor would leave a backoffice that no longer holds together. It
 * grows on the pane's side and is shifted back onto the desktop if that runs off an edge. When the
 * desktop is too narrow for that, the pane gives up width towards its own minimum first and the
 * editor towards its minimum second, because the editor is what the person was already working in.
 *
 * A maximized or snapped owner cannot grow, so there the pane takes its width from the editor, as
 * long as the editor keeps its minimum.
 *
 * When neither fits, it does not fit, and the caller opens the content floating: the necessary evil
 * of a window over the editor beats squeezing the editor below its minimum. "Minimum" is whatever
 * the caller passes, meant to be the same `minWindowSizeForContent` floor that resizing and snapping
 * use, so there is one number for "usable" rather than two. Pure.
 * @param request What to place, and where.
 * @returns The placement.
 */
export function placePane(request: UmbraDesktopPaneRequest): UmbraDesktopPanePlacement {
  const { owner, panes, bounds } = request;
  if (request.fixed) {
    const width = Math.min(request.width, owner.w - panes - request.editorMinWidth);
    return width >= request.minWidth ? { fits: true, owner, width } : { fits: false };
  }
  let editor = owner.w - panes;
  let width = Math.max(request.width, request.minWidth);
  let over = editor + panes + width - bounds.w;
  if (over > 0) {
    const cut = Math.min(over, width - request.minWidth);
    width -= cut;
    over -= cut;
  }
  if (over > 0) {
    const cut = Math.min(over, Math.max(0, editor - request.editorMinWidth));
    editor -= cut;
    over -= cut;
  }
  if (over > 0) return { fits: false };
  const w = editor + panes + width;
  const grown = request.side === 'left' ? owner.x + owner.w - w : owner.x;
  const x = Math.min(Math.max(0, grown), Math.max(0, bounds.w - w));
  return { fits: true, owner: { x, y: owner.y, w, h: owner.h }, width };
}

/**
 * Take a pane off its owner, and give back the width the window grew by to make room for it.
 *
 * Exactly the width recorded when it opened, on its own side, so opening a pane and closing it again
 * leaves the window where it was. A snapped window's drawn rectangle belongs to the snap, so what it
 * gives back comes off the rectangle it will restore to; a maximized window's `rect` already is that
 * rectangle. A pane that took its width from the editor gives nothing back. Pure.
 * @param owner The owner window.
 * @param paneId The pane to remove.
 * @returns The owner without it.
 */
export function removePane(owner: UmbraDesktopWindow, paneId: string): UmbraDesktopWindow {
  const pane = owner.panes?.find((p) => p.id === paneId);
  if (!pane) return owner;
  const grew = pane.grew ?? 0;
  const shrink = (r: Rect): Rect => (pane.side === 'left' ? { ...r, x: r.x + grew, w: r.w - grew } : { ...r, w: r.w - grew });
  const panes = (owner.panes ?? []).filter((p) => p.id !== paneId);
  if (owner.snapped) return { ...owner, panes, restoreRect: owner.restoreRect ? shrink(owner.restoreRect) : undefined };
  return { ...owner, panes, rect: shrink(owner.rect) };
}

/**
 * Set a pane's width from its splitter, between its own minimum and the width that still leaves the
 * editor its minimum beside every other pane. Pure.
 * @param owner The owner window.
 * @param paneId The pane being resized.
 * @param width The width the splitter asks for.
 * @param editorMinWidth The narrowest the owner's own content column may be.
 * @param paneMinWidth The narrowest the pane may be.
 * @param drawnWidth The owner's drawn width, when it differs from its `rect`, as a maximized window's does.
 * @returns The owner with the pane resized.
 */
export function resizePane(
  owner: UmbraDesktopWindow,
  paneId: string,
  width: number,
  editorMinWidth: number,
  paneMinWidth: number,
  drawnWidth = owner.rect.w,
): UmbraDesktopWindow {
  const others = (owner.panes ?? []).filter((p) => p.id !== paneId).reduce((total, p) => total + p.width, 0);
  const max = drawnWidth - others - editorMinWidth;
  const next = Math.max(paneMinWidth, Math.min(width, max));
  return { ...owner, panes: (owner.panes ?? []).map((p) => (p.id === paneId ? { ...p, width: next } : p)) };
}

/** A place a floating attached window can be dropped to dock: the pane it would become. */
export interface UmbraDesktopDockZone {
  /** Which side of the owner's content it docks on. */
  side: UmbraDesktopDockSide;
  /** The rectangle the pane would occupy, in desktop coordinates. */
  rect: Rect;
}

/**
 * Which side a floating window being dragged is offering to dock at, from where the pointer is.
 *
 * A zone is the whole rectangle the pane would occupy, so a pointer anywhere in it docks, and a
 * little outside it too, within `edge`. The pointer and not the dragged window's edge, because the
 * pointer is where the person is looking. A thin band along the owner's edge was built first and
 * was too hard to find. Pure.
 * @param pointer The pointer, in desktop coordinates.
 * @param zones The zones on offer; see the manager's `dockZones`.
 * @param edge How far outside a zone still counts, in px; the desktop's snap edge.
 * @returns The side on offer, or undefined.
 */
export function dockTargetAt(
  pointer: { x: number; y: number },
  zones: ReadonlyArray<UmbraDesktopDockZone>,
  edge: number,
): UmbraDesktopDockSide | undefined {
  const hit = zones.find(
    ({ rect }) =>
      pointer.x >= rect.x - edge &&
      pointer.x <= rect.x + rect.w + edge &&
      pointer.y >= rect.y - edge &&
      pointer.y <= rect.y + rect.h + edge,
  );
  return hit?.side;
}

/**
 * Where a floating attached window opens: inside its owner's edge on its side, one titlebar down so
 * the owner's own titlebar and controls stay in sight, and kept on the desktop. Pure.
 * @param request The owner's drawn rectangle, the side, the window's size, the desktop and the
 * owner's titlebar height.
 * @returns The floating rectangle.
 */
export function floatingRect(request: {
  owner: Rect;
  side: UmbraDesktopDockSide;
  size: { w: number; h: number };
  bounds: { w: number; h: number };
  titlebar: number;
}): Rect {
  const { owner, size, bounds } = request;
  const x = request.side === 'left' ? owner.x : owner.x + owner.w - size.w;
  const y = owner.y + request.titlebar;
  return {
    x: Math.min(Math.max(0, x), Math.max(0, bounds.w - size.w)),
    y: Math.min(Math.max(0, y), Math.max(0, bounds.h - size.h)),
    w: size.w,
    h: size.h,
  };
}
