import { expect, waitUntil } from '@open-wc/testing';
import './taskbar.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import type { UmbraDesktopApp } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../settings/settings-store.js';
import { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import { UMBRADESKTOP_SCROLLBACK_SIZE } from '../notifications/scrollback.js';
import type { UmbraDesktopNotification } from '../notifications/types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The clock is the way into the scrollback, and the count on it is what says there is something in
 * there worth a look. These mount the real taskbar under a real centre and a real window manager.
 */

/** Mounting a chrome component is slow in this runner; see `desktop-chrome.test.ts`. */
const MOUNT_TIMEOUT_MS = 20_000;

const CONTENT: UmbraDesktopApp = {
  alias: 'content',
  name: 'Content',
  icon: 'icon-document',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
};

/**
 * A notification as a watcher hands it over.
 * @param message Its text.
 * @param color Its severity.
 * @returns The notification.
 */
function note(message: string, color: UmbraDesktopNotification['color'] = 'warning'): UmbraDesktopNotification {
  return { key: `${message}-${Math.random()}`, color, duration: 6000, message };
}

/** A stand-in store, so these never touch the real session. */
function memoryStore(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  } as unknown as Storage;
}

describe('the clock and the scrollback', () => {
  let wrapper: HTMLElement;
  let host: UmbElementControllerHost;
  let manager: UmbraDesktopWindowManagerContext;
  let centre: UmbraDesktopNotificationCentreContext;
  let taskbar: UmbraDesktopTaskbarElement;

  beforeEach(async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    host = new UmbElementControllerHost(wrapper);
    manager = new UmbraDesktopWindowManagerContext(host);
    centre = new UmbraDesktopNotificationCentreContext(host, manager, { store: memoryStore() });
    host.hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_APP_CATALOGUE_CONTEXT, {
      apps: new UmbArrayState<UmbraDesktopApp>([CONTENT], (a) => a.alias).asObservable(),
      groups: new UmbArrayState<never>([], (g) => g).asObservable(),
      isRefRegistered: () => true,
      getEntryRef: () => undefined,
      getHostElement: () => wrapper,
    } as never).hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
      pinned: new UmbArrayState<string>([], (a) => a).asObservable(),
      taskbarFeatures: new UmbObjectState<Record<string, boolean>>({}).asObservable(),
      locale: new UmbObjectState(UMBRADESKTOP_DEFAULT_SETTINGS.locale).asObservable(),
      getHostElement: () => wrapper,
    } as never).hostConnected();

    taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
    wrapper.appendChild(taskbar);
    await taskbar.updateComplete;
  });

  afterEach(() => {
    host?.destroy();
    wrapper?.remove();
  });

  const root = () => taskbar.shadowRoot!;
  const clock = () => root().querySelector<HTMLButtonElement>('button.clock')!;
  const dot = () => root().querySelector<HTMLElement>('.clock-dot');
  const panel = () => root().querySelector('umbradesktop-scrollback');
  const rows = () => [...(panel()?.shadowRoot?.querySelectorAll<HTMLElement>('.entry') ?? [])];

  it('draws the clock as a button, with no dot while nothing needs a look', async () => {
    expect(clock(), 'the clock should be a button now').to.exist;
    centre.raise(note('Saved', 'positive'), { sourceId: 'x', source: 'Content' });
    await taskbar.updateComplete;
    expect(dot(), 'a success is not worth a look').to.equal(null);
  });

  it('puts a dot by the clock while a warning or an error is held, and no number', async () => {
    centre.raise(note('License invalid'), { sourceId: 'x', source: 'Deploy' });
    await taskbar.updateComplete;
    expect(dot()?.dataset.severity).to.equal('warning');
    centre.raise(note('Failed', 'danger'), { sourceId: 'x', source: 'Content' });
    await taskbar.updateComplete;
    expect(dot()?.dataset.severity, 'the worst held colours it').to.equal('error');
    expect(dot()?.textContent?.trim(), 'a number reads as an unread count, which this is not').to.equal('');
    expect(clock().getAttribute('aria-label'), 'the clock still says so in words').to.contain('umbraDesktop_notificationsClockAttention');
  });

  it('takes the dot away as warnings roll off', async () => {
    centre.raise(note('Old'), { sourceId: 'x', source: 'Content' });
    await taskbar.updateComplete;
    expect(dot()).to.exist;
    for (let i = 0; i < UMBRADESKTOP_SCROLLBACK_SIZE; i++) {
      centre.raise(note(`Fine ${i}`, 'positive'), { sourceId: 'x', source: 'Content' });
    }
    await taskbar.updateComplete;
    expect(dot()).to.equal(null);
  });

  it('clears the list, and the dot with it', async () => {
    centre.raise(note('License invalid'), { sourceId: 'x', source: 'Deploy' });
    clock().click();
    await taskbar.updateComplete;
    await waitUntil(() => rows().length === 1);
    const clear = () => panel()!.shadowRoot!.querySelector<HTMLButtonElement>('.clear')!;

    clear().click();
    await taskbar.updateComplete;

    await waitUntil(() => rows().length === 0, 'the list should be empty');
    expect(dot()).to.equal(null);
    await (panel() as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    expect(clear().disabled, 'an empty list has nothing to clear, and says so rather than hiding it').to.equal(true);
    expect(panel(), 'clearing is not acting on an entry, so the list stays open').to.exist;
  });

  it('opens the scrollback from the clock, listing source, text, count and time', async () => {
    centre.raise(note('License invalid'), { sourceId: 'x', source: 'Deploy' });
    centre.raise(note('License invalid'), { sourceId: 'x', source: 'Deploy' });
    clock().click();
    await taskbar.updateComplete;
    await waitUntil(() => rows().length === 1, 'the panel should list the one entry');

    const row = rows()[0];
    expect(row.textContent).to.contain('Deploy');
    expect(row.textContent).to.contain('License invalid');
    expect(row.querySelector('.entry-count')?.textContent).to.contain('2');
    expect(row.querySelector('time')?.getAttribute('datetime'), 'when it last arrived').to.match(/^\d{4}-/);
  });

  it('says so when there is nothing in it', async () => {
    clock().click();
    await taskbar.updateComplete;
    await waitUntil(() => panel()?.shadowRoot?.querySelector('.empty'), 'an empty scrollback says it is empty');
  });

  it('focuses the window an entry came from, and closes the panel', async () => {
    manager.open(CONTENT);
    const id = manager.getWindows()[0].id;
    manager.setState(id, 'minimized');
    centre.raise(note('Check this'), { sourceId: id, source: 'Content' });
    clock().click();
    await taskbar.updateComplete;
    await waitUntil(() => rows().length === 1);

    rows()[0].click();
    await taskbar.updateComplete;

    const w = manager.getWindows()[0];
    expect(w.state, 'restored from minimized').to.equal('normal');
    expect(w.active).to.equal(true);
    expect(panel()).to.equal(null);
  });

  it('closes on a second click of the clock and on Escape', async () => {
    clock().click();
    await taskbar.updateComplete;
    expect(panel()).to.exist;
    clock().click();
    await taskbar.updateComplete;
    expect(panel()).to.equal(null);

    clock().click();
    await taskbar.updateComplete;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await taskbar.updateComplete;
    expect(panel()).to.equal(null);
  });

  /**
   * Open the list and wait for it to have been placed, which happens after it renders.
   * @returns The list's box and the clock's.
   */
  async function openAndMeasure() {
    clock().click();
    await taskbar.updateComplete;
    await waitUntil(() => panel(), 'the list should open');
    await (panel() as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    await taskbar.updateComplete;
    return { list: panel()!.getBoundingClientRect(), clock: clock().getBoundingClientRect() };
  }

  it('lines the list up with the clock, wherever the theme puts the clock', async () => {
    // Moved in from the trailing edge, the way the macOS dock carries its clock mid-screen.
    clock().style.marginRight = '300px';
    const { list, clock: c } = await openAndMeasure();
    expect(Math.abs(list.right - c.right), 'the list ends where the clock ends').to.be.lessThan(1);
  });

  it('keeps the list on screen when the clock is too near the leading edge to hang it from', async () => {
    clock().style.position = 'absolute';
    clock().style.left = '0';
    const { list } = await openAndMeasure();
    expect(list.left, 'never off the leading edge').to.be.at.least(0);
    expect(list.right).to.be.at.most(taskbar.getBoundingClientRect().right);
  });

  it('tells the centre while the list is open, so the toasts can stand aside', async () => {
    let open = false;
    centre.listOpen.subscribe((v) => (open = v));
    clock().click();
    await taskbar.updateComplete;
    expect(open).to.equal(true);
    clock().click();
    await taskbar.updateComplete;
    expect(open).to.equal(false);
  });

  it('closes the launcher when it opens, and the other way round', async () => {
    root().querySelector<HTMLButtonElement>('button.start')!.click();
    await taskbar.updateComplete;
    expect(root().querySelector('umbradesktop-launcher')).to.exist;
    clock().click();
    await taskbar.updateComplete;
    expect(root().querySelector('umbradesktop-launcher')).to.equal(null);
    expect(panel()).to.exist;
  });
});
