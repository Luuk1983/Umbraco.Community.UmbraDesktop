import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider, UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbraDesktopOnDesktopCondition } from './on-desktop.condition.js';
import { findDesktopWindows } from './desktop-windows.js';

/** The desktop's window manager, by the alias it publishes, as any package builds the token. */
const WINDOW_MANAGER = new UmbContextToken<UmbContextMinimal>('UmbraDesktopWindowManagerContext');

/** A stand-in window manager. */
const MANAGER = { openApp: () => true, getHostElement: () => document.body };

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * An element where an action would be, in one of the three places Edit image can be asked about.
 *
 * - `desktop`: on the desktop page itself, under the window manager's provider, as a Media Manager
 *   window's collection is.
 * - `frame`: inside an iframe whose `<iframe>` element is under the provider, as the Media section in
 *   a backoffice window is. The provider cannot be seen from inside; only the frame's element can.
 * - `plain`: on a page with no desktop at all, as the plain backoffice is.
 * @param where Which of the three.
 * @returns The element.
 */
async function placeAction(where: 'desktop' | 'frame' | 'plain'): Promise<HTMLElement> {
  const desktop = document.createElement('div');
  document.body.appendChild(desktop);
  cleanup.push(() => desktop.remove());
  if (where !== 'plain') {
    const provider = new UmbContextProvider(desktop, WINDOW_MANAGER, MANAGER as never);
    provider.hostConnected();
    cleanup.push(() => provider.destroy());
  }
  if (where !== 'frame') {
    const element = document.createElement('div');
    desktop.appendChild(element);
    return element;
  }
  const iframe = document.createElement('iframe');
  desktop.appendChild(iframe);
  await new Promise((resolve) => setTimeout(resolve));
  const element = iframe.contentDocument!.createElement('div');
  iframe.contentDocument!.body.appendChild(element);
  return element;
}

/**
 * Evaluate the condition on an element, as core evaluates an action's conditions.
 * @param element Where the action is.
 * @returns Whether the action is permitted.
 */
async function evaluate(element: HTMLElement): Promise<boolean> {
  const host = new UmbElementControllerHost(element);
  cleanup.push(() => host.destroy());
  let permitted = false;
  const condition = new UmbraDesktopOnDesktopCondition(host, {
    host,
    config: { alias: 'Umbraco.Community.UmbraDesktop.Media.Condition.OnDesktop' },
    onChange: (value) => (permitted = value),
  });
  host.hostConnected();
  await new Promise((resolve) => setTimeout(resolve, 10));
  return permitted && condition.permitted;
}

/**
 * Edit image opens a desktop window, so it shows only where there is a desktop to open it on
 * (design §3, condition 1), and is answered without a request.
 */
describe('the on-desktop condition', () => {
  it('permits on the desktop page, as in a Media Manager window', async () => {
    expect(await evaluate(await placeAction('desktop'))).to.equal(true);
  });

  it('permits inside a backoffice window, reaching the desktop through the frame', async () => {
    expect(await evaluate(await placeAction('frame'))).to.equal(true);
  });

  it('refuses in the plain backoffice', async () => {
    expect(await evaluate(await placeAction('plain'))).to.equal(false);
  });
});

/** The same lookup is what the action opens the editor with (design §4.2). */
describe('finding the desktop', () => {
  it('finds the window manager from the desktop page and from inside a frame on it', async () => {
    expect(findDesktopWindows(await placeAction('desktop')) === (MANAGER as never)).to.equal(true);
    expect(findDesktopWindows(await placeAction('frame')) === (MANAGER as never)).to.equal(true);
  });

  it('finds nothing without a desktop', async () => {
    expect(findDesktopWindows(await placeAction('plain')) === undefined).to.equal(true);
  });
});

/** Created before its element is in the page, as core may, it decides again once the element is. */
it('decides again when its host connects', async () => {
  const desktop = document.createElement('div');
  cleanup.push(() => desktop.remove());
  const provider = new UmbContextProvider(desktop, WINDOW_MANAGER, MANAGER as never);
  cleanup.push(() => provider.destroy());
  const element = document.createElement('div');
  desktop.appendChild(element);
  const host = new UmbElementControllerHost(element);
  cleanup.push(() => host.destroy());
  let permitted = false;
  new UmbraDesktopOnDesktopCondition(host, {
    host,
    config: { alias: 'Umbraco.Community.UmbraDesktop.Media.Condition.OnDesktop' },
    onChange: (value) => (permitted = value),
  });
  expect(permitted, 'not in the page yet').to.equal(false);
  document.body.appendChild(desktop);
  provider.hostConnected();
  host.hostConnected();
  expect(permitted).to.equal(true);
});
