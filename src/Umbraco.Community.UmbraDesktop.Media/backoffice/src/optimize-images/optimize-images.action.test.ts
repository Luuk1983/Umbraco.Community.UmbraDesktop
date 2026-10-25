import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider, UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbraDesktopOptimizeImagesAction } from './optimize-images.action.js';

/** The media service's context, by the alias it publishes, as any package builds the token. */
const MEDIA_SERVICE = new UmbContextToken<UmbContextMinimal>('UmbraDesktopMediaContext');

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * Run Optimize images on a selection, from one of the three places it can be asked about: on the
 * desktop page (a Media Manager window), inside a frame on it (the Media section's window), or in the
 * plain backoffice, with a media service whose `optimizeMedia` never settles, as a run does not
 * until it ends.
 * @param where Where the action is.
 * @returns What the service was asked, and whether `execute` came back.
 */
async function run(where: 'desktop' | 'frame' | 'plain') {
  const asked: unknown[] = [];
  const desktop = document.createElement('div');
  document.body.appendChild(desktop);
  cleanup.push(() => desktop.remove());
  if (where !== 'plain') {
    const service = { optimizeMedia: (request: unknown) => (asked.push(request), new Promise(() => undefined)), getHostElement: () => desktop };
    const provider = new UmbContextProvider(desktop, MEDIA_SERVICE, service as never);
    provider.hostConnected();
    cleanup.push(() => provider.destroy());
  }
  let element: HTMLElement;
  if (where === 'frame') {
    const iframe = document.createElement('iframe');
    desktop.appendChild(iframe);
    await new Promise((resolve) => setTimeout(resolve));
    element = iframe.contentDocument!.createElement('div');
    iframe.contentDocument!.body.appendChild(element);
  } else {
    element = document.createElement('div');
    desktop.appendChild(element);
  }
  const host = new UmbElementControllerHost(element);
  host.hostConnected();
  cleanup.push(() => host.destroy());
  const action = new UmbraDesktopOptimizeImagesAction(host, { entityType: 'media', meta: {} as never });
  action.selection = ['design', 'banjo', 'report'];
  let returned = false;
  await Promise.race([action.execute().then(() => (returned = true)), new Promise((resolve) => setTimeout(resolve, 200))]);
  return { asked, returned };
}

/**
 * Optimize images hands the selection to the media service, which opens a window for the run (design
 * §4). It does not wait for the run, so the selection bar is free again at once.
 */
describe('Optimize images', () => {
  it('hands the selection, folders and all, to the media service and returns at once', async () => {
    const { asked, returned } = await run('desktop');
    expect(asked).to.deep.equal([{ items: ['design', 'banjo', 'report'] }]);
    expect(returned).to.equal(true);
  });

  it("finds the media service through the window's frame, as in the Media section", async () => {
    const { asked, returned } = await run('frame');
    expect(asked).to.deep.equal([{ items: ['design', 'banjo', 'report'] }]);
    expect(returned).to.equal(true);
  });

  it('does nothing without a desktop, which its conditions hide it for anyway', async () => {
    const { asked, returned } = await run('plain');
    expect(asked).to.deep.equal([]);
    expect(returned).to.equal(true);
  });
});
