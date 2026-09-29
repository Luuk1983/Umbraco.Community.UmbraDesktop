import { expect } from '@open-wc/testing';
import { UmbraDesktopWindowLayoutController } from './layout.controller.js';
import { layoutStorageKey } from './layout-persistence.js';
import { serialiseLayout } from './layout.js';
import type { UmbraDesktopWindowLayout } from './layout.js';
import type { UmbraDesktopApp } from '../types.js';
import type { UmbraDesktopReopenWindows } from '../settings/types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_SPLASH_ELEMENT_ID, lowerBootSplash, raiseBootSplash } from '../boot/splash.js';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbCurrentUserContext } from '@umbraco-cms/backoffice/current-user';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbArrayState, UmbBasicState, UmbBooleanState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The window layout joined to the desktop: which user, which mode, when to start, and what a change
 * of mode throws away. The restoring flag is what holds the desktop's first paint, so no window
 * appears once the desktop can be used.
 */

/** A bare host that can provide and consume contexts. */
class TestHostElement extends UmbLitElement {}
customElements.define('umbradesktop-layout-controller-test-host', TestHostElement);

/** A launchable app. */
const app = (alias: string): UmbraDesktopApp => ({
  alias,
  name: alias,
  icon: 'icon-document',
  content: { kind: 'iframe', url: `/umbraco/section/${alias}` },
  chromeProfile: 'bare',
});

const CONTENT = app('content');

const LAYOUT: UmbraDesktopWindowLayout = {
  version: 1,
  windows: [{ app: 'content', rect: { x: 10, y: 10, w: 400, h: 300 }, state: 'normal', z: 1, active: true }],
};

/** A `Storage` in memory. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const key = layoutStorageKey('user-1');

let hosts: HTMLElement[] = [];
afterEach(() => {
  lowerBootSplash();
  for (const host of hosts) host.remove();
  hosts = [];
});

/**
 * A controller on a mounted host with a signed-in user, fake settings and in-memory storage.
 * @param options The starting mode, what the tab holds, which apps exist, and how long to wait.
 */
function setup(
  options: { mode?: UmbraDesktopReopenWindows; session?: string; apps?: UmbraDesktopApp[]; deadlineMs?: number } = {},
) {
  const host = document.createElement('umbradesktop-layout-controller-test-host') as TestHostElement;
  document.body.appendChild(host);
  hosts.push(host);
  host.provideContext(UMB_CURRENT_USER_CONTEXT, {
    currentUser: new UmbObjectState({ unique: 'user-1' }).asObservable(),
    getHostElement: () => host,
  } as unknown as UmbCurrentUserContext);
  const session = memoryStorage();
  const local = memoryStorage();
  if (options.session) session.setItem(key, options.session);
  const mode = new UmbBasicState<UmbraDesktopReopenWindows>(options.mode ?? 'session');
  const loaded = new UmbBooleanState(false);
  const apps = new UmbArrayState<UmbraDesktopApp>(options.apps ?? [CONTENT], (a) => a.alias);
  const manager = new UmbraDesktopWindowManagerContext(host);
  const controller = new UmbraDesktopWindowLayoutController(host, {
    manager,
    settings: { reopenWindows: mode.asObservable(), loaded: loaded.asObservable() },
    apps: apps.asObservable(),
    storage: { session: () => session, local: () => local },
    deadlineMs: options.deadlineMs ?? 150,
    saveDelayMs: 20,
    statusDelayMs: 30,
  });
  let restoring: boolean | undefined;
  controller.restoring.subscribe((value) => (restoring = value));
  return {
    manager,
    session,
    local,
    controller,
    setMode: (next: UmbraDesktopReopenWindows) => mode.setValue(next),
    load: () => loaded.setValue(true),
    restoring: () => restoring,
  };
}

/** Let the context request and a restore's microtasks settle. */
const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

it('reopens this tab’s windows once settings have loaded', async () => {
  const { manager, load } = setup({ session: serialiseLayout(LAYOUT) });
  await settle();
  expect(manager.getWindows().length, 'not before settings say whether to').to.equal(0);
  load();
  await settle();
  expect(manager.getWindows().map((w) => w.app.alias)).to.deep.equal(['content']);
});

/**
 * The flag the desktop holds its first paint on. Up from the moment settings arrive, not a tick
 * later, so the desktop never gets a frame in which it is usable before the windows are back.
 */
it('reports restoring from the moment settings load until every window is back or given up on', async () => {
  const { load, restoring } = setup({ session: serialiseLayout(LAYOUT), apps: [], deadlineMs: 100 });
  await settle();
  expect(restoring(), 'nothing to hold for before settings').to.equal(false);
  load();
  expect(restoring(), 'held in the same tick').to.equal(true);
  await settle(200);
  expect(restoring(), 'released at the deadline').to.equal(false);
});

it('does not hold the desktop when there is nothing to reopen', async () => {
  const { load, restoring } = setup();
  await settle();
  load();
  await settle();
  expect(restoring()).to.equal(false);
});

it('reopens nothing and keeps nothing while switched off', async () => {
  const { manager, session, load } = setup({ mode: 'off', session: serialiseLayout(LAYOUT) });
  await settle();
  load();
  await settle();
  expect(manager.getWindows().length).to.equal(0);
  manager.open(CONTENT);
  await settle(60);
  expect(session.getItem(key), 'the stale copy is forgotten, and nothing new is written').to.equal(null);
});

it('forgets both copies, and stops saving, when switched off', async () => {
  const { manager, session, local, load, setMode } = setup({ mode: 'persistent' });
  await settle();
  load();
  await settle();
  manager.open(CONTENT);
  await settle(60);
  expect(session.getItem(key)).to.not.equal(null);
  setMode('off');
  expect(session.getItem(key)).to.equal(null);
  expect(local.getItem(key)).to.equal(null);
  manager.move(manager.getWindows()[0].id, 30, 30);
  await settle(60);
  expect(session.getItem(key)).to.equal(null);
});

it('writes the browser’s copy straight away when switched to keeping windows between visits', async () => {
  const { manager, local, load, setMode } = setup();
  await settle();
  load();
  await settle();
  manager.open(CONTENT);
  await settle(60);
  expect(local.getItem(key)).to.equal(null);
  setMode('persistent');
  expect(JSON.parse(local.getItem(key) ?? '{}').windows.length).to.equal(1);
});

it('forgets the browser’s copy when switched back to after a refresh only', async () => {
  const { manager, session, local, load, setMode } = setup({ mode: 'persistent' });
  await settle();
  load();
  await settle();
  manager.open(CONTENT);
  await settle(60);
  setMode('session');
  expect(local.getItem(key)).to.equal(null);
  expect(session.getItem(key), 'the tab keeps its own').to.not.equal(null);
});

it('starts keeping the layout when switched back on, without reopening anything', async () => {
  const { manager, session, load, setMode } = setup({ mode: 'off' });
  await settle();
  load();
  await settle();
  manager.open(CONTENT);
  setMode('session');
  await settle(60);
  expect(manager.getWindows().length).to.equal(1);
  expect(JSON.parse(session.getItem(key) ?? '{}').windows.length).to.equal(1);
});

/** The splash explains a restore only once it has run long, like every other wait behind it. */
it('says it is reopening windows on the splash when the restore runs long, and clears it after', async () => {
  raiseBootSplash(document, 60_000);
  const { load } = setup({ session: serialiseLayout(LAYOUT), apps: [], deadlineMs: 150 });
  await settle();
  load();
  await settle(80);
  const status = () => document.querySelector(`#${UMBRADESKTOP_SPLASH_ELEMENT_ID} .status`);
  expect(status()?.textContent ?? '', 'said once the delay has passed').to.contain('umbraDesktop_bootReopeningWindows');
  await settle(150);
  // A boolean rather than the element: a failing equality on an element hangs this runner.
  expect(status() === null, 'cleared when the restore is done').to.equal(true);
});

/**
 * Exit takes the desktop out of the page and coming back puts the same element back, windows and
 * all. Saving has to pick up again then, or the next F5 reopens the layout from before the Exit.
 */
it('keeps saving after the desktop is taken away and put back, without reopening anything', async () => {
  const { manager, session, load } = setup();
  await settle();
  load();
  await settle();
  manager.open(CONTENT);
  await settle(60);
  const host = hosts[0];
  host.remove();
  document.body.appendChild(host);
  await settle();
  expect(manager.getWindows().length, 'nothing reopened on top').to.equal(1);
  manager.move(manager.getWindows()[0].id, 123, 45);
  await settle(60);
  expect(JSON.parse(session.getItem(key) ?? '{}').windows[0].rect.x).to.equal(123);
});
