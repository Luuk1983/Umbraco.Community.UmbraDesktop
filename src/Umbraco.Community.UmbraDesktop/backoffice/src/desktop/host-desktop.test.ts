import { expect } from '@open-wc/testing';
import { findHostDesktopContext } from './host-desktop';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from './window-manager.context-token';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from './app-catalogue.context-token';

/**
 * These tests build a real same-origin iframe and a stand-in context provider above it, because
 * what is being checked is a *contract* that no unit-level fake could establish: that code running
 * inside a window's frame can reach the window manager the desktop provides in the outer document.
 *
 * It is the mirror image of `dirty-watcher.test.ts`, and the direction is the whole point. The
 * dirty watcher reaches *into* a frame, and had to listen for `umb:context-provide` because a
 * context request travels up and away from the workspaces it wanted. Reaching *out* of a frame is
 * the case where travelling up is exactly right: the frame's own `<iframe>` element sits inside the
 * desktop's tree, so a request dispatched from there rises through the window element to the
 * desktop and finds the provider on the way.
 *
 * The provider below behaves as `UmbContextProvider` does: it listens for `umb:context-request` on
 * its own element and matches on `contextAlias` plus `apiAlias`, without ever checking the event's
 * class. If core changes that contract, this file is where it shows.
 */

/**
 * The alias/api pair the way `UmbContextProvider` itself splits it out of a token.
 * @param token The context token.
 * @returns The context alias and the api alias.
 */
const aliasesOf = (token: { toString(): string }) => {
  const [contextAlias, apiAlias = 'default'] = token.toString().split('#');
  return { contextAlias, apiAlias };
};

/** The window manager's pair, which most cases here are about. */
const { contextAlias: CONTEXT_ALIAS, apiAlias: API_ALIAS } = aliasesOf(
  UMBRADESKTOP_WINDOW_MANAGER_CONTEXT,
);

/** Everything one test built, torn down in reverse order whether it passed or not. */
let teardown: Array<() => void> = [];

afterEach(() => {
  for (const dispose of teardown.reverse()) dispose();
  teardown = [];
});

/**
 * Build the DOM a window's frame really sits in, and hand back the frame's own `Window`.
 *
 * The nesting is not decoration: the desktop provides its context from its own element, the window
 * element renders the `<iframe>` inside its shadow root, and the desktop renders window elements
 * inside *its* shadow root. So a request leaving the frame crosses two shadow boundaries before it
 * reaches the provider, and a version of this that dispatched a non-composed event would pass a
 * flat test and fail on the real desktop.
 * @param options.provide The instance the stand-in provider should answer with, or undefined to
 *   mount no provider at all — a backoffice iframe that is not on a desktop.
 * @param options.alias The context alias the provider answers for. Defaults to the window
 *   manager's, so a test can prove a foreign provider is not mistaken for one.
 * @returns The frame's `Window`, once its document has loaded.
 */
async function mountFrame(options: {
  provide?: unknown;
  alias?: string;
}): Promise<Window> {
  const desktop = document.createElement('div');
  document.body.appendChild(desktop);
  teardown.push(() => desktop.remove());

  if (options.provide !== undefined) {
    const alias = options.alias ?? CONTEXT_ALIAS;
    desktop.addEventListener('umb:context-request', (e: Event) => {
      const request = e as Event & {
        contextAlias: string;
        apiAlias: string;
        callback: (instance: unknown) => boolean;
      };
      if (request.contextAlias !== alias) return;
      if (request.apiAlias === API_ALIAS && request.callback(options.provide)) {
        e.stopImmediatePropagation();
      }
    });
  }

  const desktopRoot = desktop.attachShadow({ mode: 'open' });
  const windowEl = document.createElement('div');
  desktopRoot.appendChild(windowEl);
  const windowRoot = windowEl.attachShadow({ mode: 'open' });

  const iframe = document.createElement('iframe');
  // `srcdoc` rather than a URL: it inherits this document's origin, which is what makes
  // `frameElement` readable and the whole bridge legal, and it needs no server.
  iframe.srcdoc = '<!doctype html><title>frame</title>';
  const loaded = new Promise<void>((resolve) =>
    iframe.addEventListener('load', () => resolve(), { once: true }),
  );
  windowRoot.appendChild(iframe);
  await loaded;

  const view = iframe.contentWindow;
  expect(view, 'the test needs a reachable frame realm to be about anything').to.not.equal(null);
  return view!;
}

it('finds the window manager from inside a window frame, across both shadow boundaries', async () => {
  const manager = { marker: 'the desktop that hosts this frame' };
  const view = await mountFrame({ provide: manager });

  expect(
    findHostDesktopContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, view),
    'the frame must reach the manager, or the desk tools have nothing to talk to',
  ).to.equal(manager);
});

it('finds nothing in a frame that is not on a desktop', async () => {
  // A backoffice iframe with no desktop above it. There is no such thing today, but "no provider
  // answered" is also what a desktop that has not finished mounting looks like, and the answer has
  // to be the same: nothing, quietly.
  const view = await mountFrame({});

  expect(findHostDesktopContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, view), 'no provider answered, so there is no desktop').to.equal(undefined);
});

it('is not fooled by a provider for some other context', async () => {
  // The desktop's document is full of providers, and the frame's request passes every one of them
  // on its way up. Matching on the alias is the only thing that makes the answer the right object.
  const view = await mountFrame({ provide: { marker: 'not the manager' }, alias: 'SomeOtherContext' });

  expect(findHostDesktopContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, view), 'a foreign context is not a desktop').to.equal(undefined);
});

it('finds nothing in a document that is not framed at all', async () => {
  // The plain backoffice, where the desk tools still resolve because Umbraco has no per-surface
  // conditions for frontend tools yet. This is the case that has to stay quiet rather than throw.
  //
  // A stub rather than this test document, deliberately: whether the test runner itself frames the
  // page is its business and not a fact worth asserting on.
  const unframed = { frameElement: null } as unknown as Window;

  expect(findHostDesktopContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, unframed), 'nothing to reach out of').to.equal(undefined);
});

it('resolves whichever context it is asked for, not just the window manager', async () => {
  // The desk tools need two of the desktop's contexts: the window manager for what is open, and the
  // app catalogue for what could be. One bridge asked for a token beats two near-identical bridges,
  // and this is the case that proves the alias is read from the token rather than baked in.
  const catalogue = { marker: 'the app catalogue' };
  const view = await mountFrame({
    provide: catalogue,
    alias: aliasesOf(UMBRADESKTOP_APP_CATALOGUE_CONTEXT).contextAlias,
  });

  expect(findHostDesktopContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, view)).to.equal(catalogue);
  expect(
    findHostDesktopContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, view),
    'and a provider for one context does not answer for another',
  ).to.equal(undefined);
});
