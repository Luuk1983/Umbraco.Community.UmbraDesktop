import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { of } from '@umbraco-cms/backoffice/external/rxjs';
import './manager.element.js';
import type { UmbraDesktopMediaManagerElement } from './manager.element.js';
import type { UmbraDesktopMediaFolderHostElement } from './folder-host.element.js';
import type { UmbraDesktopMediaItem, UmbraDesktopMediaSource } from './media-source.js';
import { UMBRADESKTOP_MEDIA_MANAGER_APP } from './manager-window.context.js';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../context/media-manager.context.js';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbraDesktopDragWindowHandle } from '../drag/drag.controller.js';
import { fingerprint } from '../clipboard/os-image.js';
import type { UmbraDesktopImagePrint } from '../clipboard/os-image.js';
import { DROP_OUTLINE_PX } from '../drag/light.js';

const FOLDER = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const IMAGE = '11111111-2222-3333-4444-555555555555';
const OTHER_IMAGE = '22222222-3333-4444-5555-666666666666';
const IMAGE_TYPE = 'cc07b313-0843-4aa8-bbda-871c8da728c8';
/** Umbraco's Folder media type. */
const FOLDER_TYPE = 'f38bd2d7-65d0-48e6-95dc-87ce06ec2d3d';
/** An image with items under it, which a site's Structure settings can allow (#158). */
const PARENT_IMAGE = '66666666-7777-8888-9999-aaaaaaaaaaaa';
/** A folder in the tree, not the one the window shows. */
const TREE_FOLDER = '44444444-5555-6666-7777-888888888888';

/** A source with one folder and one image. */
const SOURCE: UmbraDesktopMediaSource = {
  item: async (unique) =>
    ({
      [FOLDER]: {
        unique: FOLDER,
        name: 'People',
        variants: [],
        mediaType: { unique: 'folder-type', icon: 'icon-folder', collection: { unique: 'list' } },
        parent: null,
      },
      [IMAGE]: {
        unique: IMAGE,
        name: 'Banjo',
        variants: [],
        mediaType: { unique: 'image-type', icon: 'icon-picture', collection: null },
        parent: null,
      },
      [PARENT_IMAGE]: {
        unique: PARENT_IMAGE,
        name: 'Banjo with notes',
        variants: [],
        mediaType: { unique: 'image-type', icon: 'icon-picture', collection: null },
        parent: null,
      },
      [OTHER_IMAGE]: {
        unique: OTHER_IMAGE,
        name: 'Unicorn',
        variants: [],
        mediaType: { unique: 'image-type', icon: 'icon-picture', collection: null },
        parent: null,
      },
    })[unique] as UmbraDesktopMediaItem | undefined,
  collectionConfig: async (unique) => ({ unique: unique ?? '' }),
  rename: async (unique, name) => {
    renamed.push([unique, name]);
    return true;
  },
};

/** What the stand-in source was asked to rename. */
const renamed: Array<[string, string]> = [];

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A manager window inside a stand-in desktop, recording what it tells the desktop.
 * @param location Where the window opens.
 * @returns The manager, its records and helpers.
 */
async function mounted(location?: string, context?: object) {
  const opened: Array<{ alias: string; location?: string }> = [];
  const titles: string[] = [];
  const locations: string[] = [];
  const reachedWindow: Array<{ prevented: boolean }> = [];
  const beside: Array<Record<string, unknown>> = [];
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position: fixed; inset: 0;';
  document.body.appendChild(wrapper);
  new UmbContextProvider(wrapper, 'UmbraDesktopWindowManagerContext', {
    getHostElement: () => wrapper,
    openApp: (alias: string, options?: { location?: string }) => {
      opened.push({ alias, location: options?.location });
      return true;
    },
  } as never).hostConnected();
  if (context) new UmbContextProvider(wrapper, UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, { getHostElement: () => wrapper, ...context } as never).hostConnected();
  wrapper.addEventListener('umbradesktop-app-title', (e) => titles.push((e as CustomEvent<{ title: string }>).detail.title));
  wrapper.addEventListener('umbradesktop-app-location', (e) => locations.push((e as CustomEvent<{ location: string }>).detail.location));
  wrapper.addEventListener('umbradesktop-open-attached', (e) => beside.push((e as CustomEvent<Record<string, unknown>>).detail));
  // Umbraco's router listens for link clicks on the window; nothing may reach it. Whatever does is
  // recorded as it arrives and then cancelled, so no test link can take the test page away.
  const onWindowClick = (e: Event) => {
    reachedWindow.push({ prevented: e.defaultPrevented });
    e.preventDefault();
  };
  window.addEventListener('click', onWindowClick);
  window.addEventListener('auxclick', onWindowClick);
  cleanup.push(() => {
    window.removeEventListener('click', onWindowClick);
    window.removeEventListener('auxclick', onWindowClick);
    wrapper.remove();
  });
  const manager = await fixture<UmbraDesktopMediaManagerElement>(
    html`<umbradesktop-media-manager .source=${SOURCE} .location=${location}></umbradesktop-media-manager>`,
    { parentNode: wrapper },
  );
  const folderHost = () => manager.shadowRoot!.querySelector('umbradesktop-media-folder-host') as UmbraDesktopMediaFolderHostElement;
  /** Waits for the manager to settle after an action. */
  const settle = async () => {
    for (let tick = 0; tick < 8; tick++) await new Promise((resolve) => setTimeout(resolve, 5));
    await manager.updateComplete;
  };
  /**
   * Click a link the way core renders one inside the window: inside the folder host's shadow root.
   * @param href The link.
   * @param init Which button, and modifiers.
   * @returns The click event, to see whether it was cancelled.
   */
  const clickLink = (href: string, init: MouseEventInit = {}) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = 'link';
    folderHost().shadowRoot!.appendChild(link);
    const type = init.button === 1 ? 'auxclick' : 'click';
    const event = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, ...init });
    link.dispatchEvent(event);
    link.remove();
    return event;
  };
  await settle();
  return { manager, folderHost, opened, titles, locations, reachedWindow, beside, settle, clickLink };
}

describe('a manager window', () => {
  it('opens on Media and names itself after it', async () => {
    const { folderHost, titles } = await mounted();
    expect(folderHost().place).to.deep.equal({ kind: 'root' });
    // No dictionary is loaded here, so core's key for Media comes back as it went in.
    expect(titles).to.deep.equal(['#sections_media']);
  });

  it('opens at the folder and view it was handed', async () => {
    const { folderHost, titles } = await mounted(`folder=${FOLDER}&view=Umb.CollectionView.Media.Table`);
    expect(folderHost().place).to.deep.equal({ kind: 'folder', unique: FOLDER });
    expect(folderHost().view).to.equal('Umb.CollectionView.Media.Table');
    expect(titles).to.deep.equal(['People']);
  });

  it('opens a folder in this window when its link is clicked, and never lets the router see the click', async () => {
    const { folderHost, clickLink, settle, titles, locations, reachedWindow } = await mounted();
    const click = clickLink(`/umbraco/section/media/workspace/media/edit/${FOLDER}`);
    await settle();
    expect(click.defaultPrevented).to.equal(true);
    expect(reachedWindow.length).to.equal(0);
    expect(folderHost().place).to.deep.equal({ kind: 'folder', unique: FOLDER });
    expect(titles.slice(-1)[0]).to.equal('People');
    expect(locations.slice(-1)[0]).to.equal(`folder=${FOLDER}`);
  });

  it('opens the Media root and the recycle bin from the tree’s links', async () => {
    const { folderHost, clickLink, settle } = await mounted(`folder=${FOLDER}`);
    clickLink('section/umbradesktop/workspace/media-recycle-bin-root/edit/null');
    await settle();
    expect(folderHost().place).to.deep.equal({ kind: 'bin' });
    clickLink('section/umbradesktop/workspace/media-root/edit/null');
    await settle();
    expect(folderHost().place).to.deep.equal({ kind: 'root' });
  });

  it('opens a folder in a new window on a middle-click', async () => {
    const { folderHost, clickLink, settle, opened, reachedWindow } = await mounted();
    const click = clickLink(`/umbraco/section/media/workspace/media/edit/${FOLDER}`, { button: 1 });
    await settle();
    expect(click.defaultPrevented, 'no browser tab either').to.equal(true);
    expect(reachedWindow.length).to.equal(0);
    expect(opened).to.deep.equal([{ alias: UMBRADESKTOP_MEDIA_MANAGER_APP, location: `folder=${FOLDER}` }]);
    expect(folderHost().place, 'this window stays where it was').to.deep.equal({ kind: 'root' });
  });

  it('switches only this window’s view from a view link', async () => {
    const { folderHost, clickLink, settle, locations, reachedWindow } = await mounted();
    folderHost().collectionReady({ interactionMemory: { setMemory: () => undefined }, view: undefined });
    (folderHost() as unknown as { views: () => unknown }).views = () => [
      { alias: 'Umb.CollectionView.Media.Grid', meta: { pathName: 'grid' } },
      { alias: 'Umb.CollectionView.Media.Table', meta: { pathName: 'table' } },
    ];
    const click = clickLink('/umbraco/section/umbradesktop/table');
    await settle();
    expect(click.defaultPrevented).to.equal(true);
    expect(reachedWindow.length).to.equal(0);
    expect(folderHost().view).to.equal('Umb.CollectionView.Media.Table');
    expect(locations.slice(-1)[0]).to.equal('folder=root&view=Umb.CollectionView.Media.Table');
  });

  it('opens an item beside the window, and never lets the router see the click', async () => {
    const { folderHost, clickLink, settle, reachedWindow, beside } = await mounted();
    const click = clickLink(`/umbraco/section/media/workspace/media/edit/${IMAGE}`);
    await settle();
    expect(click.defaultPrevented).to.equal(true);
    expect(reachedWindow.length).to.equal(0);
    expect(folderHost().place, 'an item is not a place').to.deep.equal({ kind: 'root' });
    expect(beside).to.deep.equal([
      { key: 'item', path: `/umbraco/section/media/workspace/media/edit/${IMAGE}`, name: 'Banjo', icon: 'icon-picture', floating: false },
    ]);
  });

  /**
   * #158: a place that is no folder (an image that holds items, here) is a virtual folder in the tree:
   * its tree node opens it in the window, where Umbraco's collection lists what it holds, and Ctrl+click
   * or a middle-click there opens it in a new window, as a folder's does. Its card stays the item.
   */
  it('opens a place that is no folder in the window from the tree, and in a new window on Ctrl+click', async () => {
    const { manager, folderHost, settle, beside, opened } = await mounted();
    const tree = manager.shadowRoot!.querySelector('umbradesktop-media-tree-host')!;
    const clickInTree = (init: MouseEventInit = {}) => {
      const link = document.createElement('a');
      link.href = `/umbraco/section/umbradesktop/workspace/media/edit/${PARENT_IMAGE}`;
      tree.shadowRoot!.appendChild(link);
      const click = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ...init });
      link.dispatchEvent(click);
      link.remove();
      return click;
    };
    const click = clickInTree();
    await settle();
    expect(click.defaultPrevented).to.equal(true);
    expect(folderHost().place).to.deep.equal({ kind: 'folder', unique: PARENT_IMAGE });
    expect(beside, 'nothing opens beside it').to.deep.equal([]);
    clickInTree({ ctrlKey: true });
    await settle();
    expect(opened).to.deep.equal([{ alias: UMBRADESKTOP_MEDIA_MANAGER_APP, location: `folder=${PARENT_IMAGE}` }]);
  });

  it('opens a place that is no folder beside the window from its card, as any item', async () => {
    const { clickLink, settle, folderHost, beside } = await mounted();
    clickLink(`/umbraco/section/media/workspace/media/edit/${PARENT_IMAGE}`);
    await settle();
    expect(folderHost().place).to.deep.equal({ kind: 'root' });
    expect(beside.map((each) => each.name)).to.deep.equal(['Banjo with notes']);
  });

  it('opens an item as a window on Shift-click', async () => {
    const { clickLink, settle, beside } = await mounted();
    clickLink(`/umbraco/section/media/workspace/media/edit/${IMAGE}`, { shiftKey: true });
    await settle();
    expect(beside[0]?.floating).to.equal(true);
  });

  it('opens the next item under the same key, so the desktop routes the same pane', async () => {
    const { clickLink, settle, beside } = await mounted();
    clickLink(`/umbraco/section/media/workspace/media/edit/${IMAGE}`);
    await settle();
    clickLink(`/umbraco/section/media/workspace/media/edit/${OTHER_IMAGE}`);
    await settle();
    expect(beside.map((each) => [each.key, each.path])).to.deep.equal([
      ['item', `/umbraco/section/media/workspace/media/edit/${IMAGE}`],
      ['item', `/umbraco/section/media/workspace/media/edit/${OTHER_IMAGE}`],
    ]);
  });

  it('creates a folder in the window, asking only its name, rather than opening core\u2019s page beside it', async () => {
    const asked: string[] = [];
    const { manager, settle, clickLink, beside } = await mounted(`folder=${FOLDER}`, {
      isFolderType: async (type: string) => type === FOLDER_TYPE,
      createFolder: async (parent: string | null, type: string, name: string) => (asked.push(`create ${name} of ${type} in ${parent}`), 'new-folder'),
    });
    manager.askFolderName = async () => 'Archive';
    clickLink(`/umbraco/section/media/workspace/media/create/parent/media/${FOLDER}/${FOLDER_TYPE}`);
    await settle();
    expect([asked, beside]).to.deep.equal([[`create Archive of ${FOLDER_TYPE} in ${FOLDER}`], []]);
  });

  it('opens at Media instead of a folder out of the person’s reach, as a window restored from before', async () => {
    const { folderHost, settle } = await mounted(`folder=${FOLDER}`, { canUse: async (unique: string | null) => unique === null });
    await settle();
    expect(folderHost().place).to.deep.equal({ kind: 'root' });
  });

  it('creates nothing in a folder out of the person’s reach, and says why', async () => {
    const said: string[] = [];
    const { settle, clickLink, beside } = await mounted('', {
      canUse: async (unique: string | null) => unique !== null,
      refuseAccess: (what: string) => said.push(what),
      isFolderType: async () => false,
    });
    clickLink(`/umbraco/section/media/workspace/media/create/parent/media-root/null/${IMAGE_TYPE}`);
    await settle();
    expect([beside, said.length]).to.deep.equal([[], 1]);
  });

  it('creates nothing when the name is not given', async () => {
    const asked: string[] = [];
    const { manager, settle, clickLink, beside } = await mounted(`folder=${FOLDER}`, {
      isFolderType: async () => true,
      createFolder: async () => (asked.push('created'), 'new-folder'),
    });
    manager.askFolderName = async () => undefined;
    clickLink(`/umbraco/section/media/workspace/media/create/parent/media/${FOLDER}/${FOLDER_TYPE}`);
    await settle();
    expect([asked, beside]).to.deep.equal([[], []]);
  });

  it('opens Create beside the window, in the open folder', async () => {
    const { clickLink, settle, beside, reachedWindow } = await mounted(`folder=${FOLDER}`);
    const create = `/umbraco/section/media/workspace/media/create/parent/media/${FOLDER}/${IMAGE_TYPE}`;
    const click = clickLink(create);
    await settle();
    expect(click.defaultPrevented).to.equal(true);
    expect(reachedWindow.length).to.equal(0);
    expect(beside).to.have.lengthOf(1);
    expect(beside[0]).to.deep.include({ key: 'item', path: create, floating: false });
  });

  it('stops any other backoffice link', async () => {
    const { clickLink, settle, reachedWindow } = await mounted();
    const click = clickLink('/umbraco/section/content');
    await settle();
    expect(click.defaultPrevented).to.equal(true);
    expect(reachedWindow.length).to.equal(0);
  });

  it('leaves a link off the backoffice to the browser', async () => {
    const { clickLink, settle, reachedWindow } = await mounted();
    clickLink('https://example.com/');
    await settle();
    expect(reachedWindow).to.deep.equal([{ prevented: false }]);
  });

  it('leaves a click core already handled alone', async () => {
    const { folderHost, settle } = await mounted();
    const link = document.createElement('a');
    link.href = `/umbraco/section/media/workspace/media/edit/${FOLDER}`;
    link.addEventListener('click', (e) => e.preventDefault());
    folderHost().shadowRoot!.appendChild(link);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
    await settle();
    expect(folderHost().place).to.deep.equal({ kind: 'root' });
  });
});

describe('the item open beside a manager window', () => {
  /**
   * Draw two cards inside the folder host the way core's grid view does: in a view's own shadow root.
   * @param host The folder host.
   * @returns The two cards, for IMAGE and OTHER_IMAGE.
   */
  function drawCards(host: HTMLElement): HTMLElement[] {
    const view = document.createElement('div');
    host.shadowRoot!.appendChild(view);
    const root = view.attachShadow({ mode: 'open' });
    return [IMAGE, OTHER_IMAGE].map((key) => {
      const card = document.createElement('umb-entity-collection-item-card');
      card.setAttribute('href', `section/media/workspace/media/edit/${key}`);
      card.style.display = 'block';
      root.appendChild(card);
      return card;
    });
  }

  const ringed = (el: Element) => getComputedStyle(el).outlineStyle !== 'none';

  it('covers the folder area with a tinted, bordered shade while a drag would drop there', async () => {
    const { manager } = await mounted();
    const shade = manager.shadowRoot!.querySelector('.drop-shade') as HTMLElement;
    const look = () => {
      const style = getComputedStyle(shade);
      return { shown: style.display !== 'none', tinted: style.backgroundColor !== 'rgba(0, 0, 0, 0)', border: style.borderTopWidth };
    };
    const before = look();
    manager.setAttribute('drop', 'target');
    const during = look();
    manager.setAttribute('drop', 'refused');
    const refused = look();
    expect([before.shown, during, refused.shown]).to.deep.equal([false, { shown: true, tinted: true, border: `${DROP_OUTLINE_PX}px` }, true]);
  });

  /**
   * #158: from a drag's start, the window's own place says whether it takes the items: tinted, or
   * washed out, with no border, which only the target under the pointer gets.
   */
  it('marks its place from a drag’s start, lighter than a drop there, and the drop wins', async () => {
    const { manager } = await mounted();
    const shade = manager.shadowRoot!.querySelector('.drop-shade') as HTMLElement;
    const look = () => {
      const style = getComputedStyle(shade);
      return { shown: style.display !== 'none', background: style.backgroundColor, border: style.borderTopWidth };
    };
    manager.setAttribute('mark', 'accepts');
    const accepts = look();
    manager.setAttribute('mark', 'refuses');
    const refuses = look();
    manager.setAttribute('drop', 'target');
    const dropped = look();
    expect([accepts.shown, accepts.border, refuses.shown]).to.deep.equal([true, '0px', true]);
    expect(refuses.background, 'washed out, not tinted').to.not.equal(accepts.background);
    expect(dropped.border).to.equal(`${DROP_OUTLINE_PX}px`);
  });

  it('covers only core’s view area with the drop shade, not its toolbar or selection bar', async () => {
    const { manager, folderHost } = await mounted();
    // Core's collection: its body layout, whose #main holds the view, between toolbar and bar.
    const layout = document.createElement('umb-body-layout');
    folderHost().shadowRoot!.appendChild(layout);
    await (layout as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
    let main = layout.shadowRoot?.querySelector('#main') as HTMLElement | null | undefined;
    if (!main) {
      main = document.createElement('div');
      main.id = 'main';
      layout.attachShadow({ mode: 'open' }).appendChild(main);
    }
    layout.style.cssText = 'display:block;position:absolute;left:30px;top:60px;width:300px;height:200px';
    main.style.cssText = 'display:block;height:200px';
    manager.setAttribute('drop', 'target');
    await manager.updateComplete;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const shade = manager.shadowRoot!.querySelector('.drop-shade')!.getBoundingClientRect();
    const area = main.getBoundingClientRect();
    expect([shade.top, shade.left, shade.width, shade.height].map(Math.round)).to.deep.equal([area.top, area.left, area.width, area.height].map(Math.round));
  });

  it('rings the card of the open item', async () => {
    const { manager, folderHost, settle } = await mounted();
    const cards = drawCards(folderHost());
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}/view/media` };
    await settle();
    expect(cards.map(ringed)).to.deep.equal([true, false]);
  });

  it('moves the ring when the pane routes to another item', async () => {
    const { manager, folderHost, settle } = await mounted();
    const cards = drawCards(folderHost());
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}` };
    await settle();
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${OTHER_IMAGE}` };
    await settle();
    expect(cards.map(ringed)).to.deep.equal([false, true]);
  });

  it('rings a card core draws after the item was opened', async () => {
    const { manager, folderHost, settle } = await mounted();
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}` };
    await settle();
    const cards = drawCards(folderHost());
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(cards.map(ringed)).to.deep.equal([true, false]);
  });

  it('takes the ring away when the pane closes', async () => {
    const { manager, folderHost, settle } = await mounted();
    const cards = drawCards(folderHost());
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}` };
    await settle();
    manager.attached = {};
    await settle();
    expect(cards.map(ringed)).to.deep.equal([false, false]);
  });

  it('names the pane after the item once a new item is saved and has a key', async () => {
    const { manager, settle, beside } = await mounted();
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}` };
    await settle();
    expect(beside).to.deep.equal([
      { key: 'item', path: `/umbraco/section/media/workspace/media/edit/${IMAGE}`, name: 'Banjo', icon: 'icon-picture', floating: false },
    ]);
  });

  it('does not ask again for an item it opened itself', async () => {
    const { manager, clickLink, settle, beside } = await mounted();
    clickLink(`/umbraco/section/media/workspace/media/edit/${IMAGE}`);
    await settle();
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}/view/media` };
    await settle();
    expect(beside).to.have.lengthOf(1);
  });
});

describe("core's own navigation inside a manager window", () => {
  /**
   * Announce a push the way the backoffice's router does before core's Create dialog changes the address.
   * @param url The address being pushed.
   * @returns Whether the push may go ahead.
   */
  const push = (url: string) =>
    window.dispatchEvent(new CustomEvent('willchangestate', { cancelable: true, detail: { url, eventName: 'pushstate' } }));

  it("opens the page core's Create dialog pushes beside the window it came from, instead of moving the desktop", async () => {
    const { manager, settle, beside } = await mounted(`folder=${FOLDER}`);
    manager.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    const create = `section/media/workspace/media/create/parent/media/${FOLDER}/${IMAGE_TYPE}`;
    expect(push(create), 'the push is cancelled').to.equal(false);
    await settle();
    expect(beside).to.have.lengthOf(1);
    expect(beside[0]).to.deep.include({ key: 'item', path: `/umbraco/${create}` });
  });

  it('leaves a push to anywhere else alone', async () => {
    const { manager } = await mounted();
    manager.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(push('section/settings')).to.equal(true);
  });
});

describe('keeping the window in step with the page beside it', () => {
  /**
   * Count the hosted collection's reloads.
   * @param host The folder host.
   * @returns A function giving the count.
   */
  function countReloads(host: UmbraDesktopFolderHostElementWithReload): () => number {
    let reloads = 0;
    host.reload = () => (reloads += 1);
    return () => reloads;
  }

  it('reloads when a new item beside it is saved, so its card shows', async () => {
    const { manager, folderHost, settle } = await mounted(`folder=${FOLDER}`);
    const reloads = countReloads(folderHost());
    manager.attached = { item: `/umbraco/section/media/workspace/media/create/parent/media/${FOLDER}/${IMAGE_TYPE}/invariant` };
    await settle();
    expect(reloads(), 'not while it is being created').to.equal(0);
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}/invariant` };
    await settle();
    expect(reloads()).to.equal(1);
  });

  it('reloads its folder through the desktop context when the page beside it saves, so the tree shows it too', async () => {
    const reloaded: Array<string | null> = [];
    const { manager, folderHost, settle } = await mounted(`folder=${FOLDER}`, { reloadFolder: (unique: string | null) => reloaded.push(unique) });
    const reloads = countReloads(folderHost());
    manager.attached = { item: `/umbraco/section/media/workspace/media/create/parent/media/${FOLDER}/${IMAGE_TYPE}/invariant` };
    await settle();
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}/invariant` };
    await settle();
    expect([reloaded, reloads()], 'core\u2019s reload event reaches the collection and the tree').to.deep.equal([[FOLDER], 0]);
  });

  it('reloads when the page moves on from an item or closes, so a saved name shows on its card', async () => {
    const { manager, folderHost, settle } = await mounted();
    const reloads = countReloads(folderHost());
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${IMAGE}/invariant` };
    await settle();
    expect(reloads(), 'opening reloads nothing').to.equal(0);
    manager.attached = { item: `/umbraco/section/media/workspace/media/edit/${OTHER_IMAGE}/invariant` };
    await settle();
    manager.attached = {};
    await settle();
    expect(reloads()).to.equal(2);
  });

  it('closes core’s Create menu once a type is chosen', async () => {
    const { folderHost, settle } = await mounted(`folder=${FOLDER}`);
    const menu = document.createElement('div');
    menu.setAttribute('popover', '');
    const link = document.createElement('a');
    link.href = `/umbraco/section/media/workspace/media/create/parent/media/${FOLDER}/${IMAGE_TYPE}`;
    link.textContent = 'Image';
    menu.appendChild(link);
    folderHost().shadowRoot!.appendChild(menu);
    menu.showPopover();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
    await settle();
    expect(menu.matches(':popover-open')).to.equal(false);
    menu.remove();
  });
});

/** The folder host, with the reload a test replaces. */
type UmbraDesktopFolderHostElementWithReload = UmbraDesktopMediaFolderHostElement & { reload: () => void };

describe('selecting and keys', () => {
  const C = '33333333-4444-5555-6666-777777777777';
  const ITEMS = [
    { unique: IMAGE, name: 'Banjo' },
    { unique: OTHER_IMAGE, name: 'Unicorn' },
    { unique: C, name: 'Bowling Ball' },
  ];

  /**
   * A manager window with a stand-in of core's collection in it: its items and selection, a grid view
   * of three cards side by side, and core's selection bar with its Trash button.
   * @returns The window, the cards, the selection and what was trashed.
   */
  async function selecting() {
    const mount = await mounted();
    const host = mount.folderHost();
    let selected: string[] = [];
    const selection = {
      getSelection: () => selected,
      setSelection: (keys: string[]) => (selected = [...keys]),
      select: (key: string) => (selected = [...new Set([...selected, key])]),
      deselect: (key: string) => (selected = selected.filter((each) => each !== key)),
      clearSelection: () => (selected = []),
    };
    host.collectionReady({ items: of(ITEMS), selection });
    const view = document.createElement('umb-media-grid-collection-view');
    view.style.cssText = 'display:block;position:relative;width:400px;height:300px';
    host.shadowRoot!.appendChild(view);
    const root = view.attachShadow({ mode: 'open' });
    const cards = ITEMS.map((item, i) => {
      const card = Object.assign(document.createElement('umb-entity-collection-item-card'), { item: { ...item, entityType: 'media' } });
      card.setAttribute('href', `section/media/workspace/media/edit/${item.unique}`);
      card.tabIndex = 0;
      card.style.cssText = `position:absolute;left:${i * 110}px;top:0;width:100px;height:100px`;
      const link = document.createElement('a');
      link.href = `/umbraco/section/media/workspace/media/edit/${item.unique}`;
      link.textContent = item.name;
      card.appendChild(link);
      root.appendChild(card);
      return card;
    });
    // Core's selection bar, with its Trash button: what Delete presses.
    const trashed: string[][] = [];
    const bar = Object.assign(document.createElement('div'), { manifest: { alias: 'Umb.EntityBulkAction.Media.Trash' } });
    const button = document.createElement('button');
    button.addEventListener('click', () => trashed.push([...selected]));
    bar.attachShadow({ mode: 'open' }).appendChild(button);
    host.shadowRoot!.appendChild(bar);
    return { ...mount, view, root, cards, selection, selected: () => selected, trashed };
  }

  const key = (target: EventTarget, init: KeyboardEventInit) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init }));
  const focusedIn = (root: ShadowRoot) => (root.activeElement as { item?: { unique: string } } | null)?.item?.unique;

  it('selects an item on Ctrl+click without opening it', async () => {
    const { cards, settle, beside, selected } = await selecting();
    const click = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ctrlKey: true });
    cards[0].querySelector('a')!.dispatchEvent(click);
    await settle();
    expect(click.defaultPrevented, 'no browser tab').to.equal(true);
    expect(selected()).to.deep.equal([IMAGE]);
    expect(beside).to.deep.equal([]);
  });

  it('extends the selection from the last item clicked on Shift+click, once something is selected', async () => {
    const { cards, settle, selected, selection } = await selecting();
    cards[0].querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ctrlKey: true }));
    await settle();
    // Select-only now, as core makes it: core toggles the card itself, and the window adds the range.
    selection.select(C);
    cards[2].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, shiftKey: true }));
    await settle();
    expect(selected()).to.have.members([IMAGE, OTHER_IMAGE, C]);
  });

  it('moves the focus with the arrows and selects nothing', async () => {
    const { manager, root, selected } = await selecting();
    key(manager, { key: 'ArrowRight' });
    expect(focusedIn(root), 'the first item when nothing had the focus').to.equal(IMAGE);
    key(manager, { key: 'ArrowRight' });
    expect(focusedIn(root)).to.equal(OTHER_IMAGE);
    expect(selected()).to.deep.equal([]);
  });

  it('extends the selection with Shift and an arrow', async () => {
    const { manager, selected } = await selecting();
    key(manager, { key: 'ArrowRight' });
    key(manager, { key: 'ArrowRight', shiftKey: true });
    expect(selected()).to.deep.equal([IMAGE, OTHER_IMAGE]);
  });

  it('selects the focused item with Space, and opens it beside with Enter', async () => {
    const { manager, settle, beside, selected } = await selecting();
    key(manager, { key: 'ArrowRight' });
    key(manager, { key: ' ' });
    expect(selected()).to.deep.equal([IMAGE]);
    key(manager, { key: ' ' });
    expect(selected()).to.deep.equal([]);
    key(manager, { key: 'Enter' });
    await settle();
    expect(beside.map((each) => each.path)).to.deep.equal([`/umbraco/section/media/workspace/media/edit/${IMAGE}`]);
  });

  it('opens with Enter even though core’s card takes Enter to select', async () => {
    const { cards, settle, beside, selected } = await selecting();
    // As uui's selectable card does: Space and Enter on the card toggle it, and cancel the key.
    cards[1].addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
    });
    cards[1].focus();
    key(cards[1], { key: 'Enter' });
    await settle();
    expect(beside.map((each) => each.path)).to.deep.equal([`/umbraco/section/media/workspace/media/edit/${OTHER_IMAGE}`]);
    expect(selected()).to.deep.equal([]);
  });

  it('leaves Enter on core’s own buttons alone', async () => {
    const { folderHost, settle, beside } = await selecting();
    const button = document.createElement('button');
    folderHost().shadowRoot!.appendChild(button);
    key(button, { key: 'Enter' });
    await settle();
    expect(beside).to.deep.equal([]);
  });

  it('selects everything with Ctrl+A, and nothing with Esc', async () => {
    const { manager, selected } = await selecting();
    key(manager, { key: 'a', ctrlKey: true });
    expect(selected()).to.deep.equal([IMAGE, OTHER_IMAGE, C]);
    key(manager, { key: 'Escape' });
    expect(selected()).to.deep.equal([]);
  });

  it('types ahead to the next name starting with the letters typed', async () => {
    const { manager, root } = await selecting();
    key(manager, { key: 'u' });
    expect(focusedIn(root)).to.equal(OTHER_IMAGE);
    key(manager, { key: 'b' });
    expect(focusedIn(root), 'u then b matches nothing, so the focus stays').to.equal(OTHER_IMAGE);
  });

  it('trashes the selection with Delete, through core’s own Trash button', async () => {
    const { manager, selection, settle, trashed } = await selecting();
    selection.setSelection([OTHER_IMAGE]);
    key(manager, { key: 'Delete' });
    await settle();
    expect(trashed).to.deep.equal([[OTHER_IMAGE]]);
  });

  it('trashes the focused item with Delete when nothing is selected', async () => {
    const { manager, settle, trashed } = await selecting();
    key(manager, { key: 'ArrowRight' });
    key(manager, { key: 'Delete' });
    await settle();
    expect(trashed).to.deep.equal([[IMAGE]]);
  });

  it('asks for a new name with F2 and saves it', async () => {
    const { manager, settle } = await selecting();
    const asked: string[] = [];
    manager.askName = async (current: string) => {
      asked.push(current);
      return 'Banjo two';
    };
    renamed.length = 0;
    key(manager, { key: 'ArrowRight' });
    key(manager, { key: 'F2' });
    await settle();
    expect(asked).to.deep.equal(['Banjo']);
    expect(renamed).to.deep.equal([[IMAGE, 'Banjo two']]);
  });

  it('ignores keys typed into a field', async () => {
    const { folderHost, selected } = await selecting();
    const input = document.createElement('input');
    folderHost().shadowRoot!.appendChild(input);
    key(input, { key: 'a', ctrlKey: true });
    expect(selected()).to.deep.equal([]);
  });

  /**
   * Press, drag and let go, as a pointer does.
   * @param target Where the press lands.
   * @param from Where it starts.
   * @param to Where it ends.
   */
  function drag(target: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
    const init = { bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true };
    target.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: from.x, clientY: from.y }));
    target.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2 }));
    target.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: to.x, clientY: to.y }));
  }

  it('draws a box from empty space and selects what it covers', async () => {
    const { manager, view, cards, selected } = await selecting();
    const space = view.getBoundingClientRect();
    const second = cards[1].getBoundingClientRect();
    const empty = document.createElement('div');
    empty.style.cssText = 'position:absolute;left:0;top:150px;width:400px;height:150px';
    view.shadowRoot!.appendChild(empty);
    drag(empty, { x: space.left + 5, y: space.top + 200 }, { x: second.left + 10, y: second.top + 10 });
    const box = manager.shadowRoot!.querySelector('umbradesktop-media-selection-box') as HTMLElement & { updateComplete: Promise<unknown> };
    await box.updateComplete;
    expect(!!box.shadowRoot!.querySelector('.box'), 'the box is drawn while dragging').to.equal(true);
    expect(selected()).to.deep.equal([IMAGE, OTHER_IMAGE]);
    empty.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerId: 1 }));
    await box.updateComplete;
    expect(!!manager.shadowRoot!.querySelector('umbradesktop-media-selection-box[active]'), 'and gone after').to.equal(false);
  });

  it('draws a box from the empty area below the cards, outside core’s view', async () => {
    const { manager, folderHost, cards, selected } = await selecting();
    // Core's collection layout: its view sits in `#main`, which fills the window below the toolbar
    // however few cards the view draws.
    const layout = document.createElement('umb-body-layout');
    folderHost().shadowRoot!.appendChild(layout);
    await (layout as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
    let main = layout.shadowRoot?.querySelector('#main') as HTMLElement | null | undefined;
    if (!main) {
      main = document.createElement('div');
      main.id = 'main';
      layout.attachShadow({ mode: 'open' }).appendChild(main);
    }
    layout.style.cssText = 'display:block;position:absolute;left:0;top:300px;width:400px;height:200px';
    main.style.cssText = 'display:block;height:200px';
    const space = main.getBoundingClientRect();
    const first = cards[0].getBoundingClientRect();
    drag(main, { x: space.left + 5, y: space.top + 100 }, { x: first.left + 10, y: first.top + 10 });
    expect(selected()).to.deep.equal([IMAGE]);
    main.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerId: 1 }));
    await manager.updateComplete;
  });

  it('opens a tree folder in a new window on Ctrl+click, and selects nothing', async () => {
    const { manager, folderHost, settle, selected, opened } = await selecting();
    const tree = manager.shadowRoot!.querySelector('umbradesktop-media-tree-host')!;
    // Core's tree item: it carries its item, as a card does, and links to the folder.
    const item = Object.assign(document.createElement('umb-media-tree-item'), { item: { unique: FOLDER, entityType: 'media' } });
    const link = document.createElement('a');
    link.href = `/umbraco/section/umbradesktop/workspace/media/edit/${FOLDER}`;
    item.appendChild(link);
    tree.shadowRoot!.appendChild(item);
    const click = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ctrlKey: true });
    link.dispatchEvent(click);
    await settle();
    expect(click.defaultPrevented, 'no browser tab').to.equal(true);
    expect(selected()).to.deep.equal([]);
    expect(opened).to.deep.equal([{ alias: UMBRADESKTOP_MEDIA_MANAGER_APP, location: `folder=${FOLDER}` }]);
    expect(folderHost().place, 'this window stays where it was').to.deep.equal({ kind: 'root' });
  });

  it('selects no text while the box is drawn, over core’s upload list or anything else', async () => {
    const { manager, view, cards } = await selecting();
    // Text selected before, as a press and drag across core's upload list leaves it.
    const label = document.createElement('span');
    label.textContent = 'Pasted image 2026.10.18';
    view.shadowRoot!.appendChild(label);
    getSelection()!.selectAllChildren(label);
    const space = view.getBoundingClientRect();
    const second = cards[1].getBoundingClientRect();
    const empty = document.createElement('div');
    empty.style.cssText = 'position:absolute;left:0;top:150px;width:400px;height:150px';
    view.shadowRoot!.appendChild(empty);
    drag(empty, { x: space.left + 5, y: space.top + 200 }, { x: second.left + 10, y: second.top + 10 });
    const during = [manager.style.userSelect, getSelection()!.toString()];
    empty.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerId: 1 }));
    expect([...during, manager.style.userSelect]).to.deep.equal(['none', '', '']);
  });

  it('clears the selection on a click on empty space, and keeps it when Ctrl or Shift is held', async () => {
    const { view, selected, selection } = await selecting();
    const empty = document.createElement('div');
    empty.style.cssText = 'position:absolute;left:0;top:150px;width:400px;height:150px';
    view.shadowRoot!.appendChild(empty);
    const space = view.getBoundingClientRect();
    const click = (init: PointerEventInit = {}) => {
      const at = { bubbles: true, composed: true, cancelable: true, button: 0, pointerId: 1, clientX: space.left + 5, clientY: space.top + 200, ...init };
      empty.dispatchEvent(new PointerEvent('pointerdown', at));
      empty.dispatchEvent(new PointerEvent('pointerup', at));
    };
    selection.setSelection([IMAGE, OTHER_IMAGE]);
    click({ ctrlKey: true });
    const withCtrl = selected();
    click({ shiftKey: true });
    const withShift = selected();
    click();
    expect([withCtrl, withShift, selected()]).to.deep.equal([[IMAGE, OTHER_IMAGE], [IMAGE, OTHER_IMAGE], []]);
  });

  it('starts no box from a press on a card', async () => {
    const { manager, cards, selected } = await selecting();
    const first = cards[0].getBoundingClientRect();
    drag(cards[0], { x: first.left + 5, y: first.top + 5 }, { x: first.left + 300, y: first.top + 80 });
    expect(!!manager.shadowRoot!.querySelector('umbradesktop-media-selection-box[active]')).to.equal(false);
    expect(selected()).to.deep.equal([]);
  });
});

describe('the keyboard after opening an item', () => {
  /**
   * A frame standing in for the page beside the window, which takes the focus as core's workspace
   * does when it loads.
   * @returns The frame.
   */
  async function pageFrame(): Promise<HTMLIFrameElement> {
    const frame = document.createElement('iframe');
    frame.src = 'about:blank';
    const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    document.body.appendChild(frame);
    await loaded;
    return frame;
  }

  it('stays in the window when the page beside it takes the focus as it loads', async () => {
    const { manager, folderHost, settle } = await mounted();
    const card = Object.assign(document.createElement('umb-entity-collection-item-card'), { item: { unique: IMAGE, entityType: 'media', name: 'Banjo' } });
    card.tabIndex = 0;
    folderHost().collectionReady({
      items: of([{ unique: IMAGE, name: 'Banjo' }]),
      selection: { getSelection: () => [], setSelection: () => undefined, select: () => undefined, deselect: () => undefined, clearSelection: () => undefined },
    });
    card.setAttribute('href', `section/media/workspace/media/edit/${IMAGE}`);
    folderHost().shadowRoot!.appendChild(card);
    card.focus();
    manager.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    manager.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await settle();
    const frame = await pageFrame();
    frame.focus();
    // A test tab in the background gets no focus events, so the one the browser sends is sent here.
    card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(folderHost().shadowRoot!.activeElement === card).to.equal(true);
    frame.remove();
  });

  it('lets the focus go when the person presses somewhere else', async () => {
    const { manager, folderHost, settle } = await mounted();
    const card = Object.assign(document.createElement('umb-entity-collection-item-card'), { item: { unique: IMAGE, entityType: 'media', name: 'Banjo' } });
    card.tabIndex = 0;
    folderHost().collectionReady({
      items: of([{ unique: IMAGE, name: 'Banjo' }]),
      selection: { getSelection: () => [], setSelection: () => undefined, select: () => undefined, deselect: () => undefined, clearSelection: () => undefined },
    });
    folderHost().shadowRoot!.appendChild(card);
    card.focus();
    manager.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    manager.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await settle();
    const frame = await pageFrame();
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    frame.focus();
    card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(folderHost().shadowRoot!.activeElement === card).to.equal(false);
    frame.remove();
  });
});

describe('the clipboard in a manager window', () => {
  const C = '33333333-4444-5555-6666-777777777777';

  /**
   * A manager window with a stand-in desktop context, core's collection and two cards.
   * @param selected What core's collection has selected.
   * @returns The window and what the context was asked.
   */
  async function clipboardWindow(selected: string[] = [], extra: object = {}) {
    const asked: string[] = [];
    const dragWindows: UmbraDesktopDragWindowHandle[] = [];
    let ours: UmbraDesktopImagePrint | undefined;
    const clipboard = new UmbObjectState<{ mode: 'cut' | 'copy'; items: Array<{ unique: string }> } | undefined>(undefined);
    const context = {
      clipboard: clipboard.asObservable(),
      getClipboard: () => clipboard.getValue(),
      api: { item: async (unique: string) => ({ data: { unique, name: unique, parent: FOLDER, mediaType: 'image', isFolder: false } }) },
      hold: (mode: 'cut' | 'copy', items: Array<{ unique: string }>) => {
        asked.push(`${mode} ${items.map((each) => each.unique).join(',')}`);
        clipboard.setValue({ mode, items });
      },
      empty: () => {
        asked.push('empty');
        clipboard.setValue(undefined);
      },
      paste: async (target: string | null) => asked.push(`paste into ${target}`),
      rename: async (item: { unique: string }, name: string) => asked.push(`rename ${item.unique} ${name}`),
      osPicture: async () => ours,
      startPicture: (unique: string) => asked.push(`picture ${unique}`),
      heldIsNewer: () => false,
      undo: async () => void asked.push('undo'),
      followUpload: (batch: { parent: string | null }) => asked.push(`follow upload into ${batch.parent}`),
      registerDragWindow: (handle: UmbraDesktopDragWindowHandle) => {
        dragWindows.push(handle);
        return () => dragWindows.splice(dragWindows.indexOf(handle), 1);
      },
      ...extra,
    };
    const mount = await mounted(`folder=${FOLDER}`, context);
    let selection = [...selected];
    mount.folderHost().collectionReady({
      items: of([
        { unique: IMAGE, name: 'Banjo' },
        { unique: C, name: 'Unicorn' },
      ]),
      selection: {
        getSelection: () => selection,
        setSelection: (keys: string[]) => (selection = keys),
        select: () => undefined,
        deselect: () => undefined,
        clearSelection: () => (selection = []),
      },
    });
    const view = document.createElement('div');
    mount.folderHost().shadowRoot!.appendChild(view);
    const root = view.attachShadow({ mode: 'open' });
    const cards = [IMAGE, C].map((unique) => {
      const card = document.createElement('umb-entity-collection-item-card');
      card.setAttribute('href', `section/media/workspace/media/edit/${unique}`);
      card.style.display = 'block';
      card.tabIndex = 0;
      root.appendChild(card);
      return card;
    });
    // Core's dropzone, as the hosted collection renders it: uui's file dropzone inside it takes the
    // `change` event a drop makes, which core stops before reading, as 17.7 does.
    const uploads: File[][] = [];
    const uploading = new UmbObjectState<Array<{ unique: string; parentUnique: string | null; status: string; progress: number }>>([]);
    const dropzone = Object.assign(document.createElement('div'), { progressItems: () => uploading.asObservable() });
    Object.defineProperty(dropzone, 'tagName', { value: 'UMB-DROPZONE-MEDIA' });
    const fileDropzone = document.createElement('div');
    Object.defineProperty(fileDropzone, 'tagName', { value: 'UUI-FILE-DROPZONE' });
    fileDropzone.addEventListener('change', (event) => {
      event.stopImmediatePropagation();
      uploads.push((event as CustomEvent<{ files: File[] }>).detail.files);
    });
    dropzone.attachShadow({ mode: 'open' }).appendChild(fileDropzone);
    root.appendChild(dropzone);
    const remember = (print: UmbraDesktopImagePrint | undefined) => (ours = print);
    // Core's dropzone asks for its contexts as it connects; that is how the window finds it.
    const announce = () => dropzone.dispatchEvent(new CustomEvent('umb:context-request', { bubbles: true, composed: true }));
    return { ...mount, asked, clipboard, cards, dragWindows, selection: () => selection, uploads, remember, root, uploading, announce };
  }

  const press = (target: EventTarget, init: KeyboardEventInit) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init }));

  it('copies the selection with Ctrl+C and cuts it with Ctrl+X', async () => {
    const { manager, settle, asked } = await clipboardWindow([IMAGE, C]);
    press(manager, { key: 'c', ctrlKey: true });
    await settle();
    press(manager, { key: 'x', ctrlKey: true });
    await settle();
    expect(asked).to.deep.equal([`copy ${IMAGE},${C}`, `cut ${IMAGE},${C}`]);
  });

  it('copies the item with the focus when nothing is selected', async () => {
    const { manager, settle, asked } = await clipboardWindow();
    press(manager, { key: 'ArrowRight' });
    press(manager, { key: 'c', ctrlKey: true });
    // The picture goes to the OS clipboard from the key itself, before the item is read: the browser
    // refuses a write that starts later (owner's test, 2026-10-18).
    expect(asked, 'in the key’s moment').to.deep.equal([`picture ${IMAGE}`]);
    await settle();
    expect(asked).to.deep.equal([`picture ${IMAGE}`, `copy ${IMAGE}`]);
  });

  /**
   * A folder in the window's tree, as core draws one: a menu item linking to it, with its link inside.
   * @param manager The window.
   * @param unique The folder's key.
   * @returns The menu item and its link, where a click puts the focus.
   */
  function treeFolder(manager: HTMLElement, unique: string) {
    const tree = manager.shadowRoot!.querySelector('umbradesktop-media-tree-host')!;
    const item = document.createElement('uui-menu-item');
    item.setAttribute('href', `section/media/workspace/media/edit/${unique}`);
    const link = document.createElement('a');
    link.href = `/umbraco/section/media/workspace/media/edit/${unique}`;
    (item.shadowRoot ?? item.attachShadow({ mode: 'open' })).appendChild(link);
    tree.shadowRoot!.appendChild(item);
    return { item, link };
  }

  it('marks the folder it shows in its tree', async () => {
    const { manager, settle } = await clipboardWindow();
    const { item } = treeFolder(manager, FOLDER);
    const other = treeFolder(manager, TREE_FOLDER).item;
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    await settle();
    expect([item.hasAttribute('active'), other.hasAttribute('active')]).to.deep.equal([true, false]);
  });

  it('copies and cuts a tree folder with the keys on it, not what the view has selected', async () => {
    const { manager, settle, asked } = await clipboardWindow([IMAGE, C]);
    const { link } = treeFolder(manager, TREE_FOLDER);
    press(link, { key: 'c', ctrlKey: true });
    await settle();
    press(link, { key: 'x', ctrlKey: true });
    await settle();
    expect(asked).to.deep.equal([`copy ${TREE_FOLDER}`, `cut ${TREE_FOLDER}`]);
  });

  it('pastes into a tree folder with Ctrl+V on it', async () => {
    const { manager, settle, asked } = await clipboardWindow();
    const { link } = treeFolder(manager, TREE_FOLDER);
    press(link, { key: 'v', ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await settle();
    expect(asked).to.deep.equal([`paste into ${TREE_FOLDER}`]);
  });

  it('shows a paste into a tree folder there: loading at once, until it is done', async () => {
    let finish: (result: unknown) => void = () => undefined;
    const { manager, settle } = await clipboardWindow([], { paste: () => new Promise((resolve) => (finish = resolve)) });
    const { item, link } = treeFolder(manager, TREE_FOLDER);
    press(link, { key: 'v', ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const during = (item as HTMLElement & { loading?: boolean }).loading;
    finish({ succeeded: [], failed: [], cancelled: false });
    await settle();
    expect([during, (item as HTMLElement & { loading?: boolean }).loading]).to.deep.equal([true, false]);
  });

  it('moves a tree folder to the recycle bin with Delete on it, after asking', async () => {
    const trashed: string[] = [];
    const { manager, settle, asked } = await clipboardWindow([IMAGE], {
      trash: async (items: Array<{ unique: string }>) => void trashed.push(...items.map((each) => each.unique)),
    });
    let answer = false;
    manager.confirmTrash = async (name) => {
      asked.push(`asked about ${name}`);
      return answer;
    };
    const { link } = treeFolder(manager, TREE_FOLDER);
    press(link, { key: 'Delete' });
    await settle();
    answer = true;
    press(link, { key: 'Delete' });
    await settle();
    expect([asked, trashed]).to.deep.equal([[`asked about ${TREE_FOLDER}`, `asked about ${TREE_FOLDER}`], [TREE_FOLDER]]);
  });

  it('leaves the view’s selection alone for the other keys pressed in the tree', async () => {
    const { manager, settle, asked, selection } = await clipboardWindow([IMAGE]);
    const { link } = treeFolder(manager, TREE_FOLDER);
    press(link, { key: 'a', ctrlKey: true });
    press(link, { key: 'Escape' });
    await settle();
    expect([asked, selection()]).to.deep.equal([[], [IMAGE]]);
  });

  it('pastes into the folder the window shows with Ctrl+V, when no paste event follows the key', async () => {
    const { manager, settle, asked } = await clipboardWindow();
    const key = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, composed: true, cancelable: true });
    manager.dispatchEvent(key);
    expect(key.defaultPrevented, 'the key lets the browser send its paste').to.equal(false);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await settle();
    expect(asked).to.deep.equal([`paste into ${FOLDER}`]);
  });

  /**
   * Paste into the window, as the browser does after Ctrl+V.
   * @param target Where the focus is.
   * @param files What the clipboard holds.
   * @param text Text it holds.
   * @returns The paste event.
   */
  const paste = (target: EventTarget, files: File[], text?: string) => {
    const data = new DataTransfer();
    for (const file of files) data.items.add(file);
    if (text) data.setData('text/plain', text);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, composed: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  /**
   * A one-colour PNG named as Chrome names every pasted picture.
   * @returns The file.
   */
  const screenshot = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 6;
    canvas.height = 6;
    canvas.getContext('2d')!.fillRect(0, 0, 6, 6);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    return new File([blob], 'image.png', { type: 'image/png' });
  };

  it('uploads a pasted screenshot into the folder through core\'s dropzone, named for when it was pasted', async () => {
    const { manager, cards, settle, uploads, asked } = await clipboardWindow();
    // The file is made first: the browser sends the paste straight after the key.
    const file = await screenshot();
    const press_ = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, composed: true, cancelable: true });
    cards[0].dispatchEvent(press_);
    const event = paste(cards[0], [file]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await settle();
    expect(event.defaultPrevented).to.equal(true);
    expect(uploads.length).to.equal(1);
    expect(uploads[0][0].name).to.match(/ \d{4}\.\d\d\.\d\d \d\d\.\d\d\.\d\d\.png$/);
    expect(asked.join(' | '), 'the key does not paste as well').to.equal('');
    void manager;
  });

  it('pastes what it holds when the paste carries only text', async () => {
    const { cards, settle, asked, uploads } = await clipboardWindow();
    paste(cards[0], [], 'hello');
    await settle();
    expect([asked, uploads.length]).to.deep.equal([[`paste into ${FOLDER}`], 0]);
  });

  it('pastes the item, not a new upload, when its own copied picture comes back', async () => {
    const { cards, settle, asked, uploads, remember } = await clipboardWindow();
    const file = await screenshot();
    remember(await fingerprint(file));
    paste(cards[0], [file]);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect([asked, uploads.length]).to.deep.equal([[`paste into ${FOLDER}`], 0]);
  });

  it('shows each batch of uploads in core\'s dropzone in the Transfers window', async () => {
    const { asked, uploading, announce } = await clipboardWindow();
    announce();
    uploading.setValue([{ unique: 'u', parentUnique: FOLDER, status: 'waiting', progress: 0 }]);
    expect(asked).to.deep.equal([`follow upload into ${FOLDER}`]);
  });

  it('says it is busy while core\'s dropzone in it uploads, so closing it asks first', async () => {
    const { manager, uploading, announce } = await clipboardWindow();
    const tasks: Array<{ state: string; completed?: number; total?: number }> = [];
    manager.parentElement!.addEventListener('umbradesktop-task', (event) => tasks.push((event as CustomEvent).detail));
    announce();
    uploading.setValue([
      { unique: 'u', parentUnique: FOLDER, status: 'waiting', progress: 0 },
      { unique: 'v', parentUnique: FOLDER, status: 'complete', progress: 100 },
    ]);
    expect(tasks[tasks.length - 1]).to.deep.include({ state: 'running', completed: 1, total: 2 });
    uploading.setValue([
      { unique: 'u', parentUnique: FOLDER, status: 'complete', progress: 100 },
      { unique: 'v', parentUnique: FOLDER, status: 'complete', progress: 100 },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(tasks[tasks.length - 1].state).to.equal('done');
  });

  it('undoes with Ctrl+Z, through the desktop context\'s one history', async () => {
    const { manager, settle, asked } = await clipboardWindow();
    press(manager, { key: 'z', ctrlKey: true });
    await settle();
    expect(asked).to.deep.equal(['undo']);
  });

  it('leaves a paste into a text field to the field', async () => {
    const { root, settle, asked, uploads } = await clipboardWindow();
    const field = document.createElement('input');
    root.appendChild(field);
    const event = paste(field, [await screenshot()], 'typed');
    await settle();
    expect([event.defaultPrevented, asked.length, uploads.length]).to.deep.equal([false, 0, 0]);
  });

  it('empties a cut with Esc once nothing is selected, and leaves a copy alone', async () => {
    const { manager, settle, asked, clipboard } = await clipboardWindow();
    clipboard.setValue({ mode: 'cut', items: [{ unique: IMAGE }] });
    press(manager, { key: 'Escape' });
    await settle();
    expect(asked).to.deep.equal(['empty']);
    clipboard.setValue({ mode: 'copy', items: [{ unique: IMAGE }] });
    press(manager, { key: 'Escape' });
    await settle();
    expect(asked).to.deep.equal(['empty']);
  });

  it('fades the cards of a cut, and shows them again once it is emptied', async () => {
    const { cards, clipboard, settle } = await clipboardWindow();
    const faded = (card: HTMLElement) => Number(getComputedStyle(card).opacity) < 1;
    clipboard.setValue({ mode: 'cut', items: [{ unique: IMAGE }] });
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cards.map(faded)).to.deep.equal([true, false]);
    clipboard.setValue(undefined);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cards.map(faded)).to.deep.equal([false, false]);
  });

  it('renames through the desktop context, so the rename can be undone', async () => {
    const { manager, settle, asked } = await clipboardWindow();
    manager.askName = async () => 'Banjo two';
    press(manager, { key: 'ArrowRight' });
    press(manager, { key: 'F2' });
    await settle();
    expect(asked).to.deep.equal([`rename ${IMAGE} Banjo two`]);
  });


  describe('dragging in a manager window', () => {
    it('registers with the desktop context for dragging, and leaves it when it closes', async () => {
      const { manager, dragWindows } = await clipboardWindow();
      expect(dragWindows.length).to.equal(1);
      expect(dragWindows[0].element === manager).to.equal(true);
      expect(dragWindows[0].place()).to.deep.equal({ kind: 'folder', unique: FOLDER });
      manager.remove();
      expect(dragWindows.length).to.equal(0);
    });

    it('outlines its folder area as a target, red when refused', async () => {
      const { manager, dragWindows } = await clipboardWindow();
      dragWindows[0].setDrop('target');
      expect(manager.getAttribute('drop')).to.equal('target');
      dragWindows[0].setDrop('refused');
      expect(manager.getAttribute('drop')).to.equal('refused');
      dragWindows[0].setDrop(undefined);
      expect(manager.hasAttribute('drop')).to.equal(false);
    });

    it('draws the label under the pointer, and takes it down', async () => {
      const { manager, dragWindows } = await clipboardWindow();
      dragWindows[0].setLabel({ lines: [{ key: 'umbraDesktopMedia_dragMove', args: ['Design'] }], refused: false, x: 100, y: 120 });
      await manager.updateComplete;
      const label = manager.shadowRoot!.querySelector('.drop-label');
      expect(!!label).to.equal(true);
      expect(label!.textContent).to.contain('umbraDesktopMedia_dragMove');
      dragWindows[0].setLabel(undefined);
      await manager.updateComplete;
      expect(!!manager.shadowRoot!.querySelector('.drop-label')).to.equal(false);
    });

    it('asks the desktop to bring it forward', async () => {
      const { manager, dragWindows } = await clipboardWindow();
      const asked: string[] = [];
      manager.parentElement!.addEventListener('umbradesktop-app-focus', () => asked.push('focus'));
      dragWindows[0].raise();
      expect(asked).to.deep.equal(['focus']);
    });

    it('selects what arrived once it shows it', async () => {
      const { dragWindows, selection, settle } = await clipboardWindow();
      dragWindows[0].selectWhenShown([IMAGE]);
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(selection()).to.deep.equal([IMAGE]);
    });
  });
});
