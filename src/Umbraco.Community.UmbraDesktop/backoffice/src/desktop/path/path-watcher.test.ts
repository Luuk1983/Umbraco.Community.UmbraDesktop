import { expect } from '@open-wc/testing';
import { UMB_MENU_STRUCTURE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/menu';
import { UMB_SUBMITTABLE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/workspace';
import { watchFramePath, type UmbraDesktopFramePath } from './path-watcher';

/**
 * What the watcher does with a context that *goes away*, which is the half of it that is not about
 * a booting backoffice and therefore the half that can be tested here.
 *
 * The rest of the module is still covered by the manual pass, for the reason `path-watcher.ts`
 * gives: subscribing to a live backoffice is not something the unit runner can stand up. But the
 * bookkeeping around `umb:context-unprovided` is pure state handling over an event core documents,
 * and it is where the strip went wrong — clicking the home crumb routes a window to a section root,
 * where there is no workspace at all, so nothing new is ever provided and the strip sat on the path
 * it had resolved for the document the window had just left.
 *
 * The stand-in provider is built from the same tokens the watcher reads and behaves exactly as
 * `UmbContextProvider` does, as `dirty-watcher.test.ts`'s does: if core changes that contract, these
 * two files are where it shows.
 */

/** The alias/api pairs the way `UmbContextProvider` itself splits them out of the tokens. */
const [STRUCTURE_ALIAS, STRUCTURE_API = 'default'] =
  UMB_MENU_STRUCTURE_WORKSPACE_CONTEXT.toString().split('#');
const [WORKSPACE_ALIAS, WORKSPACE_API = 'default'] =
  UMB_SUBMITTABLE_WORKSPACE_CONTEXT.toString().split('#');

/** A subscribable that emits its current value on subscribe, as Umbraco's observable states do. */
function fakeState<T>(initial: T) {
  const subscribers = new Set<(value: T) => void>();
  let value = initial;
  return {
    observable: {
      subscribe(next: (value: T) => void) {
        subscribers.add(next);
        next(value);
        return { unsubscribe: () => void subscribers.delete(next) };
      },
    },
    set(nextValue: T) {
      value = nextValue;
      for (const next of [...subscribers]) next(value);
    },
    /** How many live subscriptions there are, so a test can prove the watcher let go. */
    get subscriberCount() {
      return subscribers.size;
    },
  };
}

/**
 * A stand-in `UmbContextProvider` on an element, nested under `depth` shadow roots.
 *
 * Both of the contexts this module watches are registered under the *same* context alias and differ
 * only by their api alias, so the provider matches on both — which is exactly what makes the
 * unprovide event ambiguous in the real frame, since that event carries the context alias and not
 * the api one. See the instance check in `path-watcher.ts`.
 *
 * **Two ways to withdraw, because core has two and they are not equivalent.** Both end in
 * `UmbContextProvider.hostDisconnected()` dispatching `umb:context-unprovided` from the provider's
 * own element, but what the rest of the document can hear differs:
 *
 * - `destroyAttached()` is what `router-slot` does to the page element it owns: `destroy()` first,
 *   which walks the controllers while the element is still in the document, then `removeChild`. The
 *   event bubbles to the document like any other.
 * - `detach()` is what happens to every provider *below* that page element, and to anything a modal
 *   takes away: the subtree is removed and `disconnectedCallback` runs afterwards, so the event is
 *   dispatched from an element that is no longer in the document. **It reaches the provider's own
 *   ancestors inside the detached tree and stops there — a document listener never hears it.**
 *
 * Measured against the real `UmbContextProviderController` and `UmbLitElement` rather than assumed;
 * the second case is why the path strip kept a stale path after the first attempt at this fix.
 * @param contextAlias The context alias this provider answers for.
 * @param apiAlias The api alias this provider answers for.
 * @param instance The context instance to hand out.
 * @param depth How many shadow boundaries to bury the provider under.
 * @returns Handles to announce, withdraw and tear the provider down.
 */
function mountProvider(contextAlias: string, apiAlias: string, instance: unknown, depth = 0) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  let parent: Element | ShadowRoot = host;
  for (let i = 0; i < depth; i += 1) {
    const shell = document.createElement('div');
    parent.appendChild(shell);
    parent = shell.attachShadow({ mode: 'open' });
  }
  const element = document.createElement('div');
  parent.appendChild(element);

  element.addEventListener('umb:context-request', (e: Event) => {
    const request = e as Event & {
      contextAlias: string;
      apiAlias: string;
      callback: (instance: unknown) => boolean;
    };
    if (request.contextAlias !== contextAlias) return;
    if (request.apiAlias === apiAlias && request.callback(instance)) e.stopImmediatePropagation();
  });

  /** Fire an alias-carrying, bubbling, composed event of the given type from the provider. */
  const announce = (type: string, extra: Record<string, unknown> = {}) => {
    const event = new Event(type, { bubbles: true, composed: true });
    Object.assign(event, { contextAlias }, extra);
    element.dispatchEvent(event);
  };

  return {
    provide: () => announce('umb:context-provide'),
    destroyAttached: () => {
      announce('umb:context-unprovided', { instance });
      host.remove();
    },
    detach: () => {
      host.remove();
      announce('umb:context-unprovided', { instance });
    },
    dispose: () => host.remove(),
  };
}

/** One of core's structure items, as the frame publishes them. */
function structureItem(unique: string | null, name: string) {
  return { unique, entityType: 'document', name };
}

/**
 * A stand-in menu-structure context.
 * @param items The ancestry it starts on, root first.
 * @returns The instance and a handle on its structure state.
 */
function fakeStructure(items: Array<Record<string, unknown>>) {
  const state = fakeState<ReadonlyArray<Record<string, unknown>>>(items);
  const instance = {
    structure: state.observable,
    getItemHref: (item: unknown) =>
      `section/content/workspace/document/edit/${(item as { unique: string }).unique}`,
  };
  return { instance, state };
}

/**
 * A stand-in workspace context that can name itself.
 * @param name The name it starts on.
 * @returns The instance and a handle on its name state.
 */
function fakeWorkspace(name: string) {
  const state = fakeState<string | undefined>(name);
  const instance = { requestSubmit: () => Promise.resolve(), name: state.observable };
  return { instance, state };
}

/** Everything one test needs torn down, in reverse order, whether it passed or not. */
let teardown: Array<() => void> = [];

afterEach(() => {
  for (const dispose of teardown.reverse()) dispose();
  teardown = [];
});

/**
 * Start a watcher over the test document and collect what it reports.
 * @returns The reported paths, in order.
 */
function watch(): UmbraDesktopFramePath[] {
  const reported: UmbraDesktopFramePath[] = [];
  teardown.push(watchFramePath(document, (path) => reported.push(path)));
  return reported;
}

it('reports the ancestry the frame publishes, with core’s synthetic root left in for the caller', () => {
  const reported = watch();
  const structure = fakeStructure([structureItem(null, ''), structureItem('a1', 'People')]);
  const provider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, structure.instance, 3);
  teardown.push(provider.dispose);

  provider.provide();

  expect(reported[reported.length - 1].structure.map((item) => item.unique)).to.deep.equal([
    null,
    'a1',
  ]);
});

it('empties the path when the workspace is torn down detached, as clicking home does', () => {
  // Issue: the home crumb routes the window to its launch URL, which is a section root — and a
  // section root has no workspace, so no new structure is ever provided. Without this, the strip
  // kept showing the path of the document the window had just left.
  //
  // `detach()` and not `destroyAttached()`, because that is what the frame actually does to these
  // two contexts: they are provided by `umb-workspace`, which sits below the page element
  // `router-slot` owns, so it is removed with the subtree and announces its withdrawal from
  // outside the document. A document-level listener hears nothing at all. See `mountProvider`.
  const reported = watch();
  const structure = fakeStructure([structureItem('a1', 'People')]);
  const workspace = fakeWorkspace('Lee Kelleher');
  const structureProvider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, structure.instance);
  const workspaceProvider = mountProvider(WORKSPACE_ALIAS, WORKSPACE_API, workspace.instance);
  teardown.push(structureProvider.dispose, workspaceProvider.dispose);

  structureProvider.provide();
  workspaceProvider.provide();
  expect(reported[reported.length - 1].structure).to.have.lengthOf(1);

  structureProvider.detach();
  workspaceProvider.detach();

  const last = reported[reported.length - 1];
  expect(last.structure, 'the window is at its root and has no ancestry to show').to.deep.equal([]);
  expect(last.currentName, 'and nothing to name').to.equal(undefined);
});

it('empties the path when the workspace is destroyed still attached', () => {
  // The other of core's two teardown orders, kept as its own test because the two are not the same
  // event as far as the rest of the document is concerned and only one of them used to work.
  const reported = watch();
  const structure = fakeStructure([structureItem('a1', 'People')]);
  const provider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, structure.instance);
  teardown.push(provider.dispose);

  provider.provide();
  provider.destroyAttached();

  expect(reported[reported.length - 1].structure).to.deep.equal([]);
});

it('drops a workspace’s name without dropping the ancestry beside it', () => {
  // The two contexts share a context alias and differ only by api alias, and the unprovide event
  // carries the context alias alone. Matching on the instance is what keeps one from clearing the
  // other.
  const reported = watch();
  const structure = fakeStructure([structureItem('a1', 'People')]);
  const workspace = fakeWorkspace('Lee Kelleher');
  const structureProvider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, structure.instance);
  const workspaceProvider = mountProvider(WORKSPACE_ALIAS, WORKSPACE_API, workspace.instance);
  teardown.push(structureProvider.dispose, workspaceProvider.dispose);

  structureProvider.provide();
  workspaceProvider.provide();
  workspaceProvider.detach();

  const last = reported[reported.length - 1];
  expect(last.currentName).to.equal(undefined);
  expect(last.structure, 'the ancestry is the other context’s to report').to.have.lengthOf(1);
});

it('keeps the incoming path when the outgoing context is unprovided after it', () => {
  // `router-slot` clears its old page before appending the new one, so an ordinary navigation
  // withdraws before it provides — but the order is core's business, not this package's, and a
  // stale withdrawal arriving last must not wipe the path that has already replaced it.
  const reported = watch();
  const leaving = fakeStructure([structureItem('a1', 'People')]);
  const arriving = fakeStructure([structureItem('b2', 'Blog'), structureItem('c3', 'A post')]);
  const leavingProvider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, leaving.instance);
  const arrivingProvider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, arriving.instance);
  teardown.push(leavingProvider.dispose, arrivingProvider.dispose);

  leavingProvider.provide();
  arrivingProvider.provide();
  leavingProvider.detach();

  expect(reported[reported.length - 1].structure.map((item) => item.unique)).to.deep.equal([
    'b2',
    'c3',
  ]);
});

it('reports the innermost context, and ignores one buried under it', () => {
  // A modal workspace stacks a second context on the window's own rather than replacing it.
  const reported = watch();
  const outer = fakeStructure([structureItem('a1', 'People')]);
  const inner = fakeStructure([structureItem('b2', 'Blog')]);
  const outerProvider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, outer.instance);
  const innerProvider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, inner.instance);
  teardown.push(outerProvider.dispose, innerProvider.dispose);

  outerProvider.provide();
  innerProvider.provide();

  outer.state.set([structureItem('a1', 'Renamed underneath')]);
  expect(reported[reported.length - 1].structure.map((item) => item.name)).to.deep.equal(['Blog']);
});

it('falls back to the context underneath when the innermost one goes away', () => {
  // Closing a modal must restore the window's own path rather than blank it, which is what keeping
  // the buried context subscribed buys.
  const reported = watch();
  const outer = fakeStructure([structureItem('a1', 'People')]);
  const inner = fakeStructure([structureItem('b2', 'Blog')]);
  const outerProvider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, outer.instance);
  const innerProvider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, inner.instance);
  teardown.push(outerProvider.dispose, innerProvider.dispose);

  outerProvider.provide();
  innerProvider.provide();
  innerProvider.detach();

  expect(reported[reported.length - 1].structure.map((item) => item.unique)).to.deep.equal(['a1']);
});

it('lets go of every subscription when it is stopped', () => {
  const reported: UmbraDesktopFramePath[] = [];
  const stop = watchFramePath(document, (path) => reported.push(path));
  const structure = fakeStructure([structureItem('a1', 'People')]);
  const provider = mountProvider(STRUCTURE_ALIAS, STRUCTURE_API, structure.instance);
  teardown.push(provider.dispose);

  provider.provide();
  expect(structure.state.subscriberCount, 'the watcher subscribed').to.equal(1);
  const reportedBeforeStopping = reported.length;

  stop();

  expect(structure.state.subscriberCount, 'and unsubscribed').to.equal(0);
  provider.detach();
  expect(reported.length, 'a stopped watcher reports nothing').to.equal(reportedBeforeStopping);
});
