import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { aliasesOf } from '../frame-context.js';
import { desktopShown, sessionPlacement } from './placement.js';

/**
 * Where a session modal opens decides what it shows (design §4): nothing in a window's frame, the
 * lock screen in a document showing a desktop, and core's own screen anywhere else. These cases
 * build each of the three for real: a same-origin frame under a window-manager provider, a desktop
 * announced in this document, and neither.
 */

let teardown: Array<() => void> = [];
afterEach(() => {
  for (const dispose of teardown.reverse()) dispose();
  teardown = [];
});

/**
 * A same-origin frame, optionally under a stand-in for the desktop's window-manager provider.
 * @param provide Whether a window manager is provided above the frame.
 * @returns The frame's window, once loaded.
 */
async function frame(provide: boolean): Promise<Window> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  teardown.push(() => host.remove());
  if (provide) {
    const [contextAlias, apiAlias] = aliasesOf(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT);
    host.addEventListener('umb:context-request', (e: Event) => {
      const request = e as Event & { contextAlias: string; apiAlias: string; callback: (i: unknown) => boolean };
      if (request.contextAlias === contextAlias && request.apiAlias === apiAlias && request.callback({})) {
        e.stopImmediatePropagation();
      }
    });
  }
  const iframe = document.createElement('iframe');
  const loaded = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
  iframe.src = 'about:blank';
  host.appendChild(iframe);
  await loaded;
  return iframe.contentWindow!;
}

it('is elsewhere in a plain backoffice', () => {
  expect(sessionPlacement()).to.equal('elsewhere');
});

it('is the desktop while a desktop is shown in this document', () => {
  const desktop = document.createElement('div');
  document.body.appendChild(desktop);
  const leave = desktopShown(desktop);
  teardown.push(() => desktop.remove());

  expect(sessionPlacement()).to.equal('desktop');

  // Exit leaves the same document as the classic backoffice, which must get core's screens back.
  leave();
  expect(sessionPlacement()).to.equal('elsewhere');
});

it('is a window in a frame on a desktop', async () => {
  const view = await frame(true);
  expect(sessionPlacement(view)).to.equal('window');
});

it('is elsewhere in a frame that is not on a desktop', async () => {
  const view = await frame(false);
  expect(sessionPlacement(view)).to.equal('elsewhere');
});

it('is a window even when the outer document shows a desktop', async () => {
  const desktop = document.createElement('div');
  document.body.appendChild(desktop);
  teardown.push(desktopShown(desktop));
  teardown.push(() => desktop.remove());
  const view = await frame(true);

  expect(sessionPlacement(view)).to.equal('window');
});
