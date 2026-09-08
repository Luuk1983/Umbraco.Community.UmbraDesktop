import type { UmbraDesktopWindow } from '../types.js';
import type { UmbraDesktopNotice, UmbraDesktopNoticeSeverity } from './types.js';

/**
 * Everything a window has to say about its document, and how bad the worst of it is.
 *
 * Three pure functions, and between them they decide the titlebar marker, the banner stack, the
 * taskbar badge and both close guards — what a window has to say, how bad the worst of it is, and
 * which glyph says so. Keeping that in one place is what stops the four surfaces disagreeing about
 * whether a window is in trouble.
 */

/** Sort weight per severity: lower is worse, so the worst notice sorts first. */
const SEVERITY_WEIGHT: Readonly<Record<UmbraDesktopNoticeSeverity, number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** Only the window state these functions read, so a test need not build a whole window. */
type NoticeRelevantWindow = Pick<
  UmbraDesktopWindow,
  'dirty' | 'changedElsewhere' | 'trashed' | 'deleted' | 'acknowledged'
>;

/**
 * Everything a window has to say about its document, worst first.
 *
 * The `deleted` branch swallows the other two conditions deliberately: there is nothing left to
 * conflict with and nothing to restore from the bin, so reporting them alongside would be three
 * banners saying one thing. `trashed` and `changed-elsewhere` both require `dirty`, because a
 * window with nothing unsaved has nothing at risk and has already taken the server's version in
 * place (design D8). `deleted` does not, because it is the one condition with nothing to refresh to.
 * Pure.
 * @param w The window to describe.
 * @returns The notices, ordered error, warning, info.
 */
export function windowNotices(w: NoticeRelevantWindow): UmbraDesktopNotice[] {
  const notices: UmbraDesktopNotice[] = [];
  if (w.deleted) {
    notices.push({
      id: 'deleted',
      severity: 'error',
      title: 'umbraDesktop_noticeDeletedTitle',
      body: w.dirty ? 'umbraDesktop_noticeDeletedDirtyBody' : 'umbraDesktop_noticeDeletedBody',
      banner: true,
      // Nothing to offer, as with the bin below: the document is gone, and the window it was open
      // in still works — its tree is live and the editor can navigate to another node — so a
      // 'Close window' button would be the one action here that throws work away, dressed up as
      // the way out of the situation. Closing is already a titlebar button away, and the close
      // guard says the right thing when it is used.
      actions: [],
    });
  } else {
    if (w.trashed && w.dirty) {
      notices.push({
        id: 'trashed',
        // `error`, the same severity `deleted` gets, and for the same reason: an item in the recycle
        // bin is read-only (`UMB_PREVENT_EDIT_TRASHED_ITEM`), so from the moment this window catches
        // up with the bin there is nowhere for the work in it to go. A warning would say "this could
        // go badly", which is true of a conflict — you can still choose whose version wins — and
        // untrue here. It started as a warning on the reasoning that the bin is undoable, but that
        // is somebody else's action to take and not something this editor can do with their changes.
        severity: 'error',
        title: 'umbraDesktop_noticeTrashedTitle',
        body: 'umbraDesktop_noticeTrashedBody',
        banner: true,
        // Nothing to offer: every action still works exactly as it did, so this is a statement of
        // fact rather than a decision. The bin is somebody's to undo, not this window's.
        actions: [],
      });
    }
    if (w.changedElsewhere && w.dirty) {
      notices.push({
        id: 'changed-elsewhere',
        severity: 'warning',
        // Acknowledging trims the heading to the short form once it stops being news: the full
        // sentence ("Someone else changed this while you were editing it") is explaining a
        // conflict the editor has already been told about and confirmed they want to override.
        // The titlebar marker and the taskbar badge both read a notice's `title` directly, so
        // choosing it here — rather than each surface asking `w.acknowledged` itself — is what
        // keeps the two from being able to disagree about the wording.
        title: w.acknowledged ? 'umbraDesktop_noticeAcknowledged' : 'umbraDesktop_noticeChangedTitle',
        body: 'umbraDesktop_noticeChangedBody',
        banner: !w.acknowledged,
        actions: w.acknowledged ? [] : ['acknowledge', 'discard-and-load'],
      });
    }
  }
  if (w.dirty) {
    notices.push({
      id: 'unsaved',
      severity: 'info',
      title: 'umbraDesktop_unsavedChanges',
      body: 'umbraDesktop_unsavedChanges',
      banner: false,
      actions: [],
    });
  }
  // Two notices can share a severity, and their order is then the order they were pushed above,
  // because `Array.prototype.sort` has been stable since ES2019. Nothing relies on that today —
  // `trashed` outranks `changed-elsewhere` on severity now that it is an error — but the push order
  // is still the tie-break, and a test pins the stack's order so a reordering of the branches above
  // fails loudly rather than quietly reshuffling a banner stack between renders.
  return notices.sort((a, b) => SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity]);
}

/**
 * The Umbraco icon that carries a severity, or nothing when the severity is drawn as a shape.
 *
 * Here rather than in the three elements that need it, for the same reason `windowNotices` decides
 * a notice's title rather than each surface asking the window: the titlebar marker, the taskbar
 * button and the banner must not be able to disagree about what `warning` looks like, and this file
 * already owns what each state gets.
 *
 * Both icons ship with Umbraco and both are stroked in `currentColor`, so they take the severity
 * colour from an ordinary `color` declaration with no plumbing — see `.notice-marker` in
 * `window.element`, `.notice-badge` in `taskbar.element` and `.icon` in `window-notices.element`.
 *
 * `info` returns undefined deliberately, and it is not an omission: `info` is the unsaved-changes
 * marker that #20 shipped, its appearance must not change, and a shape carrying no urgency is the
 * right answer for a fact the editor caused themselves. Its callers draw the dot instead.
 * @param severity The severity to draw.
 * @returns The icon name, or undefined for `info`.
 */
export function noticeIconName(severity: UmbraDesktopNoticeSeverity): string | undefined {
  if (severity === 'error') return 'icon-wrong';
  if (severity === 'warning') return 'icon-alert';
  return undefined;
}

/**
 * The worst severity present, which is what the marker and the taskbar badge paint. Pure.
 * @param notices The window's notices.
 * @returns The worst severity, or undefined when there is nothing to say.
 */
export function worstSeverity(
  notices: ReadonlyArray<UmbraDesktopNotice>,
): UmbraDesktopNoticeSeverity | undefined {
  return notices.reduce<UmbraDesktopNoticeSeverity | undefined>(
    (worst, notice) =>
      worst === undefined || SEVERITY_WEIGHT[notice.severity] < SEVERITY_WEIGHT[worst]
        ? notice.severity
        : worst,
    undefined,
  );
}
