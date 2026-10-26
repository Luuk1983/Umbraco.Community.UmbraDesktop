import { expect } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMBRADESKTOP_APP_SUBJECT_EVENT } from '../constants.js';

/**
 * An element app says which entity it shows (#176), so the desktop treats its window as it treats a
 * backoffice window showing that entity: the server-event router reloads it when clean and raises
 * the changed-elsewhere banner when dirty, and the banner's Discard mine reloads it.
 */

/** A stand-in app that reports what it shows and counts its reloads. */
class SubjectApp extends HTMLElement {
  /** How often the desktop asked it to take the server's version. */
  reloads = 0;

  /** The version it holds. */
  held = 'v1';

  /**
   * Reports a subject, or none, the way an app would.
   * @param unique The item, or null for nothing.
   */
  report(unique: string | null) {
    const subject = unique
      ? {
          entityType: 'media',
          unique,
          version: () => this.held,
          serverVersion: async () => 'v2',
          reload: async () => void (this.reloads += 1),
        }
      : null;
    this.dispatchEvent(new CustomEvent(UMBRADESKTOP_APP_SUBJECT_EVENT, { detail: { subject }, bubbles: true, composed: true }));
  }
}
customElements.define('probe-subject-app', SubjectApp);

const APP: UmbraDesktopApp = {
  alias: 'subject',
  name: 'Subject',
  icon: 'icon-picture',
  content: { kind: 'element', element: SubjectApp },
  chromeProfile: 'bare',
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A window for {@link APP}, mounted, with its app element in place.
 * @returns The manager, the window's id, its element and its app element.
 */
async function mounted() {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position: fixed; left: 0; top: 0; width: 1000px; height: 700px;';
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  cleanup.push(() => {
    host.destroy();
    wrapper.remove();
  });
  manager.open(APP);
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const state = (): UmbraDesktopWindow => manager.getWindows()[0];
  const sync = () => (element.window = { ...state() });
  const subscription = manager.windows.subscribe(() => element.isConnected && sync());
  cleanup.push(() => subscription.unsubscribe());
  wrapper.appendChild(element);
  sync();
  let app: SubjectApp | null = null;
  for (let tries = 0; tries < 40 && !app; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    app = element.shadowRoot!.querySelector<SubjectApp>('probe-subject-app');
  }
  return { manager, id: state().id, wrapper, app: app! };
}

it('records the subject an app reports', async () => {
  const { manager, id, app } = await mounted();
  app.report('m1');
  const [subject] = manager.subjectsOf(id);
  expect(subject.entityType).to.equal('media');
  expect(subject.unique).to.equal('m1');
  expect(subject.version!.held()).to.equal('v1');
  app.held = 'v3';
  expect(subject.version!.held()).to.equal('v3', 'read live, so a save moves it');
  expect(await subject.version!.server()).to.equal('v2');
  expect(subject.getData()).to.equal(undefined);
  expect(subject.getPersistedData()).to.equal(undefined);
});

it('clears the subject on null', async () => {
  const { manager, id, app } = await mounted();
  app.report('m1');
  app.report(null);
  expect(manager.subjectsOf(id)).to.eql([]);
});

it("discard mine reloads the app, through the subject's reload", async () => {
  const { manager, id, app } = await mounted();
  app.report('m1');
  await manager.subjectsOf(id)[0].reload();
  expect(app.reloads).to.equal(1);
});

it('stops the event at the window', async () => {
  const { wrapper, app } = await mounted();
  let heard = false;
  wrapper.addEventListener(UMBRADESKTOP_APP_SUBJECT_EVENT, () => (heard = true));
  app.report('m1');
  expect(heard).to.equal(false);
});

it('ignores a detail that is not a subject', async () => {
  const { manager, id, app } = await mounted();
  app.report('m1');
  app.dispatchEvent(new CustomEvent(UMBRADESKTOP_APP_SUBJECT_EVENT, { detail: { subject: 'm2' }, bubbles: true, composed: true }));
  expect(manager.subjectsOf(id)[0].unique).to.equal('m1');
});
