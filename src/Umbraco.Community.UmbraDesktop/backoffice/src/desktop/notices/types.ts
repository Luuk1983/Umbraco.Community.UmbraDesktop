/**
 * What a window tells its editor about the state of the document inside it.
 *
 * Three severities and one list, rather than a mechanism per condition. Today's unsaved-changes dot
 * is the `info` level of this, so the conflict work adds two levels above it instead of a parallel
 * marker beside it, and every future condition a window might report (a validation failure, a
 * scheduled publish, an environment mismatch) is a new entry rather than new chrome. Design D1.
 */

/** How loud a notice is, which is the only thing that decides where it appears. */
export type UmbraDesktopNoticeSeverity = 'info' | 'warning' | 'error';

/** Which condition a notice is about. Stable, because CSS and tests both key off it. */
export type UmbraDesktopNoticeId = 'unsaved' | 'changed-elsewhere' | 'trashed' | 'deleted';

/**
 * Something the editor can do about a notice.
 *
 * `acknowledge` opens the confirmation that says saving will lose the other editor's change and
 * `discard-and-load` takes the server's version. Phase 2 adds `show-changes`.
 *
 * Both belong to the conflict, which is the one condition an editor can actually decide something
 * about. The two `error` notices offer nothing: there was a `close` action on the deleted banner,
 * and it went because a window whose document is gone is still a working window — its tree works
 * and navigating to another node is what most people will do — so the only button on it was the one
 * that threw the window away. A banner is there to say what happened, not to be the way out.
 */
export type UmbraDesktopNoticeAction = 'acknowledge' | 'discard-and-load';

/** One thing a window has to say about its document. */
export interface UmbraDesktopNotice {
  /** Which condition this is about. */
  id: UmbraDesktopNoticeId;
  /** How loud it is. */
  severity: UmbraDesktopNoticeSeverity;
  /** Localization key for the heading. */
  title: string;
  /** Localization key for the explanation. */
  body: string;
  /**
   * Whether this notice is drawn as a banner in the window's chrome.
   *
   * Derived rather than asked, and it is where two rules live: `info` never gets a banner, because a
   * strip on every window with unsaved changes would be intolerable and would change today's
   * behaviour; and an acknowledged conflict loses its banner while keeping its severity, so the
   * marker and the badge stay.
   */
  banner: boolean;
  /** What the editor can do about it, in the order the buttons are drawn. */
  actions: ReadonlyArray<UmbraDesktopNoticeAction>;
}
