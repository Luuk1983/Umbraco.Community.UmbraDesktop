import { aTimeout, expect, fixture, html } from '@open-wc/testing';
import './app-host.element.js';
import { UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS } from '../constants.js';
import type { ElementLoaderProperty } from '@umbraco-cms/backoffice/extension-api';
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
 * Where the test runner really serves {@link './app-host.string-loader-app.ts'} from.
 *
 * Derived from `import.meta.url` rather than typed as a literal, so it stays correct whatever the
 * runner mounts its root at, and so moving either file cannot leave a path string behind that is
 * wrong in a way only a 404 would tell you about. `pathname` because a manifest's string form is a
 * server-absolute path (`/App_Plugins/pkg/game.js`), which is what this stands in for.
 */
const STRING_LOADER_APP_PATH = new URL('./app-host.string-loader-app.ts', import.meta.url).pathname;

/**
 * A loader in the canonical module shape, for the cases where the loader is only the vehicle and
 * not the subject.
 *
 * `{ element }` rather than a bare constructor because that is the shape Umbraco's own resolver
 * looks for, so these cases stay inside the published contract and the compiler keeps checking
 * them. The bare-constructor shape is this host's own leniency and is exercised by exactly the one
 * case that is about it, through {@link outsideTheContract}.
 * @param ctor The app element the module publishes.
 * @returns A loader resolving to a module exporting it.
 */
const moduleLoader = (ctor: CustomElementConstructor) => async () => ({ element: ctor });

/**
 * Widen a deliberately out-of-contract loader to the property type, for the failure cases.
 *
 * `ElementLoaderProperty` cannot describe a loader that resolves to a bare constructor, to nothing,
 * or to an object with no constructor in it, which is the whole point of the three cases using
 * this: they are what a package author writes by accident, and the host has to survive them anyway.
 * A cast here keeps every *other* case in this file type-checked against Umbraco's real type
 * instead of loosening the property to make the mistakes expressible.
 * @param load The loader, resolving to whatever it resolves to.
 * @returns The same function, typed as the manifest property it stands in for.
 */
const outsideTheContract = (load: () => Promise<unknown>) => load as ElementLoaderProperty;

/**
 * Mount a host and give it a loader, settling both the render and the load.
 * @param load The `element` value to assign, exactly as the window assigns the manifest's: any form
 * of Umbraco's `ElementLoaderProperty`, not only a loader function.
 * @param alias The app's manifest alias, assigned before the loader as the window's own template
 * assigns it. Omitted where the diagnostic is not the subject, which is also the case that proves
 * the host survives an alias nobody set.
 * @returns The host, with its first load attempt finished and reflected in the DOM.
 */
async function hostWith(load: ElementLoaderProperty, alias?: string): Promise<UmbraDesktopAppHostElement> {
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  if (alias !== undefined) host.alias = alias;
  host.load = load;
  await host.mountComplete;
  return host;
}

/**
 * Run a body with `console.error` captured, so the load-failure diagnostic can be asserted on
 * rather than trusted.
 *
 * The real function is put back whatever happens: a swallowed `console.error` would silence every
 * later failure in this file, which is the kind of test-harness bug that costs an afternoon.
 * @param run The body, expected to trigger one or more load failures.
 * @returns The first argument of every `console.error` the body produced, in order.
 */
async function capturedErrors(run: () => Promise<unknown>): Promise<string[]> {
  const messages: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => messages.push(String(args[0]));
  try {
    await run();
  } finally {
    console.error = realError;
  }
  return messages;
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
  host.load = moduleLoader(TestAppElement);
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
 * A **module path string**, which is the only form of `element` a static `umbraco-package.json` can
 * express and therefore the form the packages this feature exists for will actually ship. It was
 * dropped silently for a while: the pipeline guarded on `typeof element === 'function'`, so a path
 * produced no tile and no signal. This is the case that stops that returning, and it is a real
 * import of a real file (see `app-host.string-loader-app.ts`) rather than a stubbed resolver,
 * because what has to be proven is Umbraco's behaviour and not our restatement of it.
 */
it('mounts an app whose element is a module path string', async () => {
  const host = await hostWith(STRING_LOADER_APP_PATH);
  expect(host.querySelector('umbradesktop-test-string-app')).to.not.be.null;
});

/**
 * A **class constructor**, the other legal form the old pipeline mishandled, and worse than the
 * string: `typeof` said `'function'`, so it passed the guard, was treated as a loader and called,
 * and the user got a permanent "could not be loaded" out of a `TypeError: Class constructor cannot
 * be invoked without 'new'`. Umbraco's resolver tells the two apart by looking for a `prototype`,
 * which is exactly why resolution is delegated to it rather than re-derived here.
 */
it('mounts an app whose element is the constructor itself', async () => {
  const host = await hostWith(TestAppElement);
  expect(host.querySelector('umbradesktop-test-app')).to.not.be.null;
});

/**
 * A manifest's `element` is typed loosely enough to hand over the constructor itself rather than a
 * module, so this host accepts that shape too. It is deliberately **more lenient** than Umbraco's
 * own `loadManifestElement`, which resolves only `{ element }` or `{ default }` and yields
 * `undefined` for a loader landing on a bare constructor: the cost of accepting one more shape is a
 * line, and the cost of rejecting it is a package author's app silently failing to mount.
 *
 * Read this together with the case above it, because the two look alike and are not: there, the
 * manifest *is* the constructor and Umbraco handles it; here, a loader function *resolves* to one,
 * which Umbraco declines and the host picks up afterwards. This is the assertion holding that
 * leniency in place now that the resolution itself is Umbraco's.
 */
it('mounts a loader that resolves to a bare constructor', async () => {
  const host = await hostWith(outsideTheContract(async () => TestAppElement));
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
  const host = await hostWith(outsideTheContract(async () => ({ notAnElement: 42 })));
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * A loader written as a **plain `function`**, which is the one shape of a correct manifest that
 * Umbraco's resolver gets wrong, and it gets it wrong silently.
 *
 * `loadManifestElement` tells a loader from a constructor by testing for `prototype` (see
 * `isElementLoaderFunction`, which copies that test deliberately). A `function` expression has one;
 * an arrow and an `async` function do not. So this loader is classified as the app's constructor,
 * `new` on it returns the promise the function returns, and Lit is handed a Promise where an
 * element should be. What the author saw before this case existed was a window containing the text
 * `[object Promise]`, with nothing in the console, for a loader that is legal JavaScript and
 * indistinguishable from the arrow form at a glance.
 *
 * The trap is Umbraco-wide rather than ours and cannot be fixed from here, so it is *contained*
 * here: whatever comes out of the constructor is checked for actually being an element, and
 * anything else reaches the same message a missing bundle does. Written with the deliberately
 * non-arrow syntax rather than a cast, because the syntax **is** the subject.
 */
it('reports a loader written as a plain function rather than mounting a Promise', async () => {
  const host = await hostWith(function () {
    return Promise.resolve({ element: TestAppElement });
  } as unknown as ElementLoaderProperty);
  expect(host.querySelector('umbradesktop-test-app'), 'nothing should have mounted').to.be.null;
  expect(host.textContent).to.contain('could not be loaded');
  // The symptom this closes: the Promise stringified into the body.
  expect(host.textContent, 'a Promise must never reach the body').to.not.contain('[object Promise]');
});

/**
 * The same containment from the other side: an `element` that is a class but not an element class.
 * `loadManifestElement` returns any constructor it is handed without checking what it constructs,
 * so a package pointing at (say) its API class instead of its element used to render that object as
 * text too.
 */
it('reports an element that constructs something which is not an element', async () => {
  class NotAnElement {}
  const host = await hostWith(NotAnElement as unknown as ElementLoaderProperty);
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * A loader that resolves to nothing at all: `async () => { import('…') }`, with the return
 * forgotten. Cheap to write and it must read as the same failure, not as a blank window.
 */
it('reports a loader that resolves to nothing', async () => {
  const host = await hostWith(outsideTheContract(async () => undefined));
  expect(host.textContent).to.contain('could not be loaded');
});

/**
 * A loader is a dynamic import, so the window body is empty for a network hop before the app
 * arrives. The iframe path covers that gap with a `uui-loader`, and an element app has no reason
 * to be the one window kind that shows nothing while it loads.
 */
it('shows a pending state while the loader is in flight', async () => {
  let land: (value: { element: CustomElementConstructor }) => void = () => {};
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = () => new Promise((resolve) => (land = resolve));
  await host.updateComplete;
  expect(host.querySelector('uui-loader'), 'the gap before the app arrives should be covered').to.not.be.null;
  land({ element: TestAppElement });
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
    hostWith(() => new Promise((resolve) => window.setTimeout(() => resolve({ element: TestAppElement }), 60))),
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
  const host = await hostWith(moduleLoader(TestAppElement));
  host.load = moduleLoader(OtherTestAppElement);
  await host.mountComplete;
  expect(host.querySelector('umbradesktop-test-app-two')).to.not.be.null;
  expect(host.querySelector('umbradesktop-test-app')).to.be.null;
});

/** A failed load must not leave the previous app's element stranded under the error message. */
it('clears the mounted element when a later load fails', async () => {
  const host = await hostWith(moduleLoader(TestAppElement));
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
  host.load = () => new Promise((resolve) => window.setTimeout(() => resolve({ element: TestAppElement }), 60));
  // Lit batches property writes, so the first load has to actually start before the second lands.
  await host.updateComplete;
  host.load = moduleLoader(OtherTestAppElement);
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
  const host = await hostWith(moduleLoader(TestAppElement));
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
  const host = await hostWith(moduleLoader(TestAppElement));
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
  const host = await hostWith(moduleLoader(TestAppElement));
  lifecycle.length = 0;
  host.load = moduleLoader(OtherTestAppElement);
  await host.mountComplete;
  expect(lifecycle).to.deep.equal(['disconnect:one', 'connect:two']);
});

/** The alias used wherever the diagnostic is the subject, so the assertions read as one thing. */
const BROKEN_APP_ALIAS = 'Pkg.Minesweeper';

/**
 * The error explains *why* a load failed; only the alias says *which* app it was. With two element
 * apps installed the console line was previously unattributable, so the first thing anyone had to do
 * with it was work out which package it was about.
 */
it('names the app in the load-failure diagnostic', async () => {
  const errors = await capturedErrors(() =>
    hostWith(async () => {
      throw new Error('bundle missing');
    }, BROKEN_APP_ALIAS),
  );
  expect(errors, 'one line, not none and not two').to.have.lengthOf(1);
  expect(errors[0], 'the desktop prefix keeps it findable').to.contain('[UmbraDesktop]');
  expect(errors[0], 'and the alias says which app').to.contain(`"${BROKEN_APP_ALIAS}"`);
});

/**
 * Every way a load can fail, because a diagnostic that names the app on one path and not the others
 * is worse than none: it teaches the reader that an unattributed line means "not one of those".
 * All four paths funnel into the single `console.error` in `#mount`'s catch, which is why one
 * message serves them; this is the case that fails if a path ever grows a log of its own.
 */
it('names the app on every load-failure path', async () => {
  const failures: Array<{ what: string; mount: () => Promise<unknown> }> = [
    {
      what: 'a loader that throws',
      mount: () =>
        hostWith(async () => {
          throw new Error('bundle missing');
        }, BROKEN_APP_ALIAS),
    },
    {
      what: 'a loader that resolves to nothing',
      mount: () => hostWith(outsideTheContract(async () => undefined), BROKEN_APP_ALIAS),
    },
    {
      what: 'an element that constructs something else',
      mount: () => hostWith(class NotAnElement {} as unknown as ElementLoaderProperty, BROKEN_APP_ALIAS),
    },
    {
      what: 'a loader that never settles',
      mount: () => withCollapsedLoadTimeout(() => hostWith(() => new Promise<never>(() => {}), BROKEN_APP_ALIAS)),
    },
  ];
  for (const { what, mount } of failures) {
    const errors = await capturedErrors(mount);
    expect(errors, `${what} should log exactly one line`).to.have.lengthOf(1);
    expect(errors[0], `${what} should name the app`).to.contain(`"${BROKEN_APP_ALIAS}"`);
  }
});

/**
 * The alias is a diagnostic input and must stay one.
 *
 * The host remounts when `load` changes, and a second input that participated in mounting would be
 * a way to throw away a running app for no reason at all: a re-render that happened to re-set the
 * alias would restart a game mid-board. So the alias is deliberately **not** a reactive property,
 * which this pins from both ends: assigning it schedules no update at all, and the app that was
 * mounted is still the same instance with no teardown in its log.
 */
it('cannot remount a live app by setting or changing the alias', async () => {
  const host = await hostWith(moduleLoader(TestAppElement), 'Pkg.First');
  const app = host.querySelector('umbradesktop-test-app');
  // Without this the identity check below would pass on two nulls.
  expect(app, 'the app should have mounted before the alias moves').to.not.be.null;
  lifecycle.length = 0;
  host.alias = 'Pkg.Second';
  expect(host.isUpdatePending, 'the alias must not be a reactive input at all').to.be.false;
  await host.mountComplete;
  expect(host.querySelector('umbradesktop-test-app'), 'the same instance must still be mounted').to.equal(app);
  expect(lifecycle, 'and it must not have been torn down and rebuilt').to.deep.equal([]);
});
