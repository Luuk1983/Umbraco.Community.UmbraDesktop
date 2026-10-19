import { expect } from '@open-wc/testing';
import { clearTarget, lightTarget } from './light.js';
import type { UmbraDesktopDragWindowHandle } from './drag.controller.js';

/** A tree folder lit as a drop target: its own row only, not the folders inside it (owner's test, 2026-10-19). */

const ENGAGE = '11111111-1111-1111-1111-111111111111';
const JOURNEY = '22222222-2222-2222-2222-222222222222';

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A menu item as core draws one, in a shadow root of its own.
 * @param parent Where it goes.
 * @param unique Its folder's key.
 * @returns The menu item.
 */
function item(parent: Element | ShadowRoot, unique: string): HTMLElement {
  const host = document.createElement('umb-tree-item');
  parent.appendChild(host);
  const menuItem = document.createElement('uui-menu-item');
  menuItem.setAttribute('href', `section/media/workspace/media/edit/${unique}`);
  host.attachShadow({ mode: 'open' }).appendChild(menuItem);
  return menuItem;
}

/**
 * A window whose tree shows Engage, open, with Customer Journey inside it.
 * @returns The window handle and the two items.
 */
function treeWindow() {
  const tree = document.createElement('div');
  document.body.appendChild(tree);
  cleanup.push(() => tree.remove());
  const engage = item(tree.attachShadow({ mode: 'open' }), ENGAGE);
  const journey = item(engage, JOURNEY);
  const handle = { tree: () => tree, folder: () => undefined, setDrop: () => undefined } as unknown as UmbraDesktopDragWindowHandle;
  return { handle, engage, journey };
}

describe('a tree folder lit as a drop target', () => {
  it('is drawn as uui selects a row, which colours that row and none of the folders in it', () => {
    const { handle, engage, journey } = treeWindow();
    lightTarget({ kind: 'folder', unique: ENGAGE, via: 'tree', element: engage, window: handle }, false);
    const lit = [engage.hasAttribute('selected'), journey.hasAttribute('selected')];
    clearTarget(handle);
    expect([...lit, engage.hasAttribute('selected')]).to.deep.equal([true, false, false]);
  });

  it('moves to the next folder the drag is over, and is red where nothing would go', () => {
    const { handle, engage, journey } = treeWindow();
    lightTarget({ kind: 'folder', unique: ENGAGE, via: 'tree', element: engage, window: handle }, false);
    lightTarget({ kind: 'folder', unique: JOURNEY, via: 'tree', element: journey, window: handle }, true);
    const rule = (journey.getRootNode() as ShadowRoot).getElementById('umbradesktop-media-drop')?.textContent ?? '';
    expect([engage.hasAttribute('selected'), journey.hasAttribute('selected'), rule.includes('--uui-menu-item-background-color-selected')]).to.deep.equal([
      false,
      true,
      true,
    ]);
    clearTarget(handle);
  });

  it('is taken down when the drag moves on to the window’s own folder area', () => {
    const { handle, engage } = treeWindow();
    lightTarget({ kind: 'folder', unique: ENGAGE, via: 'tree', element: engage, window: handle }, false);
    lightTarget({ kind: 'window', unique: null, window: handle }, false);
    expect(engage.hasAttribute('selected')).to.equal(false);
    clearTarget(handle);
  });
});
