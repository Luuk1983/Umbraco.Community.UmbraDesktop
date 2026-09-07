import { UMB_SUBMITTABLE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/workspace';
import { jsonStringComparison } from '@umbraco-cms/backoffice/observable-api';

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
const [WORKSPACE_CONTEXT_ALIAS, WORKSPACE_API_ALIAS = 'default'] =
  UMB_SUBMITTABLE_WORKSPACE_CONTEXT.toString().split('#');

/** Umbraco's context-api event names. Not exported by the package, and stable across v14+. */
const CONTEXT_REQUEST_EVENT = 'umb:context-request';
const CONTEXT_PROVIDE_EVENT = 'umb:context-provide';
const CONTEXT_UNPROVIDED_EVENT = 'umb:context-unprovided';

/** The shape `UmbContextProvider` reads off a request event. It never checks the event's class. */
interface ContextRequestEventLike {
  contextAlias: string;
  apiAlias: string;
  callback: (instance: unknown) => boolean;
  stopAtContextMatch: boolean;
}

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
}

/** One tracked workspace: its live subscriptions and the last dirty answer it gave. */
interface TrackedWorkspace {
  /** Drops both subscriptions. */
  release: () => void;
  /** Whether this workspace is currently holding unsaved changes. */
  dirty: boolean;
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
 * Ask one element for the workspace context it provides.
 *
 * `UmbContextProvider` registers its request listener on the very element it announces itself
 * from, and answers by reading `contextAlias`, `apiAlias` and `callback` off the event without ever
 * checking its class. So a plain `Event` carrying those three is enough, and this avoids having to
 * construct core's own event class inside the frame's realm.
 * @param element The element a provider announced itself from.
 * @param onInstance Called with whatever that provider holds; return true to stop the request.
 */
function requestWorkspaceContext(element: EventTarget, onInstance: (instance: unknown) => boolean): void {
  const event = new Event(CONTEXT_REQUEST_EVENT, { bubbles: true, composed: true, cancelable: true });
  const request: ContextRequestEventLike = {
    contextAlias: WORKSPACE_CONTEXT_ALIAS,
    apiAlias: WORKSPACE_API_ALIAS,
    callback: onInstance,
    // The provider stops the event at the first alias match, which is what we want: the nearest
    // workspace to that element is the one it provides.
    stopAtContextMatch: true,
  };
  Object.assign(event, request);
  element.dispatchEvent(event);
}

/**
 * Watch a frame's document for workspaces holding unsaved changes, reporting each time the answer
 * flips.
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
 * `onChange` is called only when the overall answer changes, never on start: an already-dirty
 * window re-reports dirty on every keystroke, and passing that through would repaint the desktop
 * per character.
 * @param doc The frame's document.
 * @param onChange Called with the new answer each time it flips.
 * @returns A function that stops watching and drops every subscription.
 */
export function watchWorkspaceDirtyState(
  doc: Document,
  onChange: (dirty: boolean) => void,
): () => void {
  const tracked = new Map<object, TrackedWorkspace>();
  let reported = false;
  let stopped = false;

  /** Push the overall answer out, but only when it has actually changed. */
  const publish = () => {
    const dirty = [...tracked.values()].some((entry) => entry.dirty);
    if (dirty === reported) return;
    reported = dirty;
    onChange(dirty);
  };

  /** Subscribe to a workspace's two halves and keep its dirty answer up to date. */
  const track = (workspace: ComparableWorkspace) => {
    const key = workspace as unknown as object;
    if (stopped || tracked.has(key)) return;
    let persisted: unknown;
    let current: unknown;
    const entry: TrackedWorkspace = { dirty: false, release: () => {} };
    const evaluate = () => {
      entry.dirty = hasUnsavedChanges(persisted, current);
      publish();
    };
    // Registered before subscribing, because both observables emit their current value straight
    // away and `evaluate` has to find the entry already in the map to publish a truthful total.
    tracked.set(key, entry);
    const persistedSub = workspace.persistedData.subscribe((value) => {
      persisted = value;
      evaluate();
    });
    const currentSub = workspace.data.subscribe((value) => {
      current = value;
      evaluate();
    });
    entry.release = () => {
      persistedSub.unsubscribe();
      currentSub.unsubscribe();
    };
  };

  const onProvide = (e: Event) => {
    if ((e as ContextProvideEventLike).contextAlias !== WORKSPACE_CONTEXT_ALIAS) return;
    // The provider announced itself from this element, so this element is where its request
    // listener lives. `composedPath()[0]` rather than `target`, which shadow DOM has retargeted
    // to the nearest host by the time the event reaches the document.
    const provider = e.composedPath()[0];
    if (!provider) return;
    requestWorkspaceContext(provider, (instance) => {
      if (!isComparableWorkspace(instance)) return false;
      track(instance);
      return true;
    });
  };

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

  doc.addEventListener(CONTEXT_PROVIDE_EVENT, onProvide);
  doc.addEventListener(CONTEXT_UNPROVIDED_EVENT, onUnprovided);

  return () => {
    stopped = true;
    doc.removeEventListener(CONTEXT_PROVIDE_EVENT, onProvide);
    doc.removeEventListener(CONTEXT_UNPROVIDED_EVENT, onUnprovided);
    for (const entry of tracked.values()) entry.release();
    tracked.clear();
  };
}
