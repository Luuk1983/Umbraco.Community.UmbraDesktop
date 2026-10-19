import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbraDesktopOpenInNewWindowAction } from './open-in-new-window.action.js';
import { UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT } from '../manager-window.context.js';
import type { UmbraDesktopMediaPlace } from '../location.js';

const FOLDER = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

/**
 * Run the action for an entity inside a stand-in manager window.
 * @param entityType The entity's type.
 * @param unique The entity's key.
 * @returns The places it asked the window to open.
 */
async function run(entityType: string, unique: string | null): Promise<UmbraDesktopMediaPlace[]> {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const opened: UmbraDesktopMediaPlace[] = [];
  new UmbContextProvider(element, UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT, {
    getHostElement: () => element,
    openInNewWindow: (place: UmbraDesktopMediaPlace) => opened.push(place) > 0,
  } as never).hostConnected();
  const host = new UmbElementControllerHost(element);
  host.hostConnected();
  const action = new UmbraDesktopOpenInNewWindowAction(host, { entityType, unique, meta: {} } as never);
  await action.execute();
  host.destroy();
  element.remove();
  return opened;
}

describe('Open in new window', () => {
  it('opens the folder in a new manager window', async () => {
    expect(await run('media', FOLDER)).to.deep.equal([{ kind: 'folder', unique: FOLDER }]);
  });

  it('opens Media in a new manager window from the root', async () => {
    expect(await run('media-root', null)).to.deep.equal([{ kind: 'root' }]);
  });
});
