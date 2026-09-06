import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';
import type { UmbraDesktopApp, UmbraDesktopAppContent, UmbraDesktopWindow } from '../types.js';

/**
 * A window body is one of two things and never both, so the negatives here carry more weight than
 * the positives. An element window that also rendered an iframe would boot a second backoffice
 * nobody asked for; an element window that reached the iframe machinery would have
 * `injectChromeStyles` poll a game for ten seconds looking for a header it does not have. Both
 * failures are invisible in a screenshot of a working game, which is why the absence of the other
 * kind is asserted rather than assumed from the presence of the right one.
 *
 * The overlay is the exception and gets asserted in both directions, because it is the one piece of
 * shared state where the *iframe* side is the one that breaks: a guard dropped from `willUpdate`
 * clears it for every window, and only a positive assertion on an iframe body catches that.
 */

/** A trivial app element, standing in for a game. */
class BodyTestAppElement extends HTMLElement {
  /** Marks itself mounted so "a fresh instance" is observable in the DOM, not just in a count. */
  connectedCallback() {
    this.textContent = 'app ready';
  }
}
customElements.define('umbradesktop-window-body-test-app', BodyTestAppElement);

/** How many times the element loader has been called, so reload can be told from a re-render. */
let loads = 0;

/**
 * The manifest-style loader an element app's `content` carries.
 *
 * Resolves to `{ element }`, the module shape Umbraco's own resolver looks for, because `content`
 * is typed as Umbraco's `ElementLoaderProperty` and a loader resolving to a bare constructor is
 * outside it. The host accepts that shape too, as a deliberate leniency, but this file is about
 * which body a window renders and has no business testing that: `app-host.element.test.ts` owns it.
 */
const loadTestApp = async () => {
  loads += 1;
  return { element: BodyTestAppElement };
};

/**
 * Build the app record for a window body of the given kind.
 * @param content What the body should be.
 * @returns An app with nothing set beyond what rendering a window needs.
 */
function app(content: UmbraDesktopAppContent): UmbraDesktopApp {
  return {
    alias: 'window-body-probe',
    name: 'Probe',
    icon: 'icon-umbraco',
    content,
    // Meaningless on the element path and never read there, but the field is required for the
    // iframe path, where a wrong value is a real bug. `bare` is what an element app gets in the
    // catalogue too.
    chromeProfile: 'bare',
  };
}

/**
 * Mount a window with the given body and settle its first render.
 *
 * Appended by hand rather than through `fixture`, matching `desktop-chrome.test.ts`: `fixture`
 * awaits a `nextFrame()` that never resolves in the backgrounded pages this runner uses when it
 * has several files in flight.
 * @param content What the window's body should be.
 * @param over Window state to override, for the cases that are about the frame rather than the
 * body: `active: false` is the only one so far, and it is what puts the focus catcher on screen.
 * @returns The mounted window element, and a dispose to take it off the page again.
 */
async function mountWindow(content: UmbraDesktopAppContent, over: Partial<UmbraDesktopWindow> = {}) {
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const state: UmbraDesktopWindow = {
    id: 'w1',
    app: app(content),
    rect: { x: 0, y: 0, w: 640, h: 400 },
    z: 1,
    active: true,
    state: 'normal',
    ...over,
  };
  element.window = state;
  document.body.appendChild(element);
  await element.updateComplete;
  return { element, root: element.shadowRoot!, dispose: () => element.remove() };
}

/** Let the app host finish its own load, which is a separate element's update cycle. */
async function settleHost(root: ShadowRoot) {
  const host = root.querySelector('umbradesktop-app-host') as UmbraDesktopAppHostElement | null;
  if (host) await host.mountComplete;
}

it('renders an element body as an app host, with no iframe beside it', async () => {
  const win = await mountWindow({ kind: 'element', element: loadTestApp });
  try {
    await settleHost(win.root);
    const host = win.root.querySelector('umbradesktop-app-host');
    expect(host, 'the element branch mounts the app host').to.not.equal(null);
    expect(
      win.root.querySelector('iframe'),
      'no iframe: there is no second backoffice to boot for a self-contained app',
    ).to.equal(null);
    expect(host!.querySelector('umbradesktop-window-body-test-app'), 'the app itself is in the host').to.not.equal(
      null,
    );
  } finally {
    win.dispose();
  }
});

it('leaves the window overlay down for an element body, so the host paints its own', async () => {
  const win = await mountWindow({ kind: 'element', element: loadTestApp });
  try {
    await settleHost(win.root);
    expect(
      win.root.querySelector('.loading'),
      'the window loader covers a booting backoffice; over an app it would cover the host spinner',
    ).to.equal(null);
    expect(
      win.root.querySelector('.ctrl-reload.busy'),
      'and the reload glyph must not spin forever waiting for a load event that never comes',
    ).to.equal(null);
  } finally {
    win.dispose();
  }
});

it('reloads an element body by recreating it', async () => {
  const win = await mountWindow({ kind: 'element', element: loadTestApp });
  try {
    await settleHost(win.root);
    const before = win.root.querySelector('umbradesktop-window-body-test-app');
    const loadsBefore = loads;

    (win.root.querySelector('.ctrl-reload') as HTMLButtonElement).click();
    await win.element.updateComplete;
    await settleHost(win.root);

    const after = win.root.querySelector('umbradesktop-window-body-test-app');
    expect(after, 'the body still holds an app after a reload').to.not.equal(null);
    expect(after, 'but a different instance: a reload is a new game, not the old board').to.not.equal(before);
    expect(loads, 'and the loader ran again for it').to.equal(loadsBefore + 1);
  } finally {
    win.dispose();
  }
});

it('renders an iframe body as an iframe, with no app host beside it', async () => {
  const win = await mountWindow({ kind: 'iframe', url: 'about:blank' });
  try {
    const iframe = win.root.querySelector('iframe.body') as HTMLIFrameElement | null;
    expect(iframe, 'the iframe branch is unchanged by the discriminator').to.not.equal(null);
    expect(iframe!.getAttribute('src')).to.equal('about:blank');
    expect(
      win.root.querySelector('umbradesktop-app-host'),
      'no app host: a deep-linked backoffice has no element to mount',
    ).to.equal(null);
    // The positive half of the overlay pair above. Without it, dropping the `content.kind` check
    // from `willUpdate` clears `_loading` on every window's first update and the suite stays green
    // while the booting backoffice's own header flashes into view on every iframe window.
    expect(
      win.root.querySelector('.loading'),
      'an iframe body keeps the overlay up until the chrome is stripped',
    ).to.not.equal(null);
  } finally {
    win.dispose();
  }
});

/**
 * The reload button does two different things and used to claim it did one.
 *
 * On the iframe path it re-fetches and, same-origin, keeps whatever route the user navigated to
 * inside the frame. On the element path it discards the instance, which for a game is the board,
 * with no confirm and no undo. The button stays unguarded, since F5 costs a browser game its state
 * too, but a shared "Reload" promised a refresh to someone four minutes into Minesweeper.
 */
it('labels the reload control for what it costs: Reload for an iframe, Restart for an element', async () => {
  const frame = await mountWindow({ kind: 'iframe', url: 'about:blank' });
  try {
    const ctrl = frame.root.querySelector('.ctrl-reload')!;
    expect(ctrl.getAttribute('title'), 'an iframe reload keeps the route and loses nothing').to.equal('Reload');
    expect(ctrl.getAttribute('aria-label')).to.equal('Reload');
  } finally {
    frame.dispose();
  }

  const el = await mountWindow({ kind: 'element', element: loadTestApp });
  try {
    await settleHost(el.root);
    const ctrl = el.root.querySelector('.ctrl-reload')!;
    // "Restart" and not "New game": the shell cannot know the app is a game, only that this kind
    // starts over.
    expect(ctrl.getAttribute('title'), 'an element reload throws the instance away').to.equal('Restart');
    expect(ctrl.getAttribute('aria-label')).to.equal('Restart');
  } finally {
    el.dispose();
  }
});

/**
 * The focus catcher covers an element body too, and that is the decision rather than an oversight.
 *
 * It exists because an inactive iframe swallows the pointer event that should have focused its
 * window. An element body needs no such help, so leaving the catcher up costs an inactive game its
 * first click. Kept anyway: click-to-focus then act is what every OS window does, and a stray
 * click landing on a mine in a window the user was not looking at is the worse outcome. Pinned
 * here so the catcher cannot quietly become iframe-only on the grounds that it is iframe
 * machinery.
 */
it('covers an inactive element body with the focus catcher, so the first click only focuses', async () => {
  const win = await mountWindow({ kind: 'element', element: loadTestApp }, { active: false });
  try {
    await settleHost(win.root);
    expect(
      win.root.querySelector('.focus-catcher'),
      'an inactive element window is click-to-focus, like every other window',
    ).to.not.equal(null);
    expect(win.root.querySelector('umbradesktop-app-host'), 'and the app is mounted beneath it').to.not.equal(null);
  } finally {
    win.dispose();
  }
});
