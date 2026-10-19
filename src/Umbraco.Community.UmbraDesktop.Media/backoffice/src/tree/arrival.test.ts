import { expect } from '@open-wc/testing';
import { ARRIVAL_FLASH_MS, UmbraDesktopTreeArrival, ancestorChain } from './arrival.js';

/** A paste or drop into a tree folder, shown in the tree (owner's test, 2026-10-18). */

const PRODUCTS = '11111111-1111-1111-1111-111111111111';
const COPY = '22222222-2222-2222-2222-222222222222';

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A menu item as core draws one, with a caret that opens it as core's does.
 * @param parent Where it goes.
 * @param unique Its folder's key.
 * @returns The menu item and what its caret was asked.
 */
function item(parent: Element | ShadowRoot, unique: string) {
  const host = document.createElement('umb-tree-item');
  parent.appendChild(host);
  const menuItem = Object.assign(document.createElement('uui-menu-item'), { loading: false, hasChildren: false, showChildren: false });
  menuItem.setAttribute('href', `section/media/workspace/media/edit/${unique}`);
  const caret = document.createElement('button');
  caret.id = 'caret-button';
  const opened: string[] = [];
  caret.addEventListener('click', () => {
    menuItem.showChildren = true;
    opened.push(unique);
  });
  menuItem.attachShadow({ mode: 'open' }).appendChild(caret);
  host.attachShadow({ mode: 'open' }).appendChild(menuItem);
  return { menuItem, opened };
}

/**
 * A tree host with Products in it.
 * @returns The host, Products, and what was opened.
 */
function tree() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  cleanup.push(() => host.remove());
  const root = host.attachShadow({ mode: 'open' });
  const products = item(root, PRODUCTS);
  return { host, products: products.menuItem, opened: products.opened };
}

/**
 * Whether an item is lit: a rule for it in the shadow root it is drawn in.
 * @param menuItem The item.
 * @returns True when lit.
 */
const lit = (menuItem: Element) => !!(menuItem.getRootNode() as ShadowRoot).getElementById('umbradesktop-media-arrived')?.textContent?.includes(COPY);

describe('a paste into a tree folder', () => {
  it('shows the folder loading at once, until the paste is done', () => {
    const { host, products } = tree();
    const arrival = new UmbraDesktopTreeArrival(host);
    const done = arrival.start({ kind: 'folder', unique: PRODUCTS });
    const during = products.loading;
    done();
    expect([during, products.loading]).to.deep.equal([true, false]);
  });

  it('opens the folder once the folder copied into it shows, and lights the copy for a moment', async () => {
    const { host, products, opened } = tree();
    const arrival = new UmbraDesktopTreeArrival(host);
    const landing = arrival.land({ kind: 'folder', unique: PRODUCTS }, [COPY]);
    // Core reloads the folder after the paste: now it has an arrow, and once open, the copy.
    await wait(50);
    products.hasChildren = true;
    await wait(200);
    const copy = item(products, COPY).menuItem;
    await landing;
    const whileLit = lit(copy);
    await wait(ARRIVAL_FLASH_MS + 100);
    expect([opened, whileLit, lit(copy)]).to.deep.equal([[PRODUCTS], true, false]);
  });

  it('leaves an open folder open', async () => {
    const { host, products, opened } = tree();
    products.hasChildren = true;
    products.showChildren = true;
    item(products, COPY);
    await new UmbraDesktopTreeArrival(host).land({ kind: 'folder', unique: PRODUCTS }, [COPY]);
    expect(opened).to.deep.equal([]);
  });
});

describe('the tree opened to the window’s folder', () => {
  it('lists the folders above it, from the top down, whatever order the server gave them in', () => {
    const parents = new Map<string, string | null>([
      ['c', 'b'],
      ['a', null],
      ['b', 'a'],
    ]);
    expect(ancestorChain('c', parents)).to.deep.equal(['a', 'b', 'c']);
    expect(ancestorChain(null, parents)).to.deep.equal([]);
  });

  it('opens each folder above it in turn, as core draws them, and closes nothing', async () => {
    const { host, products, opened } = tree();
    const arrival = new UmbraDesktopTreeArrival(host);
    const opening = arrival.openTo([PRODUCTS, COPY]);
    await wait(50);
    products.hasChildren = true;
    await wait(200);
    // Core draws Products' children once it is open; the copy has its own children.
    const copy = item(products, COPY);
    copy.menuItem.hasChildren = true;
    await opening;
    expect([...opened, ...copy.opened]).to.deep.equal([PRODUCTS, COPY]);
  });
});

describe('the tree opened before core has drawn it', () => {
  it('waits for the Media root, opens it, then the folders below', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    cleanup.push(() => host.remove());
    const root = host.attachShadow({ mode: 'open' });
    const opening = new UmbraDesktopTreeArrival(host).openTo([PRODUCTS]);
    await wait(300);
    // Core draws the root a moment after the window opens.
    const media = Object.assign(document.createElement('uui-menu-item'), { hasChildren: true, showChildren: false });
    media.setAttribute('href', 'section/media/workspace/media-root/edit/null');
    const caret = document.createElement('button');
    caret.id = 'caret-button';
    const opened: string[] = [];
    caret.addEventListener('click', () => {
      media.showChildren = true;
      opened.push('media');
      const products = item(media, PRODUCTS);
      products.menuItem.hasChildren = true;
      products.menuItem.shadowRoot!.querySelector('#caret-button')!.addEventListener('click', () => opened.push('products'));
    });
    media.attachShadow({ mode: 'open' }).appendChild(caret);
    root.appendChild(media);
    await opening;
    expect(opened).to.deep.equal(['media', 'products']);
  });
});
