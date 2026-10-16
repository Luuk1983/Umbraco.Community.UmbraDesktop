import { UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT } from './notification-centre.context-token.js';
import { drawsOwnElement } from './own-element.js';
import { attentionCount, notificationIdentity, readScrollback, recordNotification, writeScrollback } from './scrollback.js';
import {
  UMBRADESKTOP_DESKTOP_SOURCE_ID,
  type UmbraDesktopNotification,
  type UmbraDesktopNotificationOrigin,
  type UmbraDesktopNotificationSource,
  type UmbraDesktopScrollbackEntry,
  type UmbraDesktopToast,
} from './types.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbArrayState, UmbBooleanState, UmbNumberState } from '@umbraco-cms/backoffice/observable-api';

/**
 * Where every notification on the desktop ends up, once: the toasts showing now and the scrollback
 * behind the clock.
 *
 * Fed by one watcher per document (every window's frame and the desktop's own backoffice), and read
 * by the toast stack and the taskbar clock. It records who raised a notification, what severity they
 * chose and what it says, and nothing else: nothing here classifies a notification, which the issue
 * decided because both signals Umbraco offers for intent are misused in shipped code.
 */

/** What the centre needs of the window manager: to focus a window, and to know it is still open. */
export interface UmbraDesktopNotificationWindows {
  /** Bring a window forward, restoring it when minimized. */
  focus(id: string): void;
  /** The windows currently open. */
  getWindows(): ReadonlyArray<{ id: string }>;
}

/** Things the centre would otherwise reach for globally, passed in so a test can replace them. */
export interface UmbraDesktopNotificationCentreOptions {
  /** Where the scrollback is kept. Defaults to `sessionStorage`. */
  store?: Storage;
  /** The clock, in epoch milliseconds. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Something that can be clicked: a toast or a scrollback entry. Both carry the same four facts; the
 * source's label is among them because showing a notification again as a desktop toast draws it.
 */
type UmbraDesktopActivatable =
  | Pick<UmbraDesktopToast, 'id' | 'sourceId' | 'source' | 'notification'>
  | UmbraDesktopScrollbackEntry;

/** Holds the desktop's toasts and scrollback, and answers clicks on either. */
export class UmbraDesktopNotificationCentreContext extends UmbContextBase {
  /** The toasts showing now, oldest first, which is the order a stack draws them in. */
  #toasts = new UmbArrayState<UmbraDesktopToast>([], (toast) => toast.id);

  /** The toasts showing now, oldest first. */
  public readonly toasts = this.#toasts.asObservable();

  /** The scrollback, newest first. */
  #entries = new UmbArrayState<UmbraDesktopScrollbackEntry>([], (entry) => entry.id);

  /** The scrollback, newest first. */
  public readonly entries = this.#entries.asObservable();

  /** How many distinct warning and error entries the scrollback holds. */
  #attention = new UmbNumberState(0);

  /** How many distinct warning and error entries the scrollback holds: the clock's count. */
  public readonly attention = this.#attention.asObservable();

  /** Whether the list behind the clock is open. */
  #listOpen = new UmbBooleanState(false);

  /**
   * Whether the list behind the clock is open. The toast stack stands aside while it is, the way
   * Windows hides its banners behind an open notification centre: the list is showing the same
   * notifications, and a toast drawn next to its own line in the list is the same thing twice.
   */
  public readonly listOpen = this.#listOpen.asObservable();

  /**
   * The live way back into each document, by source id. Replaced whenever a window's frame loads,
   * which is what keeps entries plain data. Design D5.
   */
  #sources = new Map<string, UmbraDesktopNotificationSource>();

  /** Hands out toast generations; see {@link UmbraDesktopToast.generation}. */
  #generation = 0;

  /** The window manager, reduced to what a click needs. */
  #windows: UmbraDesktopNotificationWindows;

  /** Where the scrollback is kept. */
  #store: Storage;

  /** The clock. */
  #now: () => number;

  /**
   * @param host The desktop.
   * @param windows The window manager.
   * @param options Storage and clock, for tests.
   */
  constructor(
    host: UmbControllerHost,
    windows: UmbraDesktopNotificationWindows,
    options: UmbraDesktopNotificationCentreOptions = {},
  ) {
    super(host, UMBRADESKTOP_NOTIFICATION_CENTRE_CONTEXT);
    this.#windows = windows;
    this.#store = options.store ?? window.sessionStorage;
    this.#now = options.now ?? Date.now;
    this.#setEntries(readScrollback(this.#store), false);
  }

  /**
   * Take in a notification: show it, unless the same one is already showing, and record it.
   * @param notification What was raised.
   * @param origin Who raised it.
   */
  public raise(notification: UmbraDesktopNotification, origin: UmbraDesktopNotificationOrigin): void {
    this.#show(notification, origin, true);
    this.#setEntries(recordNotification(this.#entries.getValue(), notification, origin, this.#now()), true);
  }

  /**
   * A source says one of its notifications has gone. A staying toast showing it goes too; a timed one
   * is left to its own timer, so it cannot close under a pointer hovering it to read it. Design D4.
   * @param sourceId The source it came from.
   * @param key The notification's key in that source.
   */
  public closed(sourceId: string, key: string): void {
    const toast = this.#toasts
      .getValue()
      .find((t) => t.sourceId === sourceId && t.notification.key === key && t.notification.duration === null);
    if (toast) this.dismiss(toast.id);
  }

  /**
   * Empty the list, and take down any toast still showing with it.
   *
   * The issue ruled this out, and it was put back on 2026-09-27 once the list was in use: without it
   * a list that has been read has no way back to empty, so the dot beside the clock stays up until
   * twenty other things push the last warning off. The toasts go too, because each is the same
   * notification as a line in the list, and a cleared list with a toast still up would be asking to be
   * cleared twice. Design D6.
   */
  public clear(): void {
    for (const toast of this.#toasts.getValue()) this.#closeOriginal(toast);
    this.#toasts.setValue([]);
    this.#setEntries([], true);
  }

  /**
   * Take a toast down, and close its original in the document that raised it. Its entry stays:
   * dismissing is for the screen, not the history.
   *
   * Every way a toast goes comes through here: the cross, its element's own close, its timer, a click
   * that acts on it, and its sender closing it. Closing the original is right for all of them; for
   * the last it is a no-op, since the original has already left its list.
   * @param id The toast's id.
   */
  public dismiss(id: string): void {
    const toast = this.#toasts.getValue().find((t) => t.id === id);
    if (!toast) return;
    this.#toasts.removeOne(id);
    this.#closeOriginal(toast);
  }

  /**
   * Answer a click on a toast or an entry: focus the window that raised it, restoring it if it is
   * minimized, and raise a notification that carries its own element again there, so its actions can
   * be used. A toast that was clicked goes, since it has been acted on.
   *
   * A notification the desktop raised itself is never raised again in the document (umbraCoffee
   * design D15). When a desktop toast draws its element, its actions are usable there, so it is shown
   * again as one, rather than as Umbraco's toast, unthemed and in Umbraco's position. When its
   * element is not defined (its module never loaded, after a reload with its package's tray item
   * switched off, say), Umbraco's toast would draw an empty box, so an entry is shown again as a
   * plain desktop toast, headline and message, and a clicked toast, which was already showing that,
   * only goes. Neither is recorded again: showing it is not another arrival.
   *
   * Nothing happens for a window that has since closed, design §3.3. Reopening an app to show a
   * message would be guessing which document it was about.
   * @param target The toast or entry clicked.
   */
  public activate(target: UmbraDesktopActivatable): void {
    const clickedToast = 'notification' in target;
    const notification = clickedToast ? target.notification : this.#asNotification(target);
    if (clickedToast) this.dismiss(target.id);
    if (target.sourceId === UMBRADESKTOP_DESKTOP_SOURCE_ID) {
      if (!notification.element) return;
      if (drawsOwnElement(target.sourceId, notification) || !clickedToast) this.#show(notification, target, false);
      return;
    }
    if (!this.#windows.getWindows().some((w) => w.id === target.sourceId)) return;
    this.#windows.focus(target.sourceId);
    if (notification.element) this.#sources.get(target.sourceId)?.reraise(notification);
  }

  /**
   * Say whether the list behind the clock is open. The taskbar owns the list and calls this.
   * @param open Whether it is open.
   */
  public setListOpen(open: boolean): void {
    this.#listOpen.setValue(open);
  }

  /**
   * Register the live way back into a document, replacing whatever was registered for it before.
   * @param sourceId A window id, or the desktop's own.
   * @param source Its current watcher.
   * @returns A function that unregisters it, if it is still the one registered.
   */
  public registerSource(sourceId: string, source: UmbraDesktopNotificationSource): () => void {
    this.#sources.set(sourceId, source);
    return () => {
      if (this.#sources.get(sourceId) === source) this.#sources.delete(sourceId);
    };
  }

  /**
   * Ask each source a toast came from to close its original (added 2026-09-28). An original is
   * hidden, so nobody sees it go, but left alone it would stay in its document's list until its own
   * timer ran out, forever for a staying one. Every arrival's original, not only the last, so a
   * repeat from another window is not left behind in that window.
   * @param toast The toast taken down.
   */
  #closeOriginal(toast: UmbraDesktopToast): void {
    for (const { sourceId, key } of toast.originals) this.#sources.get(sourceId)?.close?.(key);
  }

  /**
   * Put a notification on screen as a toast, or refresh its toast in place when it is already up.
   *
   * Shared by {@link raise}, for something that has just arrived, and {@link activate}, for a desktop
   * notification shown again. Either way the toast gets a new generation, which starts its timer
   * over.
   *
   * Only an arrival changes what the toast stands for: its count, what it carries and its list of
   * originals. Showing one again while its toast is still up refreshes the generation and nothing
   * else, because the notification it would bring is rebuilt from a scrollback entry, whose key is
   * the entry's and whose duration is "until closed", and swapping those in would lose the key its
   * dismissal closes the original by. Shown again once its toast has gone, it has no originals left:
   * they were closed with that toast.
   * @param notification What to show.
   * @param origin Who raised it.
   * @param arrived True when it has just been raised.
   */
  #show(notification: UmbraDesktopNotification, origin: UmbraDesktopNotificationOrigin, arrived: boolean): void {
    const id = notificationIdentity(notification);
    const generation = (this.#generation += 1);
    const showing = this.#toasts.getValue().find((toast) => toast.id === id);
    if (showing && !arrived) {
      this.#toasts.updateOne(id, { ...showing, generation });
      return;
    }
    const original = { sourceId: origin.sourceId, key: notification.key };
    const toast: UmbraDesktopToast = {
      id,
      notification,
      sourceId: origin.sourceId,
      source: origin.source,
      count: showing ? showing.count + 1 : 1,
      generation,
      originals: arrived ? [...(showing?.originals ?? []), original] : [],
    };
    // In place when it is showing, so a repeat refreshes its toast where it sits instead of jumping.
    if (showing) this.#toasts.updateOne(id, toast);
    else this.#toasts.appendOne(toast);
  }

  /**
   * The notification an entry stands for, rebuilt from the entry's plain data. Only the fields a
   * re-raise or a desktop toast reads matter; the key is the entry's, since the original's was its
   * source's.
   * @param entry The entry.
   * @returns A notification.
   */
  #asNotification(entry: UmbraDesktopScrollbackEntry): UmbraDesktopNotification {
    return {
      key: entry.id,
      color: entry.color,
      duration: null,
      headline: entry.headline,
      message: entry.message,
      element: entry.element,
    };
  }

  /**
   * Replace the scrollback, recount it, and keep it.
   * @param entries The new scrollback.
   * @param persist Whether to write it out. False only when it has just been read in.
   */
  #setEntries(entries: UmbraDesktopScrollbackEntry[], persist: boolean): void {
    this.#entries.setValue(entries);
    this.#attention.setValue(attentionCount(entries));
    if (persist) writeScrollback(this.#store, entries);
  }
}
