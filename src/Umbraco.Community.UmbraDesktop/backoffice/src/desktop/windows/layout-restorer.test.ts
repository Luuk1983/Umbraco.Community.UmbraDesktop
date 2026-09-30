import { expect } from '@open-wc/testing';
import { UmbraDesktopWindowLayoutRestorer } from './layout-restorer.js';
import type { UmbraDesktopWindowLayout } from './layout.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';

/**
 * Reopening the saved windows when the desktop starts, and keeping the layout saved afterwards.
 *
 * A real window manager and a stand-in for storage. The apps arrive through an observable because
 * that is how the catalogue delivers them: a package's apps can appear some time after the desktop
 * has started, so a saved window waits for its app rather than being dropped at once.
 */

/** A launchable app. */
const app = (alias: string): UmbraDesktopApp => ({
  alias,
  name: alias,
  icon: 'icon-document',
  content: { kind: 'iframe', url: `/umbraco/section/${alias}` },
  chromeProfile: 'bare',
});

const CONTENT = app('content');
const MEDIA = app('media');
const GAME = app('game');

/** A saved layout: content behind, media in front and active. */
const LAYOUT: UmbraDesktopWindowLayout = {
  version: 1,
  windows: [
    { app: 'media', rect: { x: 300, y: 40, w: 500, h: 400 }, state: 'normal', z: 5, active: true },
    { app: 'content', rect: { x: 20, y: 20, w: 600, h: 450 }, state: 'maximized', z: 2, active: false },
  ],
};

/** Every host and restorer to tear down after a case. */
let hosts: UmbElementControllerHost[] = [];
let restorers: UmbraDesktopWindowLayoutRestorer[] = [];
afterEach(() => {
  for (const restorer of restorers) restorer.stop();
  for (const host of hosts) host.destroy();
  hosts = [];
  restorers = [];
});

/**
 * A restorer over a real manager, with storage recorded rather than written.
 * @param options What the stored layout holds, which apps are available, and whether to reopen.
 */
function setup(options: { layout?: UmbraDesktopWindowLayout; apps?: UmbraDesktopApp[]; reopen?: boolean } = {}) {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  const manager = new UmbraDesktopWindowManagerContext(host);
  const apps = new UmbArrayState<UmbraDesktopApp>(options.apps ?? [CONTENT, MEDIA], (a) => a.alias);
  const saves: UmbraDesktopWindowLayout[] = [];
  const restorer = new UmbraDesktopWindowLayoutRestorer({
    store: {
      load: () => options.layout ?? LAYOUT,
      save: (layout) => void saves.push(layout),
    },
    manager,
    apps: apps.asObservable(),
    reopen: options.reopen ?? true,
    deadlineMs: 150,
    saveDelayMs: 20,
  });
  restorers.push(restorer);
  const windows = (): ReadonlyArray<UmbraDesktopWindow> => manager.getWindows();
  return { manager, apps, saves, restorer, windows };
}

/** Wait long enough for a debounced save to have gone out. */
const afterSaveDelay = () => new Promise((resolve) => setTimeout(resolve, 60));

it('reopens the saved windows in stacking order, as they were, with the same window active', async () => {
  const { restorer, windows } = setup();
  await restorer.start();
  const [back, front] = windows();
  expect(back.app.alias, 'lowest first').to.equal('content');
  expect(back.state).to.equal('maximized');
  expect(front.app.alias).to.equal('media');
  expect(front.rect).to.eql({ x: 300, y: 40, w: 500, h: 400 });
  expect(front.active, 'the window that was active is again').to.equal(true);
  expect(front.z).to.be.greaterThan(back.z);
});

it('waits for an app that arrives late, as a package’s apps can', async () => {
  const { restorer, apps, windows } = setup({ apps: [CONTENT] });
  const started = restorer.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(windows().map((w) => w.app.alias), 'content straight away').to.deep.equal(['content']);
  apps.setValue([CONTENT, MEDIA]);
  await started;
  expect(windows().map((w) => w.app.alias)).to.deep.equal(['content', 'media']);
});

it('drops a window whose app never arrives, and still restores the rest', async () => {
  const layout: UmbraDesktopWindowLayout = {
    version: 1,
    windows: [...LAYOUT.windows, { app: 'uninstalled', rect: { x: 0, y: 0, w: 100, h: 100 }, state: 'normal', z: 9, active: false }],
  };
  const { restorer, windows } = setup({ layout });
  await restorer.start();
  expect(windows().map((w) => w.app.alias)).to.deep.equal(['content', 'media']);
});

/**
 * The restore is saved the moment it finishes, not at the next change. That is what forgets a
 * window whose app never came, so the next load does not wait for it all over again, and what gives
 * a tab seeded from the copy kept between visits a working copy of its own.
 */
it('saves the restored layout straight away, without the windows that never came back', async () => {
  const layout: UmbraDesktopWindowLayout = {
    version: 1,
    windows: [...LAYOUT.windows, { app: 'uninstalled', rect: { x: 0, y: 0, w: 100, h: 100 }, state: 'normal', z: 9, active: false }],
  };
  const { restorer, saves } = setup({ layout });
  await restorer.start();
  expect(saves.length, 'saved once, at the end of the restore').to.equal(1);
  expect(saves[0].windows.map((w) => w.app)).to.deep.equal(['content', 'media']);
});

/**
 * Saving before the restore has finished would write a half-restored layout over the whole one, and
 * a window waiting for its package would be forgotten for good.
 */
it('saves nothing until the restore has finished', async () => {
  const { restorer, manager, apps, saves } = setup({ apps: [CONTENT] });
  const started = restorer.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  manager.open(GAME);
  await afterSaveDelay();
  expect(saves, 'nothing yet: media is still waiting for its app').to.deep.equal([]);
  restorer.saveNow();
  expect(saves, 'not even when asked to').to.deep.equal([]);
  apps.setValue([CONTENT, MEDIA]);
  await started;
  expect(saves.length).to.equal(1);
});

it('saves the layout shortly after it changes, once for a burst of changes', async () => {
  const { restorer, manager, saves, windows } = setup();
  await restorer.start();
  const id = windows()[0].id;
  manager.move(id, 50, 50);
  manager.move(id, 60, 60);
  manager.move(id, 70, 70);
  await afterSaveDelay();
  expect(saves.length, 'the restore, then one save for the drag, not one per move').to.equal(2);
  expect(saves[1].windows.find((w) => w.app === 'content')?.rect).to.include({ x: 70, y: 70 });
});

it('does not save a layout that has not changed', async () => {
  const { restorer, manager, saves, windows } = setup();
  await restorer.start();
  manager.setLocation(windows()[0].id, windows()[0].location ?? '/umbraco/section/content');
  await afterSaveDelay();
  expect(saves.length, 'only the restore itself').to.equal(1);
});

/**
 * F5 straight after a change is the case this feature exists for, so a save still waiting out its
 * delay goes out when the page is hidden rather than being lost with it.
 */
it('saves a pending change at once when the page is hidden', async () => {
  const { restorer, manager, saves, windows } = setup({ layout: { version: 1, windows: [] } });
  await restorer.start();
  manager.open(CONTENT);
  manager.move(windows()[0].id, 80, 90);
  window.dispatchEvent(new Event('pagehide'));
  expect(saves.length, 'saved before the delay has passed').to.equal(1);
  expect(saves[0].windows[0].rect).to.include({ x: 80, y: 90 });
  await afterSaveDelay();
  expect(saves.length, 'and not a second time when the delay would have').to.equal(1);
});

/** Switching to "keep between visits" has to fill the browser's copy now, not at the next move. */
it('saves on request, even when nothing has changed', async () => {
  const { restorer, saves } = setup();
  await restorer.start();
  restorer.saveNow();
  expect(saves.length).to.equal(2);
  expect(saves[1].windows.map((w) => w.app)).to.deep.equal(['content', 'media']);
});

it('reopens nothing when not asked to, but still keeps the layout saved', async () => {
  const { restorer, manager, saves, windows } = setup({ reopen: false });
  await restorer.start();
  expect(windows()).to.deep.equal([]);
  manager.open(CONTENT);
  await afterSaveDelay();
  expect(saves.length).to.equal(1);
  expect(saves[0].windows.map((w) => w.app)).to.deep.equal(['content']);
});

it('stops saving once stopped', async () => {
  const { restorer, manager, saves } = setup();
  await restorer.start();
  restorer.stop();
  manager.open(GAME);
  window.dispatchEvent(new Event('pagehide'));
  restorer.saveNow();
  await afterSaveDelay();
  expect(saves.length, 'only the restore itself').to.equal(1);
});
