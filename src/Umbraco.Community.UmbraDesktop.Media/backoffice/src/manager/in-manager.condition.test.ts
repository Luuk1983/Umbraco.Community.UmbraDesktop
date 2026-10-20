import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbEntityContext } from '@umbraco-cms/backoffice/entity';
import { UmbraDesktopInMediaManagerCondition } from './in-manager.condition.js';
import { UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT } from './manager-window.context.js';

const FOLDER = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const IMAGE = '11111111-2222-3333-4444-555555555555';

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * Evaluate the condition on an element, the way core evaluates an action's conditions on the element
 * that shows the action.
 * @param options What surrounds the element.
 * @param options.inManager Whether a manager window is around it.
 * @param options.entity The entity it is for.
 * @param options.folder Whether the condition asks for a folder.
 * @param options.inTree Whether the element is in the window's tree, inside its host's shadow root.
 * @returns Whether the action is permitted, once the answer has settled.
 */
async function evaluate(options: { inManager: boolean; entity?: { type: string; unique: string | null }; folder?: boolean; inTree?: boolean }) {
  const outer = document.createElement('div');
  const inner = document.createElement('div');
  outer.appendChild(inner);
  if (options.inTree) {
    const tree = document.createElement('umbradesktop-media-tree-host');
    tree.attachShadow({ mode: 'open' }).appendChild(outer);
    document.body.appendChild(tree);
    cleanup.push(() => tree.remove());
  } else {
    document.body.appendChild(outer);
  }
  const outerHost = new UmbElementControllerHost(outer);
  const innerHost = new UmbElementControllerHost(inner);
  cleanup.push(() => {
    innerHost.destroy();
    outerHost.destroy();
    outer.remove();
  });
  if (options.inManager) {
    new UmbContextProvider(outer, UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT, {
      getHostElement: () => outer,
      isFolder: async (unique: string) => unique === FOLDER,
    } as never).hostConnected();
  }
  if (options.entity) {
    const entity = new UmbEntityContext(outerHost);
    entity.setEntityType(options.entity.type);
    entity.setUnique(options.entity.unique);
    outerHost.hostConnected();
  }
  let permitted = false;
  const condition = new UmbraDesktopInMediaManagerCondition(innerHost, {
    host: innerHost,
    config: { alias: 'Umbraco.Community.UmbraDesktop.Media.Condition.InMediaManager', folder: options.folder },
    onChange: (value) => (permitted = value),
  });
  innerHost.hostConnected();
  for (let tick = 0; tick < 10; tick++) await new Promise((resolve) => setTimeout(resolve, 5));
  return permitted && condition.permitted;
}

/**
 * Our own actions show only inside a manager window, so the Media section's menus stay exactly as
 * Umbraco ships them (design §1).
 */
describe('the in-manager condition', () => {
  it('permits inside a manager window', async () => {
    expect(await evaluate({ inManager: true })).to.equal(true);
  });

  it('refuses outside one, as in the Media section', async () => {
    expect(await evaluate({ inManager: false, entity: { type: 'media', unique: FOLDER } })).to.equal(false);
  });

  it('asked for a folder, permits a folder and the Media root, and refuses an item', async () => {
    expect(await evaluate({ inManager: true, folder: true, entity: { type: 'media', unique: FOLDER } })).to.equal(true);
    expect(await evaluate({ inManager: true, folder: true, entity: { type: 'media-root', unique: null } })).to.equal(true);
    expect(await evaluate({ inManager: true, folder: true, entity: { type: 'media', unique: IMAGE } })).to.equal(false);
  });

  /**
   * #158: everything the tree shows is a place, so a tree item's menu offers what a folder's does,
   * even for an image that holds items. Its card stays the item, with an item's menu.
   */
  it('asked for a folder, permits any item in the tree, since the tree shows places only', async () => {
    expect(await evaluate({ inManager: true, folder: true, inTree: true, entity: { type: 'media', unique: IMAGE } })).to.equal(true);
    expect(await evaluate({ inManager: true, folder: true, entity: { type: 'media', unique: IMAGE } }), 'on its card').to.equal(false);
  });
});
