import { UMB_SUBMITTABLE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/workspace';
import { jsonStringComparison } from '@umbraco-cms/backoffice/observable-api';
import { aliasesOf, watchProvidedContexts } from './frame-context.js';

/**
 * Watches a window's frame for unsaved changes, so the desktop can mark the window and can ask
 * before any of its three exits — close, reload, Exit — throws the work away.
 *
 * A window's content is a same-origin iframe, so the shell can reach into it; `chrome-injector.ts`
 * is the precedent for that. Reading *state* out of it is harder than injecting CSS into it, for
 * one specific reason worth knowing before changing anything here — see {@link watchWorkspaceDirtyState}.
 */

/**
 * The context alias and api alias, split out of the token exactly as `UmbContextProvider` splits
 * them, so a rename in core breaks the import rather than silently matching nothing.
 *
 * `toString()` rather than the token's fields because only `contextAlias` is public on it —
 * `apiAlias` is protected — and the two have to be taken from one place or they can disagree.
 */
const [WORKSPACE_CONTEXT_ALIAS, WORKSPACE_API_ALIAS] = aliasesOf(UMB_SUBMITTABLE_WORKSPACE_CONTEXT);

/**
 * The one context event this module still names for itself.
 *
 * Its siblings — request and provide — moved to `frame-context.ts` when the path strip needed the
 * same dance. This one stayed, because dropping a workspace when its provider goes away is this
 * module's own bookkeeping and not something a second consumer would want: the path watcher holds
 * no per-workspace state to drop.
 */
const CONTEXT_UNPROVIDED_EVENT = 'umb:context-unprovided';

/** The shape a provide/unprovide event carries; `instance` is present on unprovide only. */
interface ContextProvideEventLike {
  contextAlias?: string;
  instance?: unknown;
}

/** Only what this module needs of an Umbraco observable. */
interface Subscribable<T> {
  subscribe(next: (value: T) => void): { unsubscribe: () => void };
}

/**
 * A workspace context this module can compare: one that publishes both halves of the comparison.
 *
 * `data` is the workspace's current data — what the editor is holding — and `persistedData` is the
 * same data as last saved. Every editable workspace the desktop can open derives from
 * `UmbEntityDetailWorkspaceContextBase`, which declares both as public observables.
 */
interface ComparableWorkspace {
  /** The workspace's current data. */
  data: Subscribable<unknown>;
  /** The workspace's data as last saved. */
  persistedData: Subscribable<unknown>;
  /** The subject's unique id, when this workspace has one. */
  unique?: Subscribable<string | null | undefined>;
  /** The subject's entity type, when this workspace has one. */
  entityType?: Subscribable<string | undefined>;
  /** Re-fetch and apply in place. */
  reload?: () => Promise<void>;
  /** The server's copy, without applying it. */
  loadWithoutPersist?: () => Promise<unknown>;
}

/**
 * The parts of a workspace context the server-event router needs, lifted out of the frame's realm
 * into plain functions the shell can hold.
 *
 * Functions rather than the instance itself, so nothing outside this module depends on the shape of
 * a core class, and so a subject stays valid to *read* even as the data behind it moves: the two
 * getters close over the values this module is already subscribed to, which is what lets the router
 * fetch and compare against a live pair rather than a snapshot taken when the event arrived.
 */
export interface UmbraDesktopWorkspaceSubject {
  /** The entity type, e.g. `document`. */
  entityType: string;
  /** The entity's unique id, which is the GUID a server event carries as its `key`. */
  unique: string;
  /** Re-fetch and apply in place, keeping scroll position, the open tab and split view. */
  reload: () => Promise<void>;
  /**
   * The server's current copy, without applying it to the workspace.
   *
   * Optional: it is declared on `UmbEntityDetailWorkspaceContextBase`, and a comparable workspace
   * that lacks it simply cannot be classified rather than being an exception to handle. Design R3.
   */
  loadWithoutPersist?: () => Promise<unknown>;
  /** What this workspace last saved, live. */
  getPersistedData: () => unknown;
  /** What the editor is holding, live. */
  getData: () => unknown;
}

/** What a frame currently is, as far as the shell is concerned. */
export interface UmbraDesktopFrameState {
  /** Whether anything in the frame is holding unsaved changes. */
  dirty: boolean;
  /** What the frame's workspaces are showing, for matching server events against. */
  subjects: ReadonlyArray<UmbraDesktopWorkspaceSubject>;
}

/** One tracked workspace: its live subscriptions, its last dirty answer and what it is showing. */
interface TrackedWorkspace {
  /** Drops every subscription. */
  release: () => void;
  /** Whether this workspace is currently holding unsaved changes. */
  dirty: boolean;
  /** The subject it is showing, or undefined until its unique and entity type both arrive. */
  subject?: UmbraDesktopWorkspaceSubject;
}

/**
 * Whether an instance is a workspace context this module can compare.
 *
 * Two gates, and both matter. The token's own discriminator is what "is a workspace context" means
 * to Umbraco, so it is asked rather than re-stated here. The observable pair is what makes the
 * workspace *comparable*: a context without it — Log Viewer's, any dashboard's — is not an
 * exception to handle but simply not a match, which is why nothing in the desktop names those apps.
 * @param instance The context instance a provider answered with.
 * @returns True when this instance can be watched for unsaved changes.
 */
function isComparableWorkspace(instance: unknown): instance is ComparableWorkspace {
  const discriminate = UMB_SUBMITTABLE_WORKSPACE_CONTEXT.getDiscriminator?.();
  if (discriminate && !discriminate(instance as never)) return false;
  const candidate = instance as Partial<ComparableWorkspace>;
  return (
    typeof candidate?.data?.subscribe === 'function' &&
    typeof candidate?.persistedData?.subscribe === 'function'
  );
}

/**
 * Whether a workspace's two halves differ, i.e. whether it holds unsaved changes.
 *
 * This is core's own comparison — `jsonStringComparison` is the function
 * `UmbEntityWorkspaceDataManager.getHasUnpersistedChanges()` calls — but not core's own *method*,
 * deliberately. That method `console.warn`s on every call that finds changes, which core gets away
 * with because it only asks once, on navigate-away. Anything that *watches* dirtiness asks on every
 * change, and every one of those calls would write a warning to the console. See design §3.1.
 *
 * A half that is still `undefined` means the workspace has not finished loading, and a workspace
 * that has not loaded cannot have unsaved work — that guard is also what stops the dot flashing on
 * during the tick between core setting the persisted half and setting the current one.
 * @param persisted The data as last saved.
 * @param current The data the editor is holding.
 * @returns True when the two differ.
 */
export function hasUnsavedChanges(persisted: unknown, current: unknown): boolean {
  if (persisted === undefined || current === undefined) return false;
  return jsonStringComparison(persisted, current) === false;
}

/**
 * Watch a frame's document for the workspaces inside it, reporting each time what the frame is —
 * whether anything in it holds unsaved changes, and what its workspaces are showing — changes.
 *
 * **Why it listens for provides instead of asking.** A context request travels *up* the tree, so a
 * probe element parked at the document root is an ancestor of every workspace and its request rises
 * away from them, never to them. That breaks exactly the case that matters most — a window hosting
 * a whole section, whose workspace mounts far below the frame root. What does reach the document is
 * `umb:context-provide`, which every provider fires on connect with `bubbles` and `composed` set.
 * So this listens for that, takes the provider's own element off the event's composed path, and
 * asks *it* directly. It fires again on every navigation inside the window, which is what makes
 * opening a second document in the same window work with no extra machinery.
 *
 * `onChange` is called only when the reported state changes, never on start: an already-dirty
 * window re-reports dirty on every keystroke, and passing that through would repaint the desktop
 * per character.
 * @param doc The frame's document.
 * @param onChange Called with the frame's new state each time it changes.
 * @returns A function that stops watching and drops every subscription.
 */
export function watchWorkspaceDirtyState(
  doc: Document,
  onChange: (state: UmbraDesktopFrameState) => void,
): () => void {
  /**
   * A comparable string standing for one frame state, which is how a report is suppressed.
   *
   * Over the whole answer rather than over the dirty boolean alone, because the answer now has two
   * halves and either can move on its own: a window navigating from one clean document to another
   * changes nothing about dirtiness and everything about what an event should match. The identity of
   * the subject's functions is deliberately not part of it, so re-evaluating the same document — as
   * every keystroke does — does not count as a change.
   * @param dirty Whether anything in the frame holds unsaved changes.
   * @param subjects What the frame's workspaces are showing.
   * @returns A string equal for two states the desktop would draw identically.
   */
  const signatureOf = (
    dirty: boolean,
    subjects: ReadonlyArray<UmbraDesktopWorkspaceSubject>,
  ): string => `${dirty}|${subjects.map((s) => `${s.entityType}:${s.unique}`).join(',')}`;

  const tracked = new Map<object, TrackedWorkspace>();
  /**
   * The signature last handed to `onChange`, seeded with the state a frame starts in: nothing
   * tracked and nothing dirty.
   *
   * Seeded rather than left undefined, and that is what keeps "never on start" true. Tracking a
   * workspace evaluates it before its observables have delivered anything, so the first `publish`
   * of a freshly opened window computes the empty signature; against an unset baseline that counts
   * as a change and every window would report clean-with-no-subjects the moment it loaded.
   */
  let reported = signatureOf(false, []);
  let stopped = false;

  /** Push the frame's state out, but only when it has actually changed. */
  const publish = () => {
    const entries = [...tracked.values()];
    const dirty = entries.some((entry) => entry.dirty);
    const subjects = entries
      .map((entry) => entry.subject)
      .filter((subject): subject is UmbraDesktopWorkspaceSubject => subject !== undefined);
    const signature = signatureOf(dirty, subjects);
    if (signature === reported) return;
    reported = signature;
    onChange({ dirty, subjects });
  };

  /** Subscribe to a workspace's halves and its identity, and keep its entry up to date. */
  const track = (workspace: ComparableWorkspace) => {
    const key = workspace as unknown as object;
    if (stopped || tracked.has(key)) return;
    let persisted: unknown;
    let current: unknown;
    let unique: string | null | undefined;
    let entityType: string | undefined;
    const entry: TrackedWorkspace = { dirty: false, release: () => {} };
    /**
     * Recompute this entry's dirty answer and its subject, then publish the frame's total.
     *
     * The subject is rebuilt rather than patched, because a navigation inside the window moves the
     * unique on the same context instance and the subject is what an event is matched against. Its
     * getters close over the `persisted` and `current` variables above rather than copying them, so
     * a subject handed out earlier still reads the pair in force now: the router asks after an
     * await, by which time the editor has been typing.
     */
    const evaluate = () => {
      entry.dirty = hasUnsavedChanges(persisted, current);
      entry.subject =
        unique && entityType && workspace.reload
          ? {
              entityType,
              unique,
              reload: () => workspace.reload!(),
              loadWithoutPersist: workspace.loadWithoutPersist
                ? () => workspace.loadWithoutPersist!()
                : undefined,
              getPersistedData: () => persisted,
              getData: () => current,
            }
          : undefined;
      publish();
    };
    // Registered before subscribing, because every observable emits its current value straight
    // away and `evaluate` has to find the entry already in the map to publish a truthful total.
    tracked.set(key, entry);
    const subs = [
      workspace.persistedData.subscribe((value) => {
        persisted = value;
        evaluate();
      }),
      workspace.data.subscribe((value) => {
        current = value;
        evaluate();
      }),
      // Optional, and absent is not an error: a workspace with no identity to publish simply has no
      // subject, so nothing outside this module has to know which workspaces those are. Design R3.
      workspace.unique?.subscribe((value) => {
        unique = value;
        evaluate();
      }),
      workspace.entityType?.subscribe((value) => {
        entityType = value;
        evaluate();
      }),
    ];
    entry.release = () => {
      for (const sub of subs) sub?.unsubscribe();
    };
  };

  // Why this listens for provides rather than asking, and why it takes the provider off the
  // composed path, is `frame-context.ts`'s whole subject. The alias check the old inline version
  // did here now happens in the request itself, which the provider answers only on a match.
  const stopWatching = watchProvidedContexts(
    doc,
    WORKSPACE_CONTEXT_ALIAS,
    WORKSPACE_API_ALIAS,
    (instance) => {
      if (!isComparableWorkspace(instance)) return false;
      track(instance);
      return true;
    },
  );

  const onUnprovided = (e: Event) => {
    const event = e as ContextProvideEventLike;
    if (event.contextAlias !== WORKSPACE_CONTEXT_ALIAS) return;
    const key = event.instance as object | undefined;
    const entry = key ? tracked.get(key) : undefined;
    if (!entry || !key) return;
    entry.release();
    tracked.delete(key);
    publish();
  };

  doc.addEventListener(CONTEXT_UNPROVIDED_EVENT, onUnprovided);

  return () => {
    stopped = true;
    stopWatching();
    doc.removeEventListener(CONTEXT_UNPROVIDED_EVENT, onUnprovided);
    for (const entry of tracked.values()) entry.release();
    tracked.clear();
  };
}
