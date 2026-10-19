import { expect } from '@open-wc/testing';
import { UmbraDesktopTreeCurrent, treePlaceAt } from './current-folder.js';

/** The window's folder, marked in its tree as core marks the Media section's (design §17). */

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * A menu item as core's tree draws one, in a shadow root of its own, as each tree item has.
 * @param parent Where it goes.
 * @param href Its link.
 * @returns The menu item.
 */
function item(parent: Element | ShadowRoot, href: string): HTMLElement {
  const host = document.createElement('umb-tree-item');
  parent.appendChild(host);
  const menuItem = document.createElement('uui-menu-item');
  menuItem.setAttribute('href', href);
  host.attachShadow({ mode: 'open' }).appendChild(menuItem);
  return menuItem;
}

/**
 * A tree host with the Media root, two folders (B inside A) and the recycle bin.
 * @returns The host and its items.
 */
function tree() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  cleanup.push(() => host.remove());
  const root = host.attachShadow({ mode: 'open' });
  const media = item(root, 'section/media/workspace/media-root/edit/null');
  const a = item(media, `section/media/workspace/media/edit/${A}`);
  const b = item(a, `section/media/workspace/media/edit/${B}`);
  const bin = item(root, 'section/media/workspace/media-recycle-bin-root/edit/null');
  return { host, media, a, b, bin };
}

const marked = (items: Record<string, Element>) => Object.entries(items).filter(([, el]) => el.hasAttribute('active')).map(([name]) => name);

describe('the window’s folder in the tree', () => {
  it('is marked, and nothing else is', async () => {
    const { host, ...items } = tree();
    const current = new UmbraDesktopTreeCurrent(host);
    cleanup.push(() => current.stop());
    current.show({ kind: 'folder', unique: B });
    await frame();
    expect(marked(items)).to.deep.equal(['b']);
  });

  it('moves with the window, to a folder, the Media root or the recycle bin', async () => {
    const { host, ...items } = tree();
    const current = new UmbraDesktopTreeCurrent(host);
    cleanup.push(() => current.stop());
    const seen: string[][] = [];
    for (const place of [{ kind: 'folder', unique: A }, { kind: 'root' }, { kind: 'bin' }] as const) {
      current.show(place);
      await frame();
      seen.push(marked(items));
    }
    expect(seen).to.deep.equal([['a'], ['media'], ['bin']]);
  });

  it('is marked when core draws it later, as when its parent opens', async () => {
    const { host, b } = tree();
    const current = new UmbraDesktopTreeCurrent(host);
    cleanup.push(() => current.stop());
    const C = '33333333-3333-3333-3333-333333333333';
    current.show({ kind: 'folder', unique: C });
    await frame();
    const c = item(b, `section/media/workspace/media/edit/${C}`);
    await frame();
    expect(c.hasAttribute('active')).to.equal(true);
  });
});

describe('a press on a tree folder’s name or icon', () => {
  it('goes through to uui’s link, which Chrome drags, as core draws each item', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    cleanup.push(() => host.remove());
    const root = host.attachShadow({ mode: 'open' });
    const current = new UmbraDesktopTreeCurrent(host);
    cleanup.push(() => current.stop());
    current.show({ kind: 'root' });
    await frame();
    // Core's media tree item, drawn after the window opened: its name and icon, slotted into uui's link.
    const treeItem = document.createElement('umb-media-tree-item');
    root.appendChild(treeItem);
    const itemRoot = treeItem.attachShadow({ mode: 'open' });
    const menuItem = document.createElement('uui-menu-item');
    const name = Object.assign(document.createElement('span'), { id: 'label' });
    const icon = Object.assign(document.createElement('div'), { id: 'icon-container' });
    menuItem.append(name, icon);
    itemRoot.appendChild(menuItem);
    await frame();
    expect([getComputedStyle(name).pointerEvents, getComputedStyle(icon).pointerEvents]).to.deep.equal(['none', 'none']);
  });
});

describe('the tree folder a key is pressed on', () => {
  it('is the menu item on the key’s path, as a folder, the Media root or the recycle bin', () => {
    const { a, media, bin } = tree();
    const link = document.createElement('a');
    a.shadowRoot?.appendChild(link) ?? a.attachShadow({ mode: 'open' }).appendChild(link);
    expect(treePlaceAt([link, a.shadowRoot!, a])).to.deep.equal({ kind: 'folder', unique: A });
    expect(treePlaceAt([media])).to.deep.equal({ kind: 'root' });
    expect(treePlaceAt([bin])).to.deep.equal({ kind: 'bin' });
    expect(treePlaceAt([document.createElement('div')])).to.equal(undefined);
  });
});
