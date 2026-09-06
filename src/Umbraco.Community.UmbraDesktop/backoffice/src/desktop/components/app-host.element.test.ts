import { aTimeout, expect, fixture, html } from '@open-wc/testing';
import './app-host.element.js';
import { UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS } from '../constants.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';

/**
 * Lifecycle log for the teardown cases. The guarantee an app author builds on is that the browser's
 * own `disconnectedCallback` fires when the host goes away or the app is replaced, which is the
 * only signal a game has to cancel its `requestAnimationFrame`, so it has to be observed rather
 * than assumed: a later move to shadow DOM, or back to appending children by hand, could break it
 * while every other case here stayed green.
 */
const lifecycle: string[] = [];

/** A trivial app element, standing in for a game. */
class TestAppElement extends HTMLElement {
  /** Marks itself mounted, both visibly and in {@link lifecycle}. */
  connectedCallback() {
    this.textContent = 'app ready';
    lifecycle.push('connect:one');
  }

  /** Records the teardown signal a game would cancel its animation frame in. */
  disconnectedCallback() {
    lifecycle.push('disconnect:one');
  }
}
customElements.define('umbradesktop-test-app', TestAppElement);

/**
 * A second app element, so "replaced" can be told from "appended beside": two different tags make
 * the difference observable in the DOM rather than only in a node count.
 */
class OtherTestAppElement extends HTMLElement {
  /** As {@link TestAppElement.connectedCallback}, under its own name in the log. */
  connectedCallback() {
    this.textContent = 'other app ready';
    lifecycle.push('connect:two');
  }

  /** As {@link TestAppElement.disconnectedCallback}, under its own name in the log. */
  disconnectedCallback() {
    lifecycle.push('disconnect:two');
  }
}
customElements.define('umbradesktop-test-app-two', OtherTestAppElement);

/**
 * Mount a host and give it a loader, settling both the render and the load.
 * @param load The loader to assign, exactly as the window will assign the manifest's.
 * @returns The host, with its first load attempt finished and reflected in the DOM.
 */
async function hostWith(load: () => Promise<unknown>): Promise<UmbraDesktopAppHostElement> {
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = load;
  await host.mountComplete;
  return host;
}

it('mounts the element the manifest loader resolves to', async () => {
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = async () => ({ element: TestAppElement });
  await host.mountComplete;
  expect(host.querySelector('umbradesktop-test-app')).to.not.be.null;
});

/**
 * `mountComplete` is the whole seam a consumer has, so the obvious call has to be the correct one:
 * assign the loader, await the promise, read the DOM. It used to be a plain field reassigned in
 * `willUpdate`, which made this exact sequence resolve against an empty body unless the caller
 * knew to `await updateComplete` first. This case exists to keep that trap unreachable rather than
 * merely documented.
 */
it('settles mountComplete against the DOM without an updateComplete first', async () => {
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = async () => TestAppElement;
  await host.mountComplete;
  expect(host.children.length, 'the body should not still be empty').to.be.greaterThan(0);
  expect(host.querySelector('umbradesktop-test-app')).to.not.be.null;
});

it('reports a loader that throws rather than leaving an empty body', async () => {
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = async () => {
    throw new Error('bundle missing');
  };
  await host.mountComplete;
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * A manifest's `element` is typed loosely enough to hand over the constructor itself rather than a
 * module, so this host accepts that shape too. It is deliberately **more lenient** than Umbraco's
 * own `loadManifestElement`, which resolves only `{ element }` or `{ default }` and yields
 * `undefined` for a bare constructor: the cost of accepting one more shape is a line, and the cost
 * of rejecting it is a package author's app silently failing to mount.
 */
it('mounts a loader that resolves to a bare constructor', async () => {
  const host = await hostWith(async () => TestAppElement);
  expect(host.querySelector('umbradesktop-test-app')).to.not.be.null;
});

/** A module's `default` export is the other half of the module shape Umbraco accepts. */
it('mounts a loader that resolves to a module default export', async () => {
  const host = await hostWith(async () => ({ default: TestAppElement }));
  expect(host.querySelector('umbradesktop-test-app')).to.not.be.null;
});

/**
 * A loader that resolves to something with no constructor in it is a package bug, and it must read
 * as the same visible failure as a bundle that would not load: silently rendering nothing would
 * leave the user with an empty window and no clue.
 */
it('reports a loader that resolves to no element constructor', async () => {
  const host = await hostWith(async () => ({ notAnElement: 42 }));
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * A loader that resolves to nothing at all: `async () => { import('…') }`, with the return
 * forgotten. Cheap to write and it must read as the same failure, not as a blank window.
 */
it('reports a loader that resolves to nothing', async () => {
  const host = await hostWith(async () => undefined);
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * A loader is a dynamic import, so the window body is empty for a network hop before the app
 * arrives. The iframe path covers that gap with a `uui-loader`, and an element app has no reason
 * to be the one window kind that shows nothing while it loads.
 */
it('shows a pending state while the loader is in flight', async () => {
  let land: (value: unknown) => void = () => {};
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = () => new Promise((resolve) => (land = resolve));
  await host.updateComplete;
  expect(host.querySelector('uui-loader'), 'the gap before the app arrives should be covered').to.not.be.null;
  land(TestAppElement);
  await host.mountComplete;
  expect(host.querySelector('uui-loader'), 'and uncovered once it has').to.be.null;
  expect(host.querySelector('umbradesktop-test-app')).to.not.be.null;
});

/**
 * Run a body with the host's load timeout collapsed to nothing, since the runner's own per-test
 * limit is well under {@link UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS} and the alternative is waiting
 * twelve seconds.
 *
 * Rewrites only calls whose delay is exactly that constant, which leaves Lit's own timers alone
 * and doubles as an assertion that the host schedules the documented constant rather than a
 * literal of its own. It matches on the *value*, so it would collapse anything else scheduling the
 * same twelve seconds in a page that had one: `window.element.ts`'s iframe safety net is the other
 * reader of this constant, and no test here mounts a window, but a future one should re-read this.
 * @param run The body, taking nothing and returning whatever it asserts on.
 * @returns Whatever `run` resolved to, once the real `setTimeout` is back in place.
 */
async function withCollapsedLoadTimeout<T>(run: () => Promise<T>): Promise<T> {
  const realSetTimeout = window.setTimeout;
  let scheduled = false;
  window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS) {
      scheduled = true;
      delay = 0;
    }
    return realSetTimeout.call(window, handler, delay, ...args);
  }) as typeof window.setTimeout;
  try {
    const result = await run();
    expect(scheduled, 'the host should schedule the shared body-load timeout, not a number of its own').to.be.true;
    return result;
  } finally {
    window.setTimeout = realSetTimeout;
  }
}

/**
 * A loader that never settles is the failure with no other surface at all: no throw to catch, no
 * console line, just a window the user opened and a body that stays empty forever. It has to end
 * in the same message as a missing bundle.
 */
it('reports a loader that never settles', async () => {
  const host = await withCollapsedLoadTimeout(() => hostWith(() => new Promise<never>(() => {})));
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * And having lost that race, the loader must not come back and paint over the message: an app
 * appearing a minute after the user was told it was broken is worse than either outcome alone.
 */
it('keeps the timeout message when the slow loader lands afterwards', async () => {
  const host = await withCollapsedLoadTimeout(() =>
    hostWith(() => new Promise((resolve) => window.setTimeout(() => resolve(TestAppElement), 60))),
  );
  expect(host.textContent).to.contain('could not be loaded');
  await aTimeout(120);
  expect(host.querySelector('umbradesktop-test-app'), 'the late loader must not mount').to.be.null;
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * The message stands where the app would, so it takes the theme's app surface/text pair. A
 * light-DOM element has no shadow root for `static styles`, and an unstyled paragraph would be
 * default-coloured text on a themed ground, which is invisible on a dark theme.
 */
it('paints the failure message with the app tokens', async () => {
  const host = await hostWith(async () => {
    throw new Error('bundle missing');
  });
  const message = host.querySelector('p');
  expect(message, 'the failure message should be its own element').to.not.be.null;
  // What a theme does: set the pair on the host and see them arrive on the message.
  host.style.setProperty('--umbradesktop-app-text', 'rgb(1, 2, 3)');
  // A gradient, because that is the case `background-color` silently drops. No shipped theme sets
  // a gradient app surface today, but four of the five use gradients elsewhere in their chrome, so
  // the contract in `theme/types.ts` allows one here and this pins that the host honours it.
  host.style.setProperty('--umbradesktop-app-surface', 'linear-gradient(rgb(4, 5, 6), rgb(7, 8, 9))');
  const painted = getComputedStyle(message!);
  expect(painted.color).to.equal('rgb(1, 2, 3)');
  expect(painted.backgroundImage).to.contain('linear-gradient');
});

/**
 * The window reuses one host across its lifetime, so a second app must take the first one's place.
 * Appending beside it would leave two games running in one window, the earlier one still ticking
 * behind the later.
 */
it('replaces the mounted element when the loader is re-assigned', async () => {
  const host = await hostWith(async () => TestAppElement);
  host.load = async () => OtherTestAppElement;
  await host.mountComplete;
  expect(host.querySelector('umbradesktop-test-app-two')).to.not.be.null;
  expect(host.querySelector('umbradesktop-test-app')).to.be.null;
});

/** A failed load must not leave the previous app's element stranded under the error message. */
it('clears the mounted element when a later load fails', async () => {
  const host = await hostWith(async () => TestAppElement);
  host.load = async () => {
    throw new Error('bundle missing');
  };
  await host.mountComplete;
  expect(host.querySelector('umbradesktop-test-app')).to.be.null;
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * Two loads in flight at once, the first slower than the second. Not reachable through the
 * window's own use, which captures the app object at `open()` and so keeps a loader's identity
 * stable for the window's life, but `load` is a public property on a shipped element and the
 * invariant that makes it safe lives in another file and is unasserted. The loser must commit
 * nothing at all: not its element, and not a failure either.
 */
it('ignores a loader that is superseded before it resolves', async () => {
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = () => new Promise((resolve) => window.setTimeout(() => resolve(TestAppElement), 60));
  // Lit batches property writes, so the first load has to actually start before the second lands.
  await host.updateComplete;
  host.load = async () => OtherTestAppElement;
  await host.mountComplete;
  expect(host.querySelector('umbradesktop-test-app-two'), 'the winner should be mounted').to.not.be.null;
  await aTimeout(120);
  expect(host.querySelector('umbradesktop-test-app-two'), 'and the late loser must not replace it').to.not.be.null;
  expect(host.querySelector('umbradesktop-test-app')).to.be.null;
});

/**
 * The host renders into its light DOM, which is the same node the app's element lives in, so Lit's
 * own rendering and the mounted app are competing for one set of children. A re-render that has
 * nothing to do with `load` must leave the app not merely present but the *same instance*: a game
 * that is torn down and reconstructed has silently lost its board.
 */
it('leaves the mounted app in place across an unrelated re-render', async () => {
  const host = await hostWith(async () => TestAppElement);
  const app = host.querySelector('umbradesktop-test-app');
  // Without this the identity check below would pass on two nulls.
  expect(app, 'the app should have mounted before the re-render').to.not.be.null;
  host.requestUpdate();
  await host.updateComplete;
  expect(host.querySelector('umbradesktop-test-app')).to.equal(app);
});

/** And the error message must survive the same, for the same reason. */
it('leaves the failure message in place across an unrelated re-render', async () => {
  const host = await hostWith(async () => {
    throw new Error('bundle missing');
  });
  host.requestUpdate();
  await host.updateComplete;
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * Closing a window removes the host, and the app's own `disconnectedCallback` is the only teardown
 * signal it gets. Exactly once, too: a game that stops its loop on the first and starts it again
 * on a second connect would leave a closed window's animation frame running.
 */
it('disconnects the mounted app exactly once when the host is removed', async () => {
  const host = await hostWith(async () => TestAppElement);
  lifecycle.length = 0;
  host.remove();
  expect(lifecycle).to.deep.equal(['disconnect:one']);
});

/**
 * And a reload, which reassigns `load`, must tear the old app down *before* the new one comes up.
 * The other order would have both alive at once, which is how two games end up sharing one
 * window's keyboard.
 */
it('disconnects the old app before connecting its replacement', async () => {
  const host = await hostWith(async () => TestAppElement);
  lifecycle.length = 0;
  host.load = async () => OtherTestAppElement;
  await host.mountComplete;
  expect(lifecycle).to.deep.equal(['disconnect:one', 'connect:two']);
});
