import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { startInDesktopFrame } from './media-change.entrypoint.js';

/**
 * The media change controller starts in a page only when that page is a window on a desktop
 * (#137): the plain backoffice keeps core's behaviour exactly, and the desktop page itself starts
 * its own from the desktop element.
 */

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A frame, under a desktop's window manager or not.
 * @param onDesktop Whether a window manager is provided above the frame.
 * @returns The frame's window.
 */
async function frame(onDesktop: boolean): Promise<Window> {
  const desktop = document.createElement('div');
  document.body.appendChild(desktop);
  cleanup.push(() => desktop.remove());
  if (onDesktop) {
    const provider = new UmbContextProvider(desktop, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, { getHostElement: () => desktop } as never);
    provider.hostConnected();
    cleanup.push(() => provider.destroy());
  }
  const iframe = document.createElement('iframe');
  desktop.appendChild(iframe);
  await new Promise((resolve) => setTimeout(resolve));
  return iframe.contentWindow!;
}

/** A host to start on. */
function host(): UmbElementControllerHost {
  const element = document.createElement('div');
  const controllerHost = new UmbElementControllerHost(element);
  cleanup.push(() => controllerHost.destroy());
  return controllerHost;
}

describe('starting the media change controller in a page', () => {
  it('starts in a frame that is a window on a desktop', async () => {
    expect(startInDesktopFrame(host(), await frame(true)) !== undefined).to.equal(true);
  });

  it('does not start in a frame with no desktop above it', async () => {
    expect(startInDesktopFrame(host(), await frame(false)) === undefined).to.equal(true);
  });

  it('does not start in a page that is not framed, as the plain backoffice is', () => {
    expect(startInDesktopFrame(host(), window) === undefined).to.equal(true);
  });
});

it('is registered as an entry point in the package bundle, so it runs in every frame', async () => {
  const { manifests } = await import('../../bundle.manifests.js');
  const entry = manifests.find((m) => m.alias === 'UmbraDesktop.LiveMedia');
  expect(entry?.type).to.equal('backofficeEntryPoint');
});
