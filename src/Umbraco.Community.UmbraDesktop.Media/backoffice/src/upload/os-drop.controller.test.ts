import { expect } from '@open-wc/testing';
import { UmbraDesktopMediaOsDropController } from './os-drop.controller.js';
import type { UmbraDesktopDragWindowHandle } from '../drag/drag.controller.js';
import { UMBRADESKTOP_MEDIA_DRAG_TYPE } from '../drag/drag-session.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../operations/media-api.js';
import type { UmbraDesktopMediaPlace } from '../manager/location.js';
import type { UmbFileDropzoneDroppedItems } from '@umbraco-cms/backoffice/dropzone';

/** Files from the OS dropped on a manager window (design §6, plan task 6.7). */

const IMAGE = '11111111-1111-1111-1111-111111111111';
const ARCHIVE = '33333333-3333-3333-3333-333333333333';
const PEOPLE = '44444444-4444-4444-4444-444444444444';

const refs: Record<string, UmbraDesktopMediaRef> = {
  [IMAGE]: { unique: IMAGE, name: 'Banjo', parent: PEOPLE, mediaType: 'image', isFolder: false },
  [ARCHIVE]: { unique: ARCHIVE, name: 'Archive', parent: PEOPLE, mediaType: 'folder', isFolder: true },
  [PEOPLE]: { unique: PEOPLE, name: 'People', parent: null, mediaType: 'folder', isFolder: true },
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

/**
 * A manager window laid out for real, so the controller can hit-test it: a tree on the left with the
 * recycle bin, a folder area with two cards, and core's overlay covering it all, as core lays it out
 * during an OS file drag. The overlay records the resets core's own drop listener would make.
 * @param place What the window shows.
 * @returns The window and what it recorded.
 */
function managerWindow(place: UmbraDesktopMediaPlace) {
  const element = document.createElement('div');
  element.style.cssText = 'position: fixed; left: 0; top: 0; width: 600px; height: 400px; display: grid; grid-template-columns: 200px 1fr;';
  document.body.appendChild(element);
  const tree = document.createElement('div');
  const treeRoot = tree.attachShadow({ mode: 'open' });
  const bin = document.createElement('uui-menu-item');
  bin.setAttribute('href', 'section/umbradesktop/workspace/media-recycle-bin-root/edit/null');
  bin.style.cssText = 'display: block; height: 40px;';
  treeRoot.appendChild(bin);
  const folder = Object.assign(document.createElement('div'), {
    collection: () => ({ items: () => [], selection: { getSelection: () => [] } }),
  });
  const view = folder.attachShadow({ mode: 'open' });
  const cards = [IMAGE, ARCHIVE].map((key) => {
    const card = document.createElement('umb-entity-collection-item-card');
    card.setAttribute('href', `section/media/workspace/media/edit/${key}`);
    card.style.cssText = 'display: block; width: 120px; height: 120px; margin: 10px;';
    view.appendChild(card);
    return card;
  });
  element.append(tree, folder);
  // Core's overlay sits a shadow root deeper than the cards, inside the collection element, as in core.
  const collection = document.createElement('div');
  view.appendChild(collection);
  const overlay = document.createElement('umb-dropzone-media');
  overlay.style.cssText = 'position: fixed; left: 0; top: 0; width: 600px; height: 400px; z-index: 100; display: block;';
  collection.attachShadow({ mode: 'open' }).appendChild(overlay);
  const resets: string[] = [];
  const onCoreDrop = () => resets.push('reset');
  document.addEventListener('drop', onCoreDrop);
  let label: { lines: Array<{ key: string; args: unknown[] }>; refused: boolean } | undefined;
  const record: string[] = [];
  const handle: UmbraDesktopDragWindowHandle = {
    element,
    place: () => place,
    folder: () => folder as never,
    tree: () => tree,
    setDrop: (state) => record.push(`drop ${state}`),
    setLabel: (value) => (label = value),
    raise: () => record.push('raise'),
    selectWhenShown: () => undefined,
  };
  cleanup.push(() => {
    element.remove();
    document.removeEventListener('drop', onCoreDrop);
  });
  return { handle, cards, bin, overlay, folder, resets, record, label: () => label };
}

/**
 * The controller, recording what it uploads where.
 * @param windows The manager windows.
 * @returns What was uploaded.
 */
function controller(windows: UmbraDesktopDragWindowHandle[], access?: { root: boolean; starts: Set<string> }) {
  const uploads: Array<{ names: string[]; parent: string | null }> = [];
  const api = {
    item: async (unique: string) => ({ data: refs[unique] }),
    items: async (uniques: ReadonlyArray<string>) => ({ data: uniques.map((unique) => refs[unique]).filter(Boolean) }),
  } as unknown as UmbraDesktopMediaApi;
  const drop = new UmbraDesktopMediaOsDropController(
    {
      api,
      upload: async (items: UmbFileDropzoneDroppedItems, parent: string | null) => void uploads.push({ names: items.files.map((file) => file.name), parent }),
      access: () => access,
    },
    () => windows,
  );
  drop.start();
  cleanup.push(() => drop.stop());
  return { uploads };
}

/**
 * A drag of files from the OS.
 * @returns Its data.
 */
function osFiles(): DataTransfer {
  const data = new DataTransfer();
  data.items.add(new File(['x'], 'holiday.jpg', { type: 'image/jpeg' }));
  return data;
}

/**
 * Send a drag event where the browser would: at the topmost element under the point, core's overlay.
 * @param target The overlay.
 * @param type The event.
 * @param data The drag's data.
 * @param at Where.
 * @returns The event.
 */
function at(target: Element, type: string, data: DataTransfer, point: { x: number; y: number }) {
  const event = new DragEvent(type, { bubbles: true, composed: true, cancelable: true, dataTransfer: data, clientX: point.x, clientY: point.y });
  target.dispatchEvent(event);
  return event;
}

/**
 * The centre of an element.
 * @param element The element.
 * @returns The point.
 */
function centre(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

describe('files from the OS over a manager window', () => {
  it('names the folder the window shows over its open area, and leaves the drop there to core', async () => {
    const win = managerWindow({ kind: 'folder', unique: PEOPLE });
    const { uploads } = controller([win.handle]);
    const data = osFiles();
    const open = { x: 550, y: 350 };
    at(win.overlay, 'dragover', data, open);
    await tick();
    at(win.overlay, 'dragover', data, open);
    expect(win.label()?.lines).to.deep.equal([{ key: 'umbraDesktopMedia_uploadTo', args: ['People'] }]);
    const drop = at(win.overlay, 'drop', data, open);
    await tick();
    expect([drop.defaultPrevented, uploads.length, win.label()]).to.deep.equal([false, 0, undefined]);
  });

  it('finds a folder card under core\'s overlay, lights it, and uploads into it, putting core\'s overlay away', async () => {
    const win = managerWindow({ kind: 'folder', unique: PEOPLE });
    const { uploads } = controller([win.handle]);
    const data = osFiles();
    const card = centre(win.cards[1]);
    at(win.overlay, 'dragover', data, card);
    await tick();
    at(win.overlay, 'dragover', data, card);
    expect(win.label()?.lines).to.deep.equal([{ key: 'umbraDesktopMedia_uploadTo', args: ['Archive'] }]);
    expect(win.folder.shadowRoot!.getElementById('umbradesktop-media-drop')?.textContent).to.contain(ARCHIVE);
    const drop = at(win.overlay, 'drop', data, card);
    await tick();
    expect(drop.defaultPrevented).to.equal(true);
    expect(uploads).to.deep.equal([{ names: ['holiday.jpg'], parent: ARCHIVE }]);
    expect(win.resets.length, 'core\'s overlay was told the drag is over').to.equal(1);
    expect(win.folder.shadowRoot!.getElementById('umbradesktop-media-drop')?.textContent ?? '').to.equal('');
  });

  it('refuses the recycle bin', async () => {
    const win = managerWindow({ kind: 'folder', unique: PEOPLE });
    const { uploads } = controller([win.handle]);
    const data = osFiles();
    const bin = centre(win.bin);
    at(win.overlay, 'dragover', data, bin);
    await tick();
    at(win.overlay, 'dragover', data, bin);
    expect(win.label()?.refused).to.equal(true);
    const drop = at(win.overlay, 'drop', data, bin);
    await tick();
    expect([drop.defaultPrevented, uploads.length]).to.deep.equal([true, 0]);
  });

  it('refuses the Media root to a person without root access, even over core\u2019s own dropzone', async () => {
    const win = managerWindow({ kind: 'root' });
    const { uploads } = controller([win.handle], { root: false, starts: new Set([PEOPLE]) });
    const data = osFiles();
    const open = { x: 550, y: 350 };
    at(win.overlay, 'dragover', data, open);
    await tick();
    at(win.overlay, 'dragover', data, open);
    expect(win.label()).to.deep.include({ refused: true });
    expect(win.label()?.lines[0].key).to.equal('umbraDesktopMedia_refusedAccess');
    const drop = at(win.overlay, 'drop', data, open);
    await tick();
    expect([drop.defaultPrevented, uploads.length], 'kept from core\u2019s dropzone too').to.deep.equal([true, 0]);
  });

  it('opens a closed tree folder the files rest on, as a drag of items does', async () => {
    const win = managerWindow({ kind: 'folder', unique: PEOPLE });
    controller([win.handle]);
    const root = Object.assign(document.createElement('uui-menu-item'), { hasChildren: true, showChildren: false });
    root.setAttribute('href', 'section/umbradesktop/workspace/media-root/edit/null');
    root.style.cssText = 'display: block; height: 40px;';
    const caret = document.createElement('button');
    caret.id = 'caret-button';
    let opened = 0;
    caret.addEventListener('click', () => opened++);
    root.attachShadow({ mode: 'open' }).appendChild(caret);
    win.bin.before(root);
    const data = osFiles();
    const point = centre(root);
    // A real drag sends a dragover every few frames while the pointer rests.
    for (let step = 0; step < 10; step++) {
      at(win.overlay, 'dragover', data, point);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(opened).to.equal(1);
  });

  it('leaves the manager\'s own drags to the drag controller', async () => {
    const win = managerWindow({ kind: 'folder', unique: PEOPLE });
    controller([win.handle]);
    const data = new DataTransfer();
    data.setData(UMBRADESKTOP_MEDIA_DRAG_TYPE, JSON.stringify({ keys: [IMAGE], fromBin: false }));
    at(win.overlay, 'dragover', data, centre(win.cards[1]));
    await tick();
    expect(win.label()).to.equal(undefined);
  });

  it('takes the label down when the files leave', async () => {
    const win = managerWindow({ kind: 'folder', unique: PEOPLE });
    controller([win.handle]);
    const data = osFiles();
    at(win.overlay, 'dragover', data, { x: 550, y: 350 });
    await tick();
    at(win.overlay, 'dragover', data, { x: 550, y: 350 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(win.label()).to.equal(undefined);
  });
});
