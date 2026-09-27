import { expect } from '@open-wc/testing';
import './taskbar.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import type { UmbraDesktopApp } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../settings/settings-store.js';
import { UMBRADESKTOP_AI_CHAT_APP_ALIAS } from '../taskbar/features/ai-chat/availability.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The row of fixed features, immediately right of the launcher button and before the open-window
 * buttons.
 *
 * What is tested here is the wiring the pure modules beside the registry cannot see: that the two
 * shipped features land in the shell's order, that switching one off closes its space without
 * moving the other, that a button is the launcher's tile in a second place — `open()` and nothing
 * else — and that the row costs no space at all when there is nothing in it.
 */

/** Mounting a chrome component is slow in this runner; see `desktop-chrome.test.ts`. */
const MOUNT_TIMEOUT_MS = 20_000;

/**
 * A launchable app. `about:blank` loads instantly and boots no backoffice.
 * @param alias The app alias.
 * @param icon The icon the row button should draw.
 * @param allowMultiple Whether a second click opens a second window.
 * @returns The app.
 */
const app = (alias: string, icon: string, allowMultiple = true): UmbraDesktopApp => ({
  alias,
  name: alias,
  icon,
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
  allowMultiple,
});

const CHAT = app(UMBRADESKTOP_AI_CHAT_APP_ALIAS, 'icon-chat', false);
const CONTENT = app('content', 'icon-document');
const MEDIA = app('media', 'icon-picture');

describe('the taskbar feature row', () => {
  let wrapper: HTMLElement;
  let host: UmbElementControllerHost;
  let manager: UmbraDesktopWindowManagerContext;
  let taskbar: UmbraDesktopTaskbarElement;
  let apps: UmbArrayState<UmbraDesktopApp>;
  let pinned: UmbArrayState<string>;
  let features: UmbObjectState<Record<string, boolean>>;

  before(async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    host = new UmbElementControllerHost(wrapper);

    apps = new UmbArrayState<UmbraDesktopApp>([CHAT, CONTENT, MEDIA], (a) => a.alias);
    pinned = new UmbArrayState<string>(['content', 'media'], (a) => a);
    features = new UmbObjectState<Record<string, boolean>>({});

    manager = new UmbraDesktopWindowManagerContext(host);
    // Provided by hand on the wrapper, as `desktop-chrome.test.ts` does: the taskbar consumes
    // these from its ancestors, and a stub carrying the observables it reads is a real consumer's
    // whole world. A full catalogue context would resolve the shipped catalogue against a
    // registry, which is that context's own test and not this one.
    new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
    // `getHostElement` is not decoration: the context consumer calls it on whatever it resolves, to
    // scope the lookup, and a stub without one throws before the consuming element's callback runs.
    new UmbContextProvider(wrapper, UMBRADESKTOP_APP_CATALOGUE_CONTEXT, {
      apps: apps.asObservable(),
      groups: new UmbArrayState<never>([], (g) => g).asObservable(),
      isRefRegistered: () => true,
      getEntryRef: () => undefined,
      getHostElement: () => wrapper,
    } as never).hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
      pinned: pinned.asObservable(),
      taskbarFeatures: features.asObservable(),
      // The clock reads this. A stub without it would exercise the taskbar's fallback rather than
      // the path a real desktop takes, which is the opposite of what a partial stub is for.
      locale: new UmbObjectState(UMBRADESKTOP_DEFAULT_SETTINGS.locale).asObservable(),
      getHostElement: () => wrapper,
    } as never).hostConnected();

    taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
    wrapper.appendChild(taskbar);
    await taskbar.updateComplete;
  });

  after(() => {
    host?.destroy();
    wrapper?.remove();
  });

  beforeEach(async () => {
    for (const open of manager.getWindows()) manager.close(open.id);
    apps.setValue([CHAT, CONTENT, MEDIA]);
    pinned.setValue(['content', 'media']);
    // Full screen off for the cases about the chat and the pins, which are about those two and
    // should not have to account for a third button; its own cases switch it back on.
    features.setValue({ fullscreen: false });
    await taskbar.updateComplete;
  });

  /** Every button in the feature row, in the order it draws them. */
  const buttons = () => [...taskbar.renderRoot.querySelectorAll<HTMLElement>('.features .task')];

  /** The icon each row button is drawing, in order. */
  const icons = () => buttons().map((button) => button.querySelector('umb-icon')?.getAttribute('name') ?? '');

  /** The first class of each child of the cluster, in order: the taskbar's launching half. */
  const clusterChildren = () =>
    [...(taskbar.renderRoot.querySelector('.cluster')?.children ?? [])].map((child) => child.className.split(' ')[0]);

  it('draws the chat first, then the pinned apps in pin order', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    expect(icons()).to.deep.equal(['icon-chat', 'icon-document', 'icon-picture']);
  });

  it('sits between the launcher button and the open-window buttons', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    expect(clusterChildren()).to.deep.equal(['start', 'features', 'running']);
  });

  it('names every button, since none of them shows a label', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    for (const button of buttons()) {
      expect(button.getAttribute('title'), 'tooltip').to.be.a('string').and.to.not.equal('');
      expect(button.getAttribute('aria-label'), 'accessible name').to.equal(button.getAttribute('title'));
      expect(button.querySelector('.task-label'), 'the row is icon-only').to.equal(null);
    }
  });

  it('launches through the window manager, and holds no opinion about a second click', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    buttons()[1].click();
    buttons()[1].click();
    await taskbar.updateComplete;
    // `content` allows multiple, so two clicks are two windows: the button is the launcher's tile
    // in a second place, and a focus-if-open rule here would take second windows away from every
    // app in the catalogue.
    expect(manager.getWindows().map((w) => w.app.alias)).to.deep.equal(['content', 'content']);
  });

  it('lets the single-window rule in the manager decide, without restating it', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    buttons()[0].click();
    buttons()[0].click();
    await taskbar.updateComplete;
    expect(manager.getWindows().map((w) => w.app.alias)).to.deep.equal([UMBRADESKTOP_AI_CHAT_APP_ALIAS]);
  });

  it('closes a switched-off feature space without moving the others', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    features.setValue({ fullscreen: false, 'pinned-apps': false });
    await taskbar.updateComplete;
    expect(icons()).to.deep.equal(['icon-chat']);

    features.setValue({ fullscreen: false, 'ai-chat': false });
    await taskbar.updateComplete;
    // The pinned apps keep their own order and do not slide into the chat's slot, because the
    // shell's order is fixed rather than computed from what happens to be on.
    expect(icons()).to.deep.equal(['icon-document', 'icon-picture']);
  });

  it('takes no space at all when every feature is off', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    features.setValue({ fullscreen: false, 'ai-chat': false, 'pinned-apps': false });
    await taskbar.updateComplete;
    expect(taskbar.renderRoot.querySelector('.features'), 'an empty row should not be in the DOM').to.equal(null);
  });

  it('contributes nothing where the chat is not something this user can reach', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    apps.setValue([CONTENT, MEDIA]);
    await taskbar.updateComplete;
    // Switched on and contributing nothing, which is the normal state of a feature whose app is
    // not on this install. The row shows only what the user can actually use.
    expect(icons()).to.deep.equal(['icon-document', 'icon-picture']);
  });

  it('follows a pin the moment the launcher makes it', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    pinned.setValue(['media']);
    await taskbar.updateComplete;
    expect(icons()).to.deep.equal(['icon-chat', 'icon-picture']);
  });

  describe('the divider', () => {
    /**
     * The row and the window list draw the *same icon* for the same app — the duplicate the design
     * accepts, because the two are saying different things and the window button carries a title
     * the row button never does. With nothing between them a pinned Content button and an open
     * Content window are two identical glyphs side by side and nothing says they mean different
     * things, which is exactly the seam Windows 11 declines to draw and then has to explain with
     * running indicators.
     *
     * It is a divider *between two lists*, though, and not an ornament on either. With only one
     * list present it would be a line hanging off the end of something, so it appears only when
     * there is something on both sides of it.
     *
     * What is asserted here is the **DOM contract** and not whether anything is painted. No theme
     * sheet is adopted in these mounts, and the base leaves the divider at `display: none` on
     * purpose: with labels on, a window button carries its title and a row button carries nothing,
     * which already separates the two lists. Only the themes that hide labels need it drawn, and
     * that is `theme/taskbar-features.test.ts`'s question. The element's job is to put the divider
     * in the DOM exactly when there is something on both sides of it, so a theme opting in gets it
     * at the right moments and never gets a dangling one.
     */
    const divider = () => taskbar.renderRoot.querySelector('.divider');

    it('separates the two lists when there is something on both sides', async function () {
      this.timeout(MOUNT_TIMEOUT_MS);
      manager.open(CONTENT);
      await taskbar.updateComplete;
      expect(divider(), 'a fixed row and an open window need something between them').to.not.equal(null);
      expect(clusterChildren()).to.deep.equal(['start', 'features', 'divider', 'running']);
    });

    it('stays away while no window is open', async function () {
      this.timeout(MOUNT_TIMEOUT_MS);
      expect(divider(), 'nothing to separate the row from yet').to.equal(null);
    });

    it('stays away when the row itself is empty', async function () {
      this.timeout(MOUNT_TIMEOUT_MS);
      features.setValue({ fullscreen: false, 'ai-chat': false, 'pinned-apps': false });
      manager.open(CONTENT);
      await taskbar.updateComplete;
      expect(divider(), 'a divider with nothing before it is a line hanging off the start button').to.equal(null);
    });

    it('goes away again when the last window closes', async function () {
      this.timeout(MOUNT_TIMEOUT_MS);
      manager.open(CONTENT);
      await taskbar.updateComplete;
      for (const open of manager.getWindows()) manager.close(open.id);
      await taskbar.updateComplete;
      expect(divider()).to.equal(null);
    });

    it('is decoration, and says nothing to a screen reader', async function () {
      this.timeout(MOUNT_TIMEOUT_MS);
      manager.open(CONTENT);
      await taskbar.updateComplete;
      // The two lists are already distinguishable to anyone not looking at them: every row button
      // is named with its app, and every window button with its title. A divider that announced
      // itself would be one more thing to tab past for nothing.
      expect(divider()?.getAttribute('aria-hidden')).to.equal('true');
    });
  });

  it('drops a pinned alias that resolves to no app this user may launch', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    pinned.setValue(['content', 'gone', 'media']);
    await taskbar.updateComplete;
    expect(icons()).to.deep.equal(['icon-chat', 'icon-document', 'icon-picture']);
  });
});

/**
 * The full screen button: first on the row, and following the browser's own report of full screen,
 * so leaving with Esc turns it back into "Full screen" as surely as clicking it does.
 *
 * Two kinds of full screen are stood in for, because a test can take the page into neither. The
 * page's own, which the button asks for: `requestFullscreen` and `exitFullscreen` are recorded, and
 * `document.fullscreenElement` plus a `fullscreenchange` event play the browser's part. And the
 * browser's own, from F11 or its menu, which the Fullscreen API cannot see at all: only the
 * `display-mode: fullscreen` media query reports it, so `matchMedia` hands the taskbar a query this
 * file controls.
 */
describe('the full screen button', () => {
  let wrapper: HTMLElement;
  let host: UmbElementControllerHost;
  let taskbar: UmbraDesktopTaskbarElement;
  const asked: string[] = [];
  let restore: Array<() => void> = [];
  /** `window.matchMedia` as the browser provides it, put back when this block is done. */
  const realMatchMedia = window.matchMedia;
  /** Whoever is listening to the stand-in query. */
  const displayModeListeners = new Set<(event: MediaQueryListEvent) => void>();
  /** The stand-in `display-mode: fullscreen` query: whether the browser window is full screen. */
  const displayMode = {
    matches: false,
    media: '(display-mode: fullscreen)',
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      displayModeListeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      displayModeListeners.delete(listener),
  };

  before(async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    // Before the taskbar connects, because connecting is when it asks for the query.
    window.matchMedia = (query: string) =>
      query === displayMode.media ? (displayMode as unknown as MediaQueryList) : realMatchMedia.call(window, query);
    wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    host = new UmbElementControllerHost(wrapper);
    const manager = new UmbraDesktopWindowManagerContext(host);
    new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_APP_CATALOGUE_CONTEXT, {
      apps: new UmbArrayState<UmbraDesktopApp>([CONTENT], (a) => a.alias).asObservable(),
      groups: new UmbArrayState<never>([], (g) => g).asObservable(),
      isRefRegistered: () => true,
      getEntryRef: () => undefined,
      getHostElement: () => wrapper,
    } as never).hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
      pinned: new UmbArrayState<string>(['content'], (a) => a).asObservable(),
      taskbarFeatures: new UmbObjectState<Record<string, boolean>>({}).asObservable(),
      locale: new UmbObjectState(UMBRADESKTOP_DEFAULT_SETTINGS.locale).asObservable(),
      getHostElement: () => wrapper,
    } as never).hostConnected();
    taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
    wrapper.appendChild(taskbar);
    await taskbar.updateComplete;
  });

  beforeEach(() => {
    asked.length = 0;
    const root = document.documentElement;
    const request = root.requestFullscreen;
    const exit = document.exitFullscreen;
    root.requestFullscreen = async () => void asked.push('enter');
    document.exitFullscreen = async () => void asked.push('exit');
    restore = [
      () => (root.requestFullscreen = request),
      () => (document.exitFullscreen = exit),
      () => delete (document as unknown as Record<string, unknown>).fullscreenElement,
    ];
  });

  afterEach(async () => {
    for (const undo of restore) undo();
    // Out of both kinds of full screen, so no case starts where the last one left off: the real
    // `fullscreenElement` is null again, and the stand-in query is told the window is not either.
    document.dispatchEvent(new Event('fullscreenchange'));
    await windowFullscreen(false);
  });

  after(() => {
    window.matchMedia = realMatchMedia;
    host?.destroy();
    wrapper?.remove();
  });

  /**
   * The page entering or leaving its own full screen, as the browser reports it.
   * @param on Whether the page is full screen now.
   */
  async function pageFullscreen(on: boolean): Promise<void> {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (on ? document.documentElement : null) });
    document.dispatchEvent(new Event('fullscreenchange'));
    await taskbar.updateComplete;
  }

  /**
   * The browser window entering or leaving its own full screen, as after F11: no
   * `fullscreenElement` and no `fullscreenchange`, only the media query changing.
   * @param on Whether the window is full screen now.
   */
  async function windowFullscreen(on: boolean): Promise<void> {
    displayMode.matches = on;
    for (const listener of displayModeListeners) listener({ matches: on, media: displayMode.media } as MediaQueryListEvent);
    await taskbar.updateComplete;
  }

  /** Every button on the fixed row, in the order it is drawn. */
  const row = () => [...taskbar.renderRoot.querySelectorAll<HTMLElement>('.features .task')];
  /** The full screen button, which leads the row. */
  const first = () => row()[0];
  /**
   * The icon a row button draws.
   * @param button The button to read.
   * @returns The icon's registered name.
   */
  const iconOf = (button: HTMLElement) => button.querySelector('umb-icon')?.getAttribute('name');

  it('leads the row, before the pinned apps', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    expect(row().map(iconOf)).to.deep.equal(['icon-umbradesktop-fullscreen', 'icon-document']);
  });

  it('asks the browser to take the whole page full screen', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    first().click();
    expect(asked).to.deep.equal(['enter']);
  });

  it('turns into Exit full screen when the page goes full screen, and leaves it when clicked', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    await pageFullscreen(true);
    expect(iconOf(first())).to.equal('icon-umbradesktop-exit-fullscreen');
    expect(first().getAttribute('aria-pressed')).to.equal('true');
    first().click();
    expect(asked).to.deep.equal(['exit']);
  });

  it('follows the page back out, as when Esc leaves full screen', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    await pageFullscreen(true);
    await pageFullscreen(false);
    expect(iconOf(first())).to.equal('icon-umbradesktop-fullscreen');
    expect(first().getAttribute('aria-pressed')).to.equal('false');
  });

  it('keeps the page its own full screen, although the browser reports full screen for it too', async function () {
    // Chrome matches `display-mode: fullscreen` during the page's own full screen as well as after
    // F11, so the two reports arrive together here, and the page's own has to win: this is the
    // full screen the button can leave.
    this.timeout(MOUNT_TIMEOUT_MS);
    await pageFullscreen(true);
    await windowFullscreen(true);
    expect(first().hasAttribute('aria-disabled'), 'this one is the button to leave').to.equal(false);
    first().click();
    expect(asked).to.deep.equal(['exit']);
  });

  it('greys out while the browser itself is full screen, as after F11', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    await windowFullscreen(true);
    expect(first().getAttribute('aria-disabled')).to.equal('true');
    expect(iconOf(first()), 'the screen is full screen, so the arrows still point in').to.equal(
      'icon-umbradesktop-exit-fullscreen',
    );
    first().click();
    expect(asked, 'no page can leave the browser full screen, and asking for its own on top only confuses').to.deep.equal(
      [],
    );
  });

  it('comes back once the browser leaves its own full screen', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    await windowFullscreen(true);
    await windowFullscreen(false);
    expect(first().hasAttribute('aria-disabled')).to.equal(false);
    expect(iconOf(first())).to.equal('icon-umbradesktop-fullscreen');
    first().click();
    expect(asked).to.deep.equal(['enter']);
  });

  it('dims a greyed-out button and drops its pointer', async function () {
    // The two things that say "this cannot act right now" on any theme's button face, whatever the
    // theme draws behind it: the whole button fades, and the cursor stops promising a click.
    this.timeout(MOUNT_TIMEOUT_MS);
    const enabled = getComputedStyle(first());
    expect([enabled.cursor, enabled.opacity], 'an enabled button').to.deep.equal(['pointer', '1']);
    await windowFullscreen(true);
    const greyed = getComputedStyle(first());
    expect(greyed.cursor, 'no pointer over a button that cannot act').to.equal('default');
    expect(Number(greyed.opacity), 'faded').to.be.lessThan(1);
  });
});
