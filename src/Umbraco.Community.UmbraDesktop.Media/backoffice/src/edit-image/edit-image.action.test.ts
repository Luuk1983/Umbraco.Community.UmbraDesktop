import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider, UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbraDesktopEditImageAction } from './edit-image.action.js';
import { UMBRADESKTOP_IMAGE_EDITOR_APP } from '../image-editor/constants.js';

/** The desktop's window manager, by the alias it publishes. */
const WINDOW_MANAGER = new UmbContextToken<UmbContextMinimal>('UmbraDesktopWindowManagerContext');

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * Run Edit image on an item, with a desktop around it or not.
 * @param withDesktop Whether a window manager is provided above the action.
 * @returns Every `openApp` call the action made.
 */
async function run(withDesktop: boolean): Promise<Array<[string, unknown]>> {
  const calls: Array<[string, unknown]> = [];
  const desktop = document.createElement('div');
  const element = document.createElement('div');
  desktop.appendChild(element);
  document.body.appendChild(desktop);
  cleanup.push(() => desktop.remove());
  if (withDesktop) {
    const manager = { openApp: (alias: string, options: unknown) => (calls.push([alias, options]), true), getHostElement: () => desktop };
    const provider = new UmbContextProvider(desktop, WINDOW_MANAGER, manager as never);
    provider.hostConnected();
    cleanup.push(() => provider.destroy());
  }
  const host = new UmbElementControllerHost(element);
  host.hostConnected();
  cleanup.push(() => host.destroy());
  const action = new UmbraDesktopEditImageAction(host, { entityType: 'media', unique: 'beach', meta: {} as never });
  await action.execute();
  return calls;
}

/**
 * Edit image opens the Image Editor at the item, reusing an editor already showing it (design §4.3),
 * so the same image is never in two editors.
 */
describe('Edit image', () => {
  it('opens the Image Editor at the item, bringing forward one already showing it', async () => {
    expect(await run(true)).to.deep.equal([[UMBRADESKTOP_IMAGE_EDITOR_APP, { location: 'beach', reuse: true }]]);
  });

  it('does nothing without a desktop, which its condition hides it for anyway', async () => {
    expect(await run(false)).to.deep.equal([]);
  });
});
