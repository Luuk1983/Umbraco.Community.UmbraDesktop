import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider, UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UMB_MEDIA_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/media';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { runFileTool } from './run-tool.js';

/** A controller standing in for an action, which is one. */
class ProbeAction extends UmbControllerBase {}

/** The desktop's window manager and the media service, by the aliases they publish. */
const WINDOWS = new UmbContextToken<UmbContextMinimal>('UmbraDesktopWindowManagerContext');
const MEDIA_SERVICE = new UmbContextToken<UmbContextMinimal>('UmbraDesktopMediaContext');

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A media workspace on a desktop, as the footer button and the property menu sit in: the workspace
 * names the item, the desktop opens windows and runs Optimize.
 * @param unique The workspace's item, or null for one not saved yet.
 * @returns The action's host, and what the desktop was asked.
 */
function inWorkspace(unique: string | null = 'banjo') {
  const opened: unknown[] = [];
  const optimized: unknown[] = [];
  const desktop = document.createElement('div');
  document.body.appendChild(desktop);
  const workspace = document.createElement('div');
  desktop.appendChild(workspace);
  const element = document.createElement('div');
  workspace.appendChild(element);
  const providers = [
    new UmbContextProvider(desktop, WINDOWS, { openApp: (alias: string, options: unknown) => (opened.push({ alias, options }), true), getHostElement: () => desktop } as never),
    new UmbContextProvider(desktop, MEDIA_SERVICE, { optimizeMedia: (request: unknown) => (optimized.push(request), new Promise(() => undefined)), getHostElement: () => desktop } as never),
    new UmbContextProvider(workspace, UMB_MEDIA_WORKSPACE_CONTEXT, {
      getEntityType: () => 'media',
      getUnique: () => unique,
      getName: () => 'Banjo',
      getHostElement: () => workspace,
    } as never),
  ];
  for (const provider of providers) provider.hostConnected();
  const host = new UmbElementControllerHost(element);
  host.hostConnected();
  cleanup.push(() => {
    host.destroy();
    for (const provider of providers) provider.destroy();
    desktop.remove();
  });
  return { host: new ProbeAction(host), opened, optimized };
}

/** #176: every footer button, fold-out item and property action runs its tool on the workspace's item. */
describe('runFileTool', () => {
  it('opens the Image Editor at the item, bringing its window forward if it is open', async () => {
    const { host, opened } = inWorkspace();
    await runFileTool(host, 'editImage');
    expect(opened).to.deep.equal([{ alias: 'Umbraco.Community.UmbraDesktop.Media.ImageEditor', options: { location: 'banjo', reuse: true } }]);
  });

  it('optimizes the item in a window named after it', async () => {
    const { host, optimized } = inWorkspace();
    await runFileTool(host, 'optimize');
    expect(optimized).to.deep.equal([{ items: ['banjo'], title: 'Banjo' }]);
  });

  it('does nothing for an item not saved yet', async () => {
    const { host, opened, optimized } = inWorkspace(null);
    await runFileTool(host, 'editImage');
    await runFileTool(host, 'optimize');
    expect(opened).to.deep.equal([]);
    expect(optimized).to.deep.equal([]);
  });
});
