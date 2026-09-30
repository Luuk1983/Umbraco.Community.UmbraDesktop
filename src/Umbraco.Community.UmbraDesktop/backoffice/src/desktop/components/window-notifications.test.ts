import { expect, waitUntil } from '@open-wc/testing';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import type { UmbraDesktopToast } from '../notifications/types.js';
import type { UmbraDesktopApp } from '../types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * How long to wait for the watcher's poll. It polls every 100ms, but a page the runner has in the
 * background has its intervals throttled to once a second, so the default one-second wait loses the
 * race whenever several files are in flight.
 */
const POLL_WAIT = { timeout: 5000 };

/**
 * The window's half of the notification take-over: its frame is watched from the moment it loads,
 * watched again after a reload, and registered as the place a notification can be raised again.
 *
 * The frame is `about:blank`, and a backoffice shell in miniature is built inside it once it has
 * loaded: a provider answering for the notification context, and a notification container two
 * shadow roots below it. That is everything the watcher looks for, and building it after `load` is
 * also what a real frame looks like to the watcher, whose backoffice boots after the event.
 */

const MOUNT_TIMEOUT_MS = 20_000;

const APP: UmbraDesktopApp = {
  alias: 'notification-probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
};

/** What the fake context records being raised through it. */
interface FakeShell {
  /** Raise a notification in the frame, the way core's context does. */
  peek(color: string, options: { data?: unknown; elementName?: string; duration?: number | null }): unknown;
  /** Every call to peek, in order. */
  raised: Array<{ color: string; options: Record<string, unknown> }>;
  /** The container's shadow root, where the hiding rule lands. */
  containerRoot: ShadowRoot;
}

/**
 * Build a backoffice shell in miniature inside a frame's document.
 * @param doc The frame's document.
 * @returns The shell.
 */
function buildShell(doc: Document): FakeShell {
  let list: unknown[] = [];
  const subscribers = new Set<(l: unknown[]) => void>();
  let next = 0;
  const raised: FakeShell['raised'] = [];
  const context = {
    notifications: {
      subscribe(fn: (l: unknown[]) => void) {
        subscribers.add(fn);
        fn(list);
        return { unsubscribe: () => subscribers.delete(fn) };
      },
    },
    peek(color: string, options: { data?: unknown; elementName?: string; duration?: number | null }) {
      raised.push({ color, options: options as Record<string, unknown> });
      const handler = {
        key: `k${(next += 1)}`,
        color,
        duration: options.duration === undefined ? 6000 : options.duration,
        _data: options.data,
        _elementName: options.elementName,
        element: doc.createElement('uui-toast-notification'),
      };
      list = [...list, handler];
      for (const fn of subscribers) fn(list);
      return handler;
    },
  };
  const provider = doc.createElement('div');
  provider.addEventListener('umb:context-request', (event) => {
    const request = event as Event & { contextAlias: string; callback: (i: unknown) => boolean };
    if (request.contextAlias !== 'UmbNotificationContext') return;
    if (request.callback(context)) event.stopPropagation();
  });
  doc.body.appendChild(provider);
  const container = doc.createElement('umb-backoffice-notification-container');
  provider.attachShadow({ mode: 'open' }).appendChild(container);
  const containerRoot = container.attachShadow({ mode: 'open' });
  return { peek: (c, o) => context.peek(c, o), raised, containerRoot };
}

let wrapper: HTMLElement;
let host: UmbElementControllerHost;
let manager: UmbraDesktopWindowManagerContext;
let centre: UmbraDesktopNotificationCentreContext;
let element: UmbraDesktopWindowElement;

beforeEach(async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  window.sessionStorage.clear();
  wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  host = new UmbElementControllerHost(wrapper);
  manager = new UmbraDesktopWindowManagerContext(host);
  centre = new UmbraDesktopNotificationCentreContext(host, manager);
  host.hostConnected();
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
});

afterEach(() => {
  host?.destroy();
  wrapper?.remove();
  window.sessionStorage.clear();
});

/**
 * Open a window after the desktop is already running, and wait for its frame to load.
 * @returns The window's frame.
 */
async function openWindow(): Promise<HTMLIFrameElement> {
  manager.open(APP);
  element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  element.window = manager.getWindows()[0];
  wrapper.appendChild(element);
  await element.updateComplete;
  const iframe = element.shadowRoot!.querySelector('iframe.body') as HTMLIFrameElement;
  await waitUntil(() => iframe.contentDocument?.readyState === 'complete', 'the frame should load', POLL_WAIT);
  return iframe;
}

/** The centre's toasts, read synchronously. */
function toasts(): UmbraDesktopToast[] {
  let list: UmbraDesktopToast[] = [];
  centre.toasts.subscribe((v) => (list = v)).unsubscribe();
  return list;
}

it('watches the frame of a window opened after the desktop was running', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  const iframe = await openWindow();
  const shell = buildShell(iframe.contentDocument!);
  await waitUntil(() => shell.containerRoot.querySelector('style'), 'the frame should be taken over', POLL_WAIT);

  shell.peek('warning', { data: { message: 'License invalid' } });

  expect(toasts()).to.have.length(1);
  expect(toasts()[0].notification.message).to.equal('License invalid');
  expect(toasts()[0].sourceId, 'recorded against the window that raised it').to.equal(element.window!.id);
  expect(toasts()[0].source).to.equal('Probe');
});

it('watches a reloaded window again', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  const iframe = await openWindow();
  const first = iframe.contentDocument!;
  buildShell(first);
  element.shadowRoot!.querySelector<HTMLButtonElement>('.ctrl-reload')!.click();
  await waitUntil(
    () => iframe.contentDocument !== first && iframe.contentDocument?.readyState === 'complete',
    'the frame should reload',
    POLL_WAIT,
  );

  const shell = buildShell(iframe.contentDocument!);
  await waitUntil(() => shell.containerRoot.querySelector('style'), 'the reloaded frame should be taken over', POLL_WAIT);
  shell.peek('default', { data: { message: 'After reload' } });

  expect(toasts().map((t) => t.notification.message)).to.deep.equal(['After reload']);
});

it('raises a notification carrying its own element again in the frame it came from', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  const iframe = await openWindow();
  const shell = buildShell(iframe.contentDocument!);
  await waitUntil(() => shell.containerRoot.querySelector('style'), undefined, POLL_WAIT);
  shell.peek('danger', {
    elementName: 'umb-peek-error-notification',
    data: { message: 'Could not save', errors: { name: ['Required'] } },
  });

  centre.activate(toasts()[0]);

  expect(shell.raised).to.have.length(2);
  expect(shell.raised[1].color).to.equal('danger');
  expect(shell.raised[1].options.elementName).to.equal('umb-peek-error-notification');
  expect(shell.raised[1].options.data).to.deep.equal({ message: 'Could not save', errors: { name: ['Required'] } });
  expect(toasts(), 'raising it again is not a second notification').to.deep.equal([]);
});

it('stops watching when the window closes', async function () {
  this.timeout(MOUNT_TIMEOUT_MS);
  const iframe = await openWindow();
  const shell = buildShell(iframe.contentDocument!);
  await waitUntil(() => shell.containerRoot.querySelector('style'), undefined, POLL_WAIT);

  element.remove();

  expect(shell.containerRoot.querySelector('style'), 'the hiding rule goes with the watcher').to.equal(null);
});
