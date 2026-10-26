import { classifyConflict } from './classify.js';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher.js';
import type { UmbraDesktopServerStatePatch } from '../window-model.js';

/**
 * Turns Umbraco's server events into flags on the windows they concern.
 *
 * Separated from the context plumbing so all of it is testable with plain objects: the router is
 * handed a way to read the current windows and a sink to write flags to, and knows nothing about
 * `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT`. `server-event.controller.ts` is the twenty lines that
 * connect the two.
 */

/** One event as the management API's hub delivers it. */
export interface UmbraDesktopServerEvent {
  /** e.g. `Umbraco:CMS:Document`. */
  eventSource: string;
  /** `Updated`, `Trashed` or `Deleted`; anything else is ignored. */
  eventType: string;
  /** The entity's GUID. */
  key: string;
  /** Stamped by the client on receipt, so it dates the delivery and not the change. */
  clientTimestamp: string;
}

/** The window state the router reads. */
export interface UmbraDesktopRouterWindow {
  /** The window's id. */
  id: string;
  /** Whether it is holding unsaved changes. */
  dirty?: boolean;
}

/** What the router needs of the world around it. */
export interface UmbraDesktopRouterHost {
  /** The currently open windows. */
  windows: () => ReadonlyArray<UmbraDesktopRouterWindow>;
  /** What a window is showing. */
  subjectsOf: (id: string) => ReadonlyArray<UmbraDesktopWorkspaceSubject>;
  /** Record what the server says happened to a window's subject. */
  setServerState: (id: string, patch: UmbraDesktopServerStatePatch) => void;
  /** Mark a window as re-fetching itself, which spins its titlebar reload glyph. */
  setRefreshing: (id: string, refreshing: boolean) => void;
}

/** The event sources this desktop acts on. Everything else is somebody else's cache to invalidate. */
const HANDLED_SOURCES: ReadonlyArray<string> = ['Umbraco:CMS:Document', 'Umbraco:CMS:Media'];

/** The event types this desktop acts on. */
const HANDLED_TYPES: ReadonlyArray<string> = ['Updated', 'Trashed', 'Deleted'];

/** The event source the server uses for each entity type the router acts on. */
const SOURCE_OF: Readonly<Record<string, string>> = { document: 'Umbraco:CMS:Document', media: 'Umbraco:CMS:Media' };

/**
 * A change made on the desktop itself, as the server's own `Updated` event for that entity (#176), so
 * the router treats it exactly as one: a clean window showing the entity reloads, a dirty one is
 * classified, an app's subject is decided by version. The server's event for the same change may
 * still arrive; by then a clean window is at that version, and an app's subject finds nothing new.
 * @param change Which entity changed.
 * @param now The time stamp, for tests.
 * @returns The event, or undefined for an entity type the router does not act on.
 */
export function localChangeEvent(
  change: { entityType: string; unique: string },
  now: () => string = () => new Date().toISOString(),
): UmbraDesktopServerEvent | undefined {
  const eventSource = SOURCE_OF[change.entityType];
  return eventSource && change.unique ? { eventSource, eventType: 'Updated', key: change.unique, clientTimestamp: now() } : undefined;
}

/**
 * Whether a rejected fetch means the entity is gone rather than that the network is.
 *
 * `loadWithoutPersist` wraps the repository's failure as `new Error(…, { cause: error })`, and the
 * cause is the API error carrying the status. Anything that is not a 404 is treated as "we do not
 * know", because marking a window permanently deleted on a dropped connection would be a much worse
 * lie than saying nothing.
 * @param error Whatever the fetch rejected with.
 * @returns True when the server said the entity does not exist.
 */
function isMissing(error: unknown): boolean {
  const cause = (error as { cause?: { status?: number } } | undefined)?.cause;
  return cause?.status === 404;
}

/**
 * Build a router over the given host.
 * @param host How to read windows and write flags; see {@link UmbraDesktopRouterHost}.
 * @returns The router.
 */
export function createServerEventRouter(host: UmbraDesktopRouterHost) {
  /**
   * Reload one subject in place, with the window's glyph spinning while it happens.
   *
   * The `finally` matters more than it looks: a reload that rejects, because the entity went while
   * we were asking, would otherwise leave the glyph spinning for the life of the window.
   * @param id The window.
   * @param subject What it is showing.
   */
  const refresh = async (id: string, subject: UmbraDesktopWorkspaceSubject): Promise<void> => {
    host.setRefreshing(id, true);
    try {
      await subject.reload();
    } finally {
      host.setRefreshing(id, false);
    }
  };

  /**
   * Windows with a classification fetch in flight, and whether another event arrived while it was.
   *
   * A bulk operation, such as publish with descendants or a recycle-bin empty, delivers an event
   * per affected node, and a window can match several of them in a burst. Without this the window
   * would fetch once per event and classify against data that was already stale by the time the
   * first answer came back. One in flight per window, and at most one re-run after it, which is
   * what "coalesced" means here.
   */
  const inFlight = new Map<string, { pending: boolean }>();

  /**
   * Fetch the server's copy for one subject and act on the verdict.
   * @param id The window.
   * @param subject What it is showing.
   */
  const classify = async (id: string, subject: UmbraDesktopWorkspaceSubject): Promise<void> => {
    if (!subject.loadWithoutPersist) return;
    let theirs: unknown;
    try {
      theirs = await subject.loadWithoutPersist();
    } catch (error) {
      if (isMissing(error)) host.setServerState(id, { deleted: true });
      return;
    }
    // Read both sides *after* the await, not before: the editor has been typing throughout, and
    // the pair the verdict is about is the one in force when the answer arrived.
    const verdict = classifyConflict({
      base: subject.getPersistedData(),
      mine: subject.getData(),
      theirs,
    });
    if (verdict === 'conflict') host.setServerState(id, { changedElsewhere: true });
    else if (verdict === 'refresh') await refresh(id, subject);
  };

  /**
   * Decide for an element app's subject (#176), by version rather than by data: the app's unsaved
   * work is nothing the router can read. The server at the version the app holds is the app's own
   * save, or nothing new, so it is left alone; that is what keeps the Image Editor from reopening its
   * own save and losing its undo history. Newer, a clean app takes it and a dirty one is flagged.
   * @param id The window.
   * @param subject What it is showing, with its `version`.
   * @param dirty Whether the window holds unsaved work, read when the event arrived.
   */
  const decideApp = async (id: string, subject: UmbraDesktopWorkspaceSubject, dirty: boolean): Promise<void> => {
    const version = subject.version!;
    let theirs: string | null | undefined;
    try {
      theirs = await version.server();
    } catch (error) {
      if (isMissing(error)) host.setServerState(id, { deleted: true });
      return;
    }
    // Neither side known says nothing, as `classifyConflict` treats a side that has not arrived.
    if (theirs == null || theirs === version.held()) return;
    if (dirty) host.setServerState(id, { changedElsewhere: true });
    else await refresh(id, subject);
  };

  /**
   * Run `classify` for a window, coalescing anything that arrives while it is in flight.
   * @param id The window.
   * @param subject What it is showing.
   */
  const classifyCoalesced = async (id: string, subject: UmbraDesktopWorkspaceSubject): Promise<void> => {
    const running = inFlight.get(id);
    if (running) {
      running.pending = true;
      return;
    }
    const entry = { pending: false };
    inFlight.set(id, entry);
    // An app subject is decided by version, and asks its window's dirty state afresh each time.
    const decide = subject.version
      ? () => decideApp(id, subject, host.windows().find((w) => w.id === id)?.dirty === true)
      : () => classify(id, subject);
    try {
      await decide();
      if (entry.pending) await decide();
    } finally {
      inFlight.delete(id);
    }
  };

  return {
    /**
     * Act on one server event.
     *
     * Matching is on the event's `key` against each window's subject. Umbraco keys are GUIDs and
     * globally unique, so the key alone is a sound match; the source is filtered first only to keep
     * the desktop out of events it has no business acting on.
     * @param event The event.
     */
    async handleEvent(event: UmbraDesktopServerEvent): Promise<void> {
      if (!HANDLED_SOURCES.includes(event.eventSource)) return;
      if (!HANDLED_TYPES.includes(event.eventType)) return;
      const work: Promise<void>[] = [];
      for (const window of host.windows()) {
        for (const subject of host.subjectsOf(window.id)) {
          if (subject.unique !== event.key) continue;
          if (event.eventType === 'Deleted') {
            // Nothing to fetch and nothing to compare: there is no version to refresh to, and a
            // save from here cannot succeed. It is the one state that marks a clean window.
            host.setServerState(window.id, { deleted: true });
            continue;
          }
          if (event.eventType === 'Trashed') {
            // Recorded unconditionally, on a clean window too: `notices.ts` already gates the
            // banner on `trashed && dirty` (design D8, a clean window has nothing at risk and takes
            // the server's version in place), so re-checking `window.dirty` here was both redundant
            // and lossy. A clean window whose node is binned recorded nothing, and the trashed
            // banner never appeared even a minute later once the editor started typing — exactly
            // the state design §3 describes.
            host.setServerState(window.id, { trashed: true });
          }
          if (subject.version) {
            // An element app's subject, clean or dirty: decided by version (#176), see `decideApp`.
            work.push(classifyCoalesced(window.id, subject));
            continue;
          }
          if (!window.dirty) {
            // Nothing of the editor's to lose, so take the server's version in place. This is the
            // same single request a classification would have spent, so a clean window costs
            // nothing extra.
            work.push(refresh(window.id, subject));
            continue;
          }
          work.push(classifyCoalesced(window.id, subject));
        }
      }
      await Promise.all(work);
    },
  };
}
