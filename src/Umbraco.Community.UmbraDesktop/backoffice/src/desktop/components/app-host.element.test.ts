import { expect, fixture, html } from '@open-wc/testing';
import './app-host.element.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';

/** A trivial app element, standing in for a game. */
class TestAppElement extends HTMLElement {
  connectedCallback() {
    this.textContent = 'app ready';
  }
}
customElements.define('umbradesktop-test-app', TestAppElement);

/**
 * A second app element, so "replaced" can be told from "appended beside": two different tags make
 * the difference observable in the DOM rather than only in a node count.
 */
class OtherTestAppElement extends HTMLElement {
  connectedCallback() {
    this.textContent = 'other app ready';
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
  await host.updateComplete;
  await host.mounted;
  return host;
}

it('mounts the element the manifest loader resolves to', async () => {
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = async () => ({ element: TestAppElement });
  await host.updateComplete;
  await host.mounted;
  expect(host.querySelector('umbradesktop-test-app')).to.not.be.null;
});

it('reports a loader that throws rather than leaving an empty body', async () => {
  const host = await fixture<UmbraDesktopAppHostElement>(html`<umbradesktop-app-host></umbradesktop-app-host>`);
  host.load = async () => {
    throw new Error('bundle missing');
  };
  await host.updateComplete;
  await host.mounted;
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
  // A gradient, because that is the case `background-color` silently drops and two shipped themes
  // paint the app surface with one.
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
  await host.updateComplete;
  await host.mounted;
  expect(host.querySelector('umbradesktop-test-app-two')).to.not.be.null;
  expect(host.querySelector('umbradesktop-test-app')).to.be.null;
});

/** A failed load must not leave the previous app's element stranded under the error message. */
it('clears the mounted element when a later load fails', async () => {
  const host = await hostWith(async () => TestAppElement);
  host.load = async () => {
    throw new Error('bundle missing');
  };
  await host.updateComplete;
  await host.mounted;
  expect(host.querySelector('umbradesktop-test-app')).to.be.null;
  expect(host.textContent).to.contain('could not be loaded');
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
