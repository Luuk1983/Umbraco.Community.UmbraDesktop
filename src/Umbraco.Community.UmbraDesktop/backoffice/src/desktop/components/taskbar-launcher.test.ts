import { expect } from '@open-wc/testing';
import './taskbar.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import type { UmbraDesktopLauncherElement } from './launcher.element.js';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types.js';
import type { UmbraDesktopLauncherLayout } from '../settings/types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../settings/settings-store.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_MODAL_MANAGER_CONTEXT } from '@umbraco-cms/backoffice/modal';

/**
 * When the taskbar closes the launcher, and when it leaves it open.
 *
 * It closes on a press outside it, on Escape, and on focus going into one of the desktop's windows,
 * which as an iframe takes focus without a pointer event reaching this document. It does not close
 * when the browser itself loses focus to another program, which used to close it every time the
 * user switched away and back. Arrange mode holds it open against an outside press, since a missed
 * click there threw the user out of the mode, and Escape steps back a level before it closes.
 */

/** Mounting a chrome component is slow in this runner; see `desktop-chrome.test.ts`. */
const MOUNT_TIMEOUT_MS = 20_000;

/** An app the launcher can draw; it is never launched here. */
const APP: UmbraDesktopApp = {
  alias: 'content',
  name: 'content',
  icon: 'icon-document',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
  group: 'editing',
};

/** The one group, so arrange mode has something in it. */
const GROUPS: UmbraDesktopGroup[] = [{ alias: 'editing', label: 'Editing', weight: 10 }];

describe('the taskbar and the launcher it opens', () => {
  let wrapper: HTMLElement;
  let host: UmbElementControllerHost;
  let taskbar: UmbraDesktopTaskbarElement;
  let frame: HTMLIFrameElement;
  /** Every confirm the launcher asked the modal manager for, with the way to answer it. */
  let confirms: Array<{ data: Record<string, unknown>; submit(): void; reject(): void }>;
  /** Every arrangement stored. */
  let writes: Array<{ pinned: string[]; layout?: UmbraDesktopLauncherLayout }>;

  before(async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    host = new UmbElementControllerHost(wrapper);

    const manager = new UmbraDesktopWindowManagerContext(host);
    new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_APP_CATALOGUE_CONTEXT, {
      apps: new UmbArrayState<UmbraDesktopApp>([APP], (a) => a.alias).asObservable(),
      catalogueGroups: new UmbArrayState<UmbraDesktopGroup>(GROUPS, (g) => g.alias).asObservable(),
      isRefRegistered: () => true,
      getEntryRef: () => undefined,
      getHostElement: () => wrapper,
    } as never).hostConnected();
    const arrangement = new UmbObjectState<{ pinned: string[]; layout?: UmbraDesktopLauncherLayout }>({ pinned: [] });
    new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
      pinned: arrangement.asObservablePart((a) => a.pinned),
      layout: arrangement.asObservablePart((a) => a.layout),
      setLauncherArrangement: (pinned: ReadonlyArray<string>, layout?: UmbraDesktopLauncherLayout) => {
        const write = { pinned: [...pinned], layout };
        writes.push(write);
        arrangement.setValue(write);
      },
      taskbarFeatures: new UmbObjectState<Record<string, boolean>>({ fullscreen: false }).asObservable(),
      locale: new UmbObjectState(UMBRADESKTOP_DEFAULT_SETTINGS.locale).asObservable(),
      getHostElement: () => wrapper,
    } as never).hostConnected();
    // A modal manager that shows nothing and lets the test answer, which is all the taskbar's side
    // of a confirm needs: `umbConfirmModal` awaits `onSubmit`, which resolves on confirm and rejects
    // on cancel.
    new UmbContextProvider(wrapper, UMB_MODAL_MANAGER_CONTEXT, {
      open: (_host: unknown, _token: unknown, args: { data: Record<string, unknown> }) => {
        let submit!: () => void;
        let reject!: () => void;
        const answered = new Promise<void>((resolve, fail) => {
          submit = resolve;
          reject = () => fail(new Error('cancelled'));
        });
        confirms.push({ data: args.data, submit, reject });
        return { onSubmit: () => answered };
      },
      getHostElement: () => wrapper,
    } as never).hostConnected();

    taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
    wrapper.appendChild(taskbar);
    await taskbar.updateComplete;

    // A window's content, as far as focus is concerned: an iframe inside a shadow root.
    const windowHost = document.createElement('div');
    wrapper.appendChild(windowHost);
    frame = document.createElement('iframe');
    windowHost.attachShadow({ mode: 'open' }).appendChild(frame);
  });

  after(() => {
    host?.destroy();
    wrapper?.remove();
  });

  /** The launcher, when it is open. */
  const launcher = () => taskbar.renderRoot.querySelector<UmbraDesktopLauncherElement>('umbradesktop-launcher');

  /** How many launchers are mounted: one while open, none while closed. */
  const openCount = () => taskbar.renderRoot.querySelectorAll('umbradesktop-launcher').length;

  /** Wait for the taskbar and the launcher to render what the last action changed. */
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await taskbar.updateComplete;
    await launcher()?.updateComplete;
  };

  /** Press somewhere on the page outside the launcher and the start button. */
  const pressOutside = () =>
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerId: 21, button: 0 }));

  /** Press Escape with nothing in the launcher focused, so only the taskbar hears it. */
  const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  /** An element in the open launcher. */
  const inLauncher = (selector: string) => launcher()!.shadowRoot!.querySelector<HTMLElement>(selector)!;

  beforeEach(async () => {
    confirms = [];
    writes = [];
    frame.blur();
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (openCount() === 0) taskbar.renderRoot.querySelector<HTMLElement>('.start')!.click();
    await settle();
  });

  afterEach(async () => {
    // Closed from the start button whatever state the test left it in, so the next one opens fresh.
    if (openCount() > 0) taskbar.renderRoot.querySelector<HTMLElement>('.start')!.click();
    await settle();
  });

  it('names the start button in the user\'s language', async () => {
    // It used to be a hard-coded English "Open apps", which Windows 98 shows as the button's visible
    // label, so a Dutch desktop had one English word on its taskbar.
    const start = taskbar.renderRoot.querySelector<HTMLElement>('.start')!;
    const term = taskbar.localize.term('umbraDesktop_openApps');

    expect(start.getAttribute('aria-label')).to.equal(term);
    expect(start.getAttribute('title')).to.equal(term);
  });

  it('closes on a press outside it', async () => {
    pressOutside();
    await settle();
    expect(openCount()).to.equal(0);
  });

  it('stays open when the browser loses focus to another program', async () => {
    window.dispatchEvent(new Event('blur'));
    await settle();
    expect(openCount()).to.equal(1);
  });

  it('closes when focus goes into one of the windows', async () => {
    frame.focus();
    window.dispatchEvent(new Event('blur'));
    await settle();
    expect(openCount()).to.equal(0);
  });

  it('stays open in arrange mode against an outside press and focus going into a window', async () => {
    inLauncher('.ctl.arrange').click();
    await settle();
    pressOutside();
    frame.focus();
    window.dispatchEvent(new Event('blur'));
    await settle();
    expect(openCount()).to.equal(1);
    expect(launcher()!.shadowRoot!.querySelectorAll('.banner').length).to.equal(1);
  });

  it('steps back from arrange mode on Escape, and closes on the next one', async () => {
    inLauncher('.ctl.arrange').click();
    await settle();
    escape();
    await settle();
    expect(openCount()).to.equal(1);
    expect(launcher()!.shadowRoot!.querySelectorAll('.banner').length).to.equal(0);
    escape();
    await settle();
    expect(openCount()).to.equal(0);
  });

  it('steps back from All apps on Escape', async () => {
    inLauncher('.ctl.all-apps').click();
    await settle();
    escape();
    await settle();
    expect(openCount()).to.equal(1);
    expect(launcher()!.shadowRoot!.querySelectorAll('.drawer').length).to.equal(0);
  });

  it('opens the Reset confirm as a modal, holds the launcher open under it, and resets on confirm', async () => {
    inLauncher('.ctl.arrange').click();
    await settle();
    // Something to reset: a launcher that was never arranged has nothing to write.
    inLauncher('.tile.arr .rm').click();
    await settle();
    inLauncher('.ctl.reset').click();
    await settle();
    expect(confirms.length).to.equal(1);
    expect(confirms[0].data.color).to.equal('danger');
    // A press inside the modal is outside the launcher, and so is Escape to close it.
    pressOutside();
    escape();
    await settle();
    expect(openCount(), 'still open under its own confirm').to.equal(1);
    confirms[0].submit();
    await settle();
    await settle();
    expect(writes[writes.length - 1]).to.deep.equal({ pinned: [], layout: undefined });
    expect(openCount()).to.equal(1);
    expect(launcher()!.shadowRoot!.querySelectorAll('.banner').length, 'still arranging').to.equal(1);
  });

  it('writes nothing when the Reset confirm is cancelled, and lets go of the launcher again', async () => {
    inLauncher('.ctl.arrange').click();
    await settle();
    inLauncher('.ctl.reset').click();
    await settle();
    confirms[0].reject();
    await settle();
    expect(writes.length).to.equal(0);
    inLauncher('.ctl.done').click();
    await settle();
    pressOutside();
    await settle();
    expect(openCount()).to.equal(0);
  });
});
