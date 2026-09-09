import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopAppHostElement } from './app-host.element.js';
import type { UmbraDesktopApp, UmbraDesktopAppContent, UmbraDesktopWindow } from '../types.js';
import { UMBRADESKTOP_THEME_ATTRIBUTE } from '../constants.js';
import { UMBRADESKTOP_THEME_CONTEXT } from '../theme/theme.context-token.js';
import type { UmbraDesktopThemeContext } from '../theme/theme.context.js';
import { resolveTheme } from '../theme/resolve-variant.js';
import type { UmbraDesktopResolvedTheme } from '../theme/resolve-variant.js';
import { UMBRADESKTOP_DEFAULT_THEME_ID, UMBRADESKTOP_THEMES } from '../theme/themes/index.js';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbBasicState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_THEME_LIGHT_ALIAS } from '@umbraco-cms/backoffice/themes';

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

/**
 * What each app instance read off itself in its own `connectedCallback`, in connect order.
 *
 * A probe rather than a convenience. The theme id is promised on the app element *before its first
 * render*, and every other case here asserts the attribute's **final** state, so a stamp that moved
 * to after the first render would pass all of them: the attribute is there by the time a test looks.
 * `connectedCallback` is the first moment the app itself can look, and an app that renders there is
 * the ordinary case, so reading the attribute from inside it is what converts that guarantee from
 * inferred to pinned.
 */
const themeAtConnect: Array<string | null> = [];

/** A trivial app element, standing in for a game. */
class BodyTestAppElement extends HTMLElement {
  /** Marks itself mounted so "a fresh instance" is observable in the DOM, not just in a count. */
  connectedCallback() {
    this.textContent = 'app ready';
    themeAtConnect.push(this.getAttribute(UMBRADESKTOP_THEME_ATTRIBUTE));
  }
}
customElements.define('umbradesktop-window-body-test-app', BodyTestAppElement);

/**
 * Stands in for the desktop, providing the chrome theme context a window consumes.
 *
 * A stub rather than the real {@link UmbraDesktopThemeContext} because that one is driven entirely
 * by the settings and Umbraco theme contexts it consumes, so switching a theme through it means
 * mounting a whole desktop (`theme/theme-adoption.test.ts` does exactly that, and pays twenty
 * seconds for it). What a window actually reads is one observable, `resolved`, so this publishes
 * that one and nothing else, and drives it with the real {@link resolveTheme} rather than a
 * hand-built object — reading `resolved.theme.id` is the path under test, and a fabricated shape
 * would let the window read a field the real context never fills.
 *
 * `UmbBasicState`, not `UmbObjectState`: the latter deep-freezes what it holds, and what it would
 * be holding here is a theme object straight out of the shipped catalogue, shared with every other
 * test in this page.
 *
 * Renders into the light DOM so a window appended to it is an ordinary descendant, which is what a
 * context request needs to bubble past.
 */
@customElement('umbradesktop-window-body-theme-host')
class BodyTestThemeHost extends UmbLitElement {
  /**
   * The theme in force, as the real context publishes it.
   *
   * Typed with `undefined` in it because the window's own reader is `resolved?.theme.id ?? ''`, so
   * "no theme at all" is a state it already handles and {@link clearThemeId} is what reaches it.
   */
  #resolved = new UmbBasicState<UmbraDesktopResolvedTheme | undefined>(
    BodyTestThemeHost.resolve(UMBRADESKTOP_DEFAULT_THEME_ID),
  );

  /** The one member of the context contract a window uses. */
  public readonly resolved = this.#resolved.asObservable();

  constructor() {
    super();
    // Cast because the token is typed to the whole context class and this deliberately implements
    // only the part a window consumes; a stub that satisfied the class would have to carry the
    // stylesheet loading this test has no use for.
    this.provideContext(UMBRADESKTOP_THEME_CONTEXT, this as unknown as UmbraDesktopThemeContext);
  }

  /** Light DOM, so an appended window is a real descendant rather than slotted content. */
  override createRenderRoot() {
    return this;
  }

  /**
   * Resolve a theme id the way the real context does.
   * @param themeId The id to put in force.
   * @returns The resolved theme.
   */
  static resolve(themeId: string): UmbraDesktopResolvedTheme {
    return resolveTheme({ themeId, umbThemeAlias: UMB_THEME_LIGHT_ALIAS, catalogue: UMBRADESKTOP_THEMES });
  }

  /**
   * Put a different theme in force, as choosing one in the settings dialog eventually does.
   * @param themeId The theme to switch to.
   */
  public setThemeId(themeId: string): void {
    this.#resolved.setValue(BodyTestThemeHost.resolve(themeId));
  }

  /**
   * Publish no resolved theme at all, which is what an app sees when the theme it was shown stops
   * being in force: a context torn down under it, a window re-parented out from under the desktop.
   * @see The remove arm of the app host's `#stampTheme`.
   */
  public clearThemeId(): void {
    this.#resolved.setValue(undefined);
  }
}

/**
 * Poll until `read` returns `expected`, then assert it, so a failure reports what it actually was.
 *
 * The poller is not avoidable: the theme id crosses a context resolution, an observable, the
 * window's update and then the app host's own update before it lands on the app element, and there
 * is genuinely no single promise to await across all four. What *is* avoidable is losing the value.
 * This ended in `expect.fail(message)`, which said "the app element should start on the theme in
 * force" and never said what the attribute held instead, and that is the most useful fact of the
 * two: `null` means the id never arrived, where a wrong id means it arrived and is stale. Polling
 * and then asserting reports both.
 *
 * Only the positive cases use this: an assertion that something is *absent* must not be given two
 * seconds to become present.
 * @param read The value to poll, read fresh each time.
 * @param expected What it should settle on.
 * @param message What to say about it if it does not.
 * @typeParam T The value's type.
 */
async function until<T>(read: () => T, expected: T, message: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (read() === expected) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(read(), message).to.equal(expected);
}

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
 * @param parent Where to mount it. Defaults to the document body, which resolves no desktop
 * contexts at all — deliberate, since that is also the "no theme yet" case. The theme cases pass a
 * {@link BodyTestThemeHost} so the window has a context to consume.
 * @returns The mounted window element, and a dispose to take it off the page again.
 */
async function mountWindow(
  content: UmbraDesktopAppContent,
  over: Partial<UmbraDesktopWindow> = {},
  parent: ParentNode = document.body,
) {
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
  parent.appendChild(element);
  await element.updateComplete;
  return { element, root: element.shadowRoot!, dispose: () => element.remove() };
}

/**
 * Mount an element window under a theme context, and settle its app.
 * @param themeId The theme to start on.
 * @returns The window, the theme host to drive, and a dispose that takes both off the page.
 */
async function mountThemedAppWindow(themeId: string = UMBRADESKTOP_DEFAULT_THEME_ID) {
  const themeHost = document.createElement('umbradesktop-window-body-theme-host') as BodyTestThemeHost;
  themeHost.setThemeId(themeId);
  document.body.appendChild(themeHost);
  await themeHost.updateComplete;

  const win = await mountWindow({ kind: 'element', element: loadTestApp }, {}, themeHost);
  await settleHost(win.root);
  return { ...win, themeHost, dispose: () => themeHost.remove() };
}

/**
 * The app element the host mounted, which is the node an app's own `:host(...)` selector matches.
 * @param root The window's shadow root.
 * @returns The app element, or null before it has mounted.
 */
function appElement(root: ShadowRoot): Element | null {
  return root.querySelector('umbradesktop-window-body-test-app');
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
      win.root.querySelector('.busy'),
      'and nothing in the chrome may spin forever waiting for a load event that never comes',
    ).to.equal(null);
  } finally {
    win.dispose();
  }
});

it('draws no reload control on an element window, and all four on an iframe one', async () => {
  const el = await mountWindow({ kind: 'element', element: loadTestApp });
  try {
    await settleHost(el.root);
    // Reload used to be drawn here too, relabelled "Restart" (design D14), and recreated the
    // element. It did nothing that closing the window and opening it again does not — the element
    // is destroyed either way — and it cost a fixed 46px of a titlebar that turned out not to have
    // 46px to spare: a nine-by-nine game asks for a 274px window and four controls plus its own
    // name wanted 311px of it. So the affordance an app window loses is a duplicate, and what it
    // gains is its own name in the caption.
    expect(
      el.root.querySelector('.ctrl-reload'),
      'an element app has nothing to re-fetch, so the shell offers no reload for it',
    ).to.equal(null);
    expect(
      [...el.root.querySelectorAll('.ctrl')].length,
      'and the three that are left are the three that still mean something: minimize, maximize, close',
    ).to.equal(3);
    for (const kept of ['.ctrl-minimize', '.ctrl-maximize', '.ctrl-close']) {
      expect(el.root.querySelector(kept), `${kept} must survive dropping reload`).to.not.equal(null);
    }
  } finally {
    el.dispose();
  }

  const frame = await mountWindow({ kind: 'iframe', url: 'about:blank' });
  try {
    const ctrl = frame.root.querySelector('.ctrl-reload');
    expect(
      ctrl,
      'an iframe keeps it: re-fetching a booting backoffice in place, with the window keeping the ' +
        'route the user navigated to inside it, is the one thing close-and-reopen cannot do',
    ).to.not.equal(null);
    expect(ctrl!.getAttribute('title'), 'and it promises a refresh, because that is what it does').to.equal(
      'Reload',
    );
    expect(ctrl!.getAttribute('aria-label')).to.equal('Reload');
    expect([...frame.root.querySelectorAll('.ctrl')].length, 'four controls on the iframe path').to.equal(4);
  } finally {
    frame.dispose();
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

/**
 * The theme id has to land on the app's *own* element, and this is the assertion that says so.
 *
 * It shipped on the host instead, which is the app element's parent, and the design (D9, §6.2)
 * promises an app author `:host([data-umbradesktop-theme='win98'])` — a selector that matches the
 * app's own element and can never see an attribute one level up. The ancestor form that could,
 * `:host-context`, is the one D9 rejects because Firefox has never shipped it. So an attribute on
 * the host alone is unreadable by the only mechanism the contract offers, and every worked example
 * would silently never match. Reading the app element rather than the host is the whole point of
 * this case.
 *
 * The host keeps its own copy, asserted here too, for the app that renders into light DOM: no
 * shadow root means no `:host`, and such an app reads the theme from its parent instead. That
 * assertion doubles as the guard on the attribute's *name*, which `window.element.ts` has to spell
 * out as a literal because Lit's `html` cannot interpolate an attribute name — this reads it back
 * through `UMBRADESKTOP_THEME_ATTRIBUTE`, so the two drifting apart is a failure rather than a
 * silently dead selector.
 */
it("stamps the chrome theme id on the app's own element, not merely on the host", async () => {
  const win = await mountThemedAppWindow('win98');
  try {
    const host = win.root.querySelector('umbradesktop-app-host')!;
    await until(
      () => appElement(win.root)?.getAttribute(UMBRADESKTOP_THEME_ATTRIBUTE),
      'win98',
      "the app's own element should carry the theme id, since `:host(...)` is what an app can select on",
    );
    expect(
      host.getAttribute(UMBRADESKTOP_THEME_ATTRIBUTE),
      'and the host keeps it, for an app that renders into light DOM and has no `:host` at all',
    ).to.equal('win98');
  } finally {
    win.dispose();
  }
});

/**
 * A theme change must rewrite the attribute on the app element that is already there.
 *
 * The host remounts whenever `load` changes, and remounting is how a game loses its board. If the
 * theme id travelled through that path, toggling dark mode four minutes into Minesweeper would
 * clear the grid. Hence the identity assertion: the attribute changing is only half of it, and the
 * half that would still pass under a remount.
 */
it('updates the theme id on a live app element in place, without remounting it', async () => {
  const win = await mountThemedAppWindow('umbraco');
  try {
    await until(
      () => appElement(win.root)?.getAttribute(UMBRADESKTOP_THEME_ATTRIBUTE),
      'umbraco',
      'the app element should start on the theme in force',
    );
    const before = appElement(win.root);
    const loadsBefore = loads;

    win.themeHost.setThemeId('win98');
    await until(
      () => appElement(win.root)?.getAttribute(UMBRADESKTOP_THEME_ATTRIBUTE),
      'win98',
      'a theme change should reach the app element',
    );

    expect(appElement(win.root), 'and reach it in place: a remount is a thrown-away board').to.equal(before);
    expect(loads, 'so the loader must not have run again either').to.equal(loadsBefore);
  } finally {
    win.dispose();
  }
});

/**
 * Before a theme resolves there is no id, and no attribute rather than an empty one.
 *
 * `data-umbradesktop-theme=""` still matches `[data-umbradesktop-theme]`, so an app testing for the
 * attribute's existence would get a match and no usable value — present and useless is the one
 * state worth ruling out, because it is the state an app cannot detect. Absent or right; never
 * both.
 *
 * Mounted straight onto the body, with no theme context above it, which is the real shape of this
 * case: a window rendering in the gap before `consumeContext` has resolved.
 */
it('renders no theme attribute at all until a theme resolves', async () => {
  const win = await mountWindow({ kind: 'element', element: loadTestApp });
  try {
    await settleHost(win.root);
    const host = win.root.querySelector('umbradesktop-app-host')!;
    expect(
      host.hasAttribute(UMBRADESKTOP_THEME_ATTRIBUTE),
      'an empty theme attribute matches an app\'s existence check and answers it with nothing',
    ).to.equal(false);
    expect(
      appElement(win.root)!.hasAttribute(UMBRADESKTOP_THEME_ATTRIBUTE),
      'and the same decision has to hold on the app element, which is where apps select',
    ).to.equal(false);
  } finally {
    win.dispose();
  }
});

/**
 * And an app that *had* a theme and then loses it gets the attribute taken off, not left stale.
 *
 * The other side of the case above, and the one the host argues for at length in `#stampTheme`: an
 * app can see that the attribute is missing and cannot see that it is out of date, so a stale id is
 * worse than none. That argument had no test behind it. The empty case above covers "never had a
 * theme", which reaches the same branch by never taking it, so it would still pass with the remove
 * arm deleted.
 *
 * Driven by publishing no resolved theme, which is the window's own `resolved?.theme.id ?? ''` arm
 * and therefore a real path rather than a poke at the host. Asserted by node identity too, for the
 * same reason the theme-change case is: losing a theme must not cost a game its board either.
 */
it('takes the theme attribute off a live app element when the theme stops being in force', async () => {
  const win = await mountThemedAppWindow('win98');
  try {
    await until(
      () => appElement(win.root)?.getAttribute(UMBRADESKTOP_THEME_ATTRIBUTE),
      'win98',
      'the app element should start on the theme in force',
    );
    const before = appElement(win.root);
    const loadsBefore = loads;

    win.themeHost.clearThemeId();
    await until(
      () => appElement(win.root)?.getAttribute(UMBRADESKTOP_THEME_ATTRIBUTE),
      null,
      'a theme that is no longer in force must be removed, never left behind as a stale id',
    );

    expect(appElement(win.root), 'and removed in place, like any other theme change').to.equal(before);
    expect(loads, 'so the loader must not have run again either').to.equal(loadsBefore);
  } finally {
    win.dispose();
  }
});

/**
 * The app element carries the theme id *before its own first render*, not merely by the time
 * anything looks.
 *
 * Every other theme case here reads the attribute's final state, so a stamp that moved to after
 * first render would satisfy all of them while a Win98 app painted unstyled and corrected itself a
 * frame later. This one asks the app what it could see: {@link themeAtConnect} is filled from the
 * app's own `connectedCallback`, which for the ordinary custom element is where its first render
 * happens. `#mount` stamps while the element is still detached and assigns `_app` afterwards, and
 * this is the assertion that holds those two in that order.
 *
 * One entry, not one-or-more: a second connect would mean the app was moved or remounted to get its
 * attribute, which is the outcome the whole design is arranged to avoid.
 */
it("has the theme id on the app's element before the app's own first render", async () => {
  themeAtConnect.length = 0;
  const win = await mountThemedAppWindow('win98');
  try {
    expect(
      themeAtConnect,
      'the app should read its theme in connectedCallback, once, at its first and only connect',
    ).to.deep.equal(['win98']);
  } finally {
    win.dispose();
  }
});

/**
 * The path strip is drawn for the windows that can get lost in a tree, and for no others.
 *
 * Both negatives matter more than the positive here, as everywhere else in this file. A strip on a
 * dashboard window is a permanent empty bar, and a strip on an element app is worse than useless:
 * `windowShowsPath` checks the body kind as well as the profile precisely because an element app's
 * `chromeProfile` is a required field nobody reads, so a check on the profile alone would put a
 * path on a game the day some manifest said `full-section`.
 */
it('draws the path strip on a full-section iframe window and on no other', async () => {
  const url = '/umbraco/section/media';
  const section = await mountWindow(
    { kind: 'iframe', url },
    { app: { ...app({ kind: 'iframe', url }), chromeProfile: 'full-section' } },
  );
  try {
    expect(section.root.querySelector('umbradesktop-window-path')).to.exist;
  } finally {
    section.dispose();
  }

  const dashboard = await mountWindow({
    kind: 'iframe',
    url: '/umbraco/section/settings/dashboard/examine-management',
  });
  try {
    expect(
      dashboard.root.querySelector('umbradesktop-window-path'),
      'a bare dashboard window has no ancestry to show and must not carry an empty strip',
    ).to.not.exist;
  } finally {
    dashboard.dispose();
  }
});

it('draws no path strip on an element window, whatever profile its app claims', async () => {
  const content: UmbraDesktopAppContent = { kind: 'element', element: loadTestApp };
  const win = await mountWindow(content, {
    app: { ...app(content), chromeProfile: 'full-section' },
  });
  try {
    expect(win.root.querySelector('umbradesktop-window-path')).to.not.exist;
  } finally {
    win.dispose();
  }
});
