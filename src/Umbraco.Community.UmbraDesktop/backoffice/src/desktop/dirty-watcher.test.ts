import { expect } from '@open-wc/testing';
import { watchWorkspaceDirtyState, type UmbraDesktopFrameState } from './dirty-watcher';
import { UMB_SUBMITTABLE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/workspace';

/**
 * These tests stand in for Umbraco's context API rather than booting it, because what is being
 * checked is a *contract* the watcher relies on and the real thing would hide: that a workspace
 * context can be reached from the frame's document root even though the request event travels the
 * other way. See the design doc §4.
 *
 * The stand-in provider below is deliberately built from the same token the watcher reads, and
 * behaves exactly as `UmbContextProvider` does — listens for `umb:context-request` on its own
 * element, matches on `contextAlias` and `apiAlias`, and announces itself with a bubbling,
 * composed `umb:context-provide`. If core changes that contract, this file is where it shows.
 */

/** The alias/api pair the way `UmbContextProvider` itself splits it out of the token. */
const [CONTEXT_ALIAS, API_ALIAS = 'default'] = UMB_SUBMITTABLE_WORKSPACE_CONTEXT.toString().split('#');

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
 * A stand-in workspace context with the two observables the watcher compares, plus the
 * `requestSubmit` the token's discriminator looks for.
 * @param over Members to add or override — used to drop `data`/`persistedData` for the
 *   nothing-to-lose case.
 * @returns The instance and handles on its two states.
 */
function fakeWorkspace(over: Record<string, unknown> = {}) {
  const persisted = fakeState<unknown>(undefined);
  const current = fakeState<unknown>(undefined);
  const instance = {
    requestSubmit: () => Promise.resolve(),
    data: current.observable,
    persistedData: persisted.observable,
    ...over,
  };
  /** Load the workspace, as core does: both halves set to the same value. */
  const load = (value: unknown) => {
    persisted.set(value);
    current.set(value);
  };
  return { instance, persisted, current, load };
}

/** A stand-in `UmbContextProvider` on an element, optionally nested under shadow roots. */
function mountProvider(instance: unknown, depth = 0) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  // Nest the provider under `depth` shadow boundaries, so a test can prove the watcher reaches a
  // workspace that sits well below the document root — a window hosting a whole section.
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
    if (request.contextAlias !== CONTEXT_ALIAS) return;
    if (request.apiAlias === API_ALIAS && request.callback(instance)) e.stopImmediatePropagation();
  });

  /** Fire an alias-carrying, bubbling, composed event of the given type from the provider. */
  const announce = (type: string, extra: Record<string, unknown> = {}) => {
    const event = new Event(type, { bubbles: true, composed: true });
    Object.assign(event, { contextAlias: CONTEXT_ALIAS }, extra);
    element.dispatchEvent(event);
  };

  return {
    element,
    provide: () => announce('umb:context-provide'),
    unprovide: () => announce('umb:context-unprovided', { instance }),
    dispose: () => host.remove(),
  };
}

/** Everything one test needs torn down, in reverse order, whether it passed or not. */
let teardown: Array<() => void> = [];

afterEach(() => {
  for (const dispose of teardown.reverse()) dispose();
  teardown = [];
});

/**
 * Start a watcher over the test document and collect what it reports.
 * @returns The reported values, in order.
 */
function watch(): boolean[] {
  const reported: boolean[] = [];
  teardown.push(watchWorkspaceDirtyState(document, (state) => reported.push(state.dirty)));
  return reported;
}

/**
 * Start a watcher and collect the whole record rather than only the dirty half.
 *
 * A second helper rather than a change to {@link watch}, so every existing assertion in this file
 * stays exactly as it was: what those tests are about is the dirty answer, and rewriting them to
 * reach through a record would be churn that proves nothing.
 * @returns The reported states, in order.
 */
function watchState(): UmbraDesktopFrameState[] {
  const reported: UmbraDesktopFrameState[] = [];
  teardown.push(watchWorkspaceDirtyState(document, (state) => reported.push(state)));
  return reported;
}

/**
 * A workspace that also publishes an identity, so the watcher can build a subject from it.
 * @param unique The unique to start on.
 * @returns The workspace handles, plus the unique's state so a test can move it.
 */
function fakeSubjectWorkspace(unique = 'a1') {
  const uniqueState = fakeState<string | null | undefined>(unique);
  const workspace = fakeWorkspace({
    unique: uniqueState.observable,
    entityType: fakeState<string | undefined>('document').observable,
    reload: () => Promise.resolve(),
    loadWithoutPersist: () => Promise.resolve({}),
  });
  return { ...workspace, uniqueState };
}

it('reports nothing until a workspace actually becomes dirty', () => {
  const reported = watch();
  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });

  expect(reported, 'opening and loading a window is not an edit').to.deep.equal([]);
});

it('reports dirty once the loaded data is edited, and clean again when it is saved', () => {
  const reported = watch();
  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });

  workspace.current.set({ name: 'Home page' });
  expect(reported, 'typing into the editor marks the window').to.deep.equal([true]);

  // Saving is the persisted half catching up with the current half.
  workspace.persisted.set({ name: 'Home page' });
  expect(reported, 'saving clears the mark').to.deep.equal([true, false]);
});

it('reports each flip once, however many changes arrive', () => {
  const reported = watch();
  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'H' });
  workspace.current.set({ name: 'Ho' });
  workspace.current.set({ name: 'Hom' });

  expect(reported, 'a keystroke in an already-dirty window must not repaint the desktop').to.deep.equal([
    true,
  ]);
});

it('reaches a workspace nested below several shadow roots', () => {
  // The point of the whole provide-event mechanism: a context request travels *up*, so a probe at
  // the document root can never reach a provider nested under it. This is the case that breaks a
  // window hosting a whole section, where the workspace mounts far below the frame root.
  const reported = watch();
  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance, 4);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Edited' });

  expect(reported).to.deep.equal([true]);
});

it('ignores a context that carries no persisted/current pair, so a dashboard never marks', () => {
  // Log Viewer and every dashboard provide no workspace context with data to compare. Nothing is
  // special-cased for them: they simply fall out of the mechanism, quietly and with no errors.
  const reported = watch();
  const bare = { requestSubmit: () => Promise.resolve() };
  const provider = mountProvider(bare);
  teardown.push(provider.dispose);

  provider.provide();

  expect(reported).to.deep.equal([]);
});

it('goes clean when a dirty workspace is unprovided, as navigating away in the window does', () => {
  const reported = watch();
  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Edited' });
  expect(reported).to.deep.equal([true]);

  provider.unprovide();
  expect(reported, 'the workspace that owned the edit is gone').to.deep.equal([true, false]);
});

it('stays dirty while any one of several workspaces is dirty', () => {
  const reported = watch();
  const outer = fakeWorkspace();
  const inner = fakeWorkspace();
  const outerProvider = mountProvider(outer.instance);
  const innerProvider = mountProvider(inner.instance, 2);
  teardown.push(outerProvider.dispose, innerProvider.dispose);

  outerProvider.provide();
  innerProvider.provide();
  outer.load({ a: 1 });
  inner.load({ b: 1 });

  outer.current.set({ a: 2 });
  inner.current.set({ b: 2 });
  expect(reported).to.deep.equal([true]);

  outer.persisted.set({ a: 2 });
  expect(reported, 'the other workspace is still dirty').to.deep.equal([true]);

  inner.persisted.set({ b: 2 });
  expect(reported, 'now nothing is').to.deep.equal([true, false]);
});

it('lets go of every subscription when it is stopped', () => {
  const reported: boolean[] = [];
  const stop = watchWorkspaceDirtyState(document, (state) => reported.push(state.dirty));
  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  expect(workspace.current.subscriberCount, 'the watcher subscribed').to.equal(1);

  stop();

  expect(workspace.current.subscriberCount, 'and unsubscribed').to.equal(0);
  expect(workspace.persisted.subscriberCount).to.equal(0);

  workspace.current.set({ name: 'Edited after stopping' });
  expect(reported, 'a stopped watcher reports nothing').to.deep.equal([]);
});

it('ignores a workspace provided after it was stopped', () => {
  const reported: boolean[] = [];
  const stop = watchWorkspaceDirtyState(document, (state) => reported.push(state.dirty));
  stop();

  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);
  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Edited' });

  expect(reported).to.deep.equal([]);
});

it('reports what a tracked workspace is showing', () => {
  const reported = watchState();
  const workspace = fakeSubjectWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Homepage' });

  const last = reported[reported.length - 1];
  expect(last.dirty).to.equal(true);
  expect(last.subjects.map((s) => `${s.entityType}:${s.unique}`)).to.deep.equal(['document:a1']);
});

it('gives a subject live access to both sides of the comparison', () => {
  // Getters rather than a snapshot, because the router reads them after an await: the editor has
  // been typing while the fetch was in flight, and the verdict is about the pair in force when the
  // answer arrived.
  const reported = watchState();
  const workspace = fakeSubjectWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Homepage' });

  const subject = reported[reported.length - 1].subjects[0];
  expect(subject.getPersistedData()).to.deep.equal({ name: 'Home' });
  expect(subject.getData()).to.deep.equal({ name: 'Homepage' });
  workspace.current.set({ name: 'Home page' });
  expect(subject.getData()).to.deep.equal({ name: 'Home page' });
});

it('reports a new subject when the window navigates to another document', () => {
  // What makes opening a second document in the same window work with no extra machinery: the
  // dirty answer has not moved, and what an event should match has.
  const reported = watchState();
  const workspace = fakeSubjectWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.uniqueState.set('b2');

  expect(reported[reported.length - 1].subjects[0].unique).to.equal('b2');
});

it('reports no subject for a workspace that publishes no identity', () => {
  // Design R3: not an exception to handle, simply not a match.
  const reported = watchState();
  const workspace = fakeWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Homepage' });

  expect(reported[reported.length - 1].subjects).to.deep.equal([]);
});

it('still does not report again for a keystroke that changes nothing about the answer', () => {
  const reported = watchState();
  const workspace = fakeSubjectWorkspace();
  const provider = mountProvider(workspace.instance);
  teardown.push(provider.dispose);

  provider.provide();
  workspace.load({ name: 'Home' });
  workspace.current.set({ name: 'Homepage' });
  const afterFirstEdit = reported.length;
  workspace.current.set({ name: 'Homepag' });
  workspace.current.set({ name: 'Homepa' });

  expect(reported.length, 'a keystroke in an already-dirty window repaints the whole desktop').to.equal(
    afterFirstEdit,
  );
});
