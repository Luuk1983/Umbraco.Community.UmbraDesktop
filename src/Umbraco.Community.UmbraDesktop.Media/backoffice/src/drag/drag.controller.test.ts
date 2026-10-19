import { expect } from '@open-wc/testing';
import { UmbraDesktopMediaDragController } from './drag.controller.js';
import type { UmbraDesktopDragWindowHandle } from './drag.controller.js';
import { UMBRADESKTOP_MEDIA_DRAG_TYPE } from './drag-session.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaRef } from '../operations/media-api.js';
import type { UmbraDesktopMediaPlace } from '../manager/location.js';

/** Dragging media between manager windows (design §4, plan tasks 5.6 to 5.9). */

const IMAGE = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const FOLDER = '33333333-3333-3333-3333-333333333333';
const PEOPLE = '44444444-4444-4444-4444-444444444444';
const DESIGN = '55555555-5555-5555-5555-555555555555';

const refs: Record<string, UmbraDesktopMediaRef> = {
  [IMAGE]: { unique: IMAGE, name: 'Banjo', parent: PEOPLE, mediaType: 'image', isFolder: false },
  [OTHER]: { unique: OTHER, name: 'Clip', parent: PEOPLE, mediaType: 'video', isFolder: false },
  [FOLDER]: { unique: FOLDER, name: 'Archive', parent: PEOPLE, mediaType: 'folder', isFolder: true },
  [PEOPLE]: { unique: PEOPLE, name: 'People', parent: null, mediaType: 'folder', isFolder: true },
  [DESIGN]: { unique: DESIGN, name: 'Design', parent: null, mediaType: 'folder', isFolder: true },
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/**
 * A stand-in manager window: a folder host whose view draws cards, and a tree, recording what the
 * controller asks of it.
 * @param place What it shows.
 * @param keys The cards it draws.
 * @param selected What its collection has selected.
 * @returns The handle and its record.
 */
function managerWindow(place: UmbraDesktopMediaPlace, keys: string[], selected: string[] = []) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const folder = Object.assign(document.createElement('div'), {
    collection: () => ({ items: () => [], selection: { getSelection: () => selected } }),
  });
  element.appendChild(folder);
  const view = document.createElement('div');
  folder.attachShadow({ mode: 'open' }).appendChild(view);
  const cards = keys.map((key) => {
    const card = document.createElement('umb-entity-collection-item-card');
    card.setAttribute('href', `section/media/workspace/media/edit/${key}`);
    card.style.display = 'block';
    const link = document.createElement('a');
    link.setAttribute('href', `section/media/workspace/media/edit/${key}`);
    link.textContent = key;
    card.appendChild(link);
    view.appendChild(card);
    return card;
  });
  const tree = document.createElement('div');
  element.appendChild(tree);
  const treeRoot = tree.attachShadow({ mode: 'open' });
  const treeItem = (href: string) => {
    const item = document.createElement('uui-menu-item');
    item.setAttribute('href', href);
    treeRoot.appendChild(item);
    return item;
  };
  const tree_ = {
    design: treeItem(`section/umbradesktop/workspace/media/edit/${DESIGN}`),
    bin: treeItem('section/umbradesktop/workspace/media-recycle-bin-root/edit/null'),
  };
  const record: string[] = [];
  const arrivals: string[] = [];
  let label: { lines: Array<{ key: string; args: unknown[] }>; refused: boolean } | undefined;
  const handle: UmbraDesktopDragWindowHandle = {
    element,
    place: () => place,
    folder: () => folder as never,
    tree: () => tree,
    setDrop: (state) => record.push(`drop ${state}`),
    setLabel: (value) => (label = value),
    raise: () => record.push('raise'),
    selectWhenShown: (selection) => record.push(`select ${selection.join(',')}`),
    arriving: (destination) => {
      arrivals.push(`arriving in ${destination}`);
      return () => arrivals.push('done');
    },
    landed: (destination, folders) => arrivals.push(`landed in ${destination}: ${folders.join(',')}`),
  };
  cleanup.push(() => element.remove());
  /**
   * Show a folder in the tree under the Media root, as core does once a person (or a resting drag)
   * opens the root: after the drag started, so the drag has not read it.
   */
  const openRoot = (unique: string) => {
    const root = treeItem('section/umbradesktop/workspace/media-root/edit/null');
    const child = document.createElement('uui-menu-item');
    child.setAttribute('href', `section/umbradesktop/workspace/media/edit/${unique}`);
    root.appendChild(child);
    return child;
  };
  return { handle, cards, tree: tree_, record, arrivals, label: () => label, folder, openRoot };
}

/**
 * The controller on a stand-in desktop context, recording the operations it asks for.
 * @param windows The manager windows.
 * @param allowed What every folder allows.
 * @returns The controller and its record.
 */
function controller(windows: UmbraDesktopDragWindowHandle[], allowed = ['image', 'video', 'folder']) {
  const ops: string[] = [];
  const result = (items: ReadonlyArray<UmbraDesktopMediaRef>) => ({
    succeeded: items.map((item) => ({ item, created: [`copy-of-${item.unique}`], affects: [] })),
    failed: [],
    cancelled: false,
  });
  const api = {
    item: async (unique: string) => ({ data: refs[unique] }),
    items: async (uniques: ReadonlyArray<string>) => ({ data: uniques.map((unique) => refs[unique]).filter(Boolean) }),
    allowedTypes: async () => ({ data: allowed }),
  } as unknown as UmbraDesktopMediaApi;
  const drag = new UmbraDesktopMediaDragController(
    {
      api,
      move: async (items, target) => (ops.push(`move ${items.map((i) => i.name).join(',')} to ${target}`), result(items)),
      copyTo: async (items, target) => (ops.push(`copy ${items.map((i) => i.name).join(',')} to ${target}`), result(items)),
      trash: async (items) => (ops.push(`trash ${items.map((i) => i.name).join(',')}`), result(items)),
      restore: async (items, target) => (ops.push(`restore ${items.map((i) => i.name).join(',')} to ${target}`), result(items)),
    },
    () => windows,
    false,
  );
  drag.start();
  cleanup.push(() => drag.stop());
  return { drag, ops };
}

/**
 * A drag event with a data transfer, as the browser sends it.
 * @param type The event.
 * @param init Its keys and position.
 * @param dataTransfer The drag's data, shared across the drag's events.
 * @returns The event.
 */
function dragEvent(type: string, dataTransfer: DataTransfer, init: DragEventInit = {}) {
  return new DragEvent(type, { bubbles: true, composed: true, cancelable: true, dataTransfer, ...init });
}

describe('starting a drag', () => {
  it('carries the item pressed, under our own type', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE, OTHER]);
    controller([source.handle]);
    const data = new DataTransfer();
    source.cards[0].querySelector('a')!.dispatchEvent(dragEvent('dragstart', data));
    expect(JSON.parse(data.getData(UMBRADESKTOP_MEDIA_DRAG_TYPE))).to.deep.equal({ keys: [IMAGE], fromBin: false });
  });

  it('carries no link of its own, so the browser offers nothing for one, such as Chrome’s split view', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    controller([source.handle]);
    const data = new DataTransfer();
    // What the browser puts on a drag that starts on a link, before the page sees it.
    data.setData('text/uri-list', `https://example.test/umbraco/section/media/workspace/media/edit/${IMAGE}`);
    data.setData('text/plain', `https://example.test/umbraco/section/media/workspace/media/edit/${IMAGE}`);
    source.cards[0].querySelector('a')!.dispatchEvent(dragEvent('dragstart', data));
    expect([...data.types]).to.deep.equal([UMBRADESKTOP_MEDIA_DRAG_TYPE]);
  });

  it('carries the whole selection when the item pressed is selected', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE, OTHER], [IMAGE, OTHER]);
    controller([source.handle]);
    const data = new DataTransfer();
    source.cards[0].dispatchEvent(dragEvent('dragstart', data));
    expect(JSON.parse(data.getData(UMBRADESKTOP_MEDIA_DRAG_TYPE)).keys).to.deep.equal([IMAGE, OTHER]);
  });

  it('leaves out selected items the window no longer shows, as after a move out of it', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE, OTHER], [IMAGE, OTHER, FOLDER]);
    controller([source.handle]);
    const data = new DataTransfer();
    source.cards[0].dispatchEvent(dragEvent('dragstart', data));
    expect(JSON.parse(data.getData(UMBRADESKTOP_MEDIA_DRAG_TYPE)).keys).to.deep.equal([IMAGE, OTHER]);
  });

  it('lets a press on any cell of a table row drag the row, and gives the row back after', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, []);
    controller([source.handle]);
    const row = document.createElement('uui-table-row') as unknown as HTMLElement;
    row.setAttribute('data-sortable-id', IMAGE);
    const cell = document.createElement('uui-table-cell') as unknown as HTMLElement;
    const name = document.createElement('a');
    name.setAttribute('href', `section/media/workspace/media/edit/${IMAGE}`);
    row.append(cell, name);
    source.folder.shadowRoot!.appendChild(row);
    const press = (target: Element, type: string) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true }));
    press(cell, 'pointerdown');
    const draggedFromCell = row.getAttribute('draggable');
    press(cell, 'pointerup');
    const afterRelease = row.hasAttribute('draggable');
    press(name, 'pointerdown');
    const draggedFromName = row.hasAttribute('draggable');
    expect([draggedFromCell, afterRelease, draggedFromName]).to.deep.equal(['true', false, false]);
  });

  it('lets a press on a card with no link drag the card, as core draws cards once anything is selected', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [], [IMAGE]);
    controller([source.handle]);
    // Core's card in select-only mode: its item, and no link to drag.
    const card = Object.assign(document.createElement('umb-entity-collection-item-card'), { item: { unique: IMAGE, entityType: 'media' } });
    const inner = document.createElement('div');
    card.appendChild(inner);
    source.folder.shadowRoot!.appendChild(card);
    const press = (target: Element, type: string) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true }));
    press(inner, 'pointerdown');
    const draggable = card.getAttribute('draggable');
    press(inner, 'pointerup');
    expect([draggable, card.hasAttribute('draggable')]).to.deep.equal(['true', false]);
  });

  it('leaves a drag that starts outside every manager window alone', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    controller([source.handle]);
    const outside = document.createElement('a');
    document.body.appendChild(outside);
    cleanup.push(() => outside.remove());
    const data = new DataTransfer();
    outside.dispatchEvent(dragEvent('dragstart', data));
    expect(data.types).to.not.include(UMBRADESKTOP_MEDIA_DRAG_TYPE);
  });
});

/**
 * Start dragging the first card of a window, and wait for the drag to have read what it carries.
 * @param source The window.
 * @returns The drag's data.
 */
async function startDrag(source: ReturnType<typeof managerWindow>) {
  const data = new DataTransfer();
  // Chrome ignores dropEffect on a DataTransfer made outside a real drag, so give it a plain one.
  Object.defineProperty(data, 'dropEffect', { value: 'none', writable: true });
  source.cards[0].dispatchEvent(dragEvent('dragstart', data));
  await tick();
  return data;
}

describe('dragging over a window', () => {
  it('outlines another window’s folder area, says where it goes, and accepts the drop', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    const target = managerWindow({ kind: 'folder', unique: DESIGN }, []);
    controller([source.handle, target.handle]);
    const data = await startDrag(source);
    target.handle.element.dispatchEvent(dragEvent('dragover', data));
    await tick();
    const over = dragEvent('dragover', data);
    target.handle.element.dispatchEvent(over);
    expect(over.defaultPrevented, 'the drop is accepted').to.equal(true);
    expect(data.dropEffect).to.equal('move');
    expect(target.record).to.include('drop target');
    expect(target.label()?.lines[0]).to.deep.equal({ key: 'umbraDesktopMedia_dragMove', args: ['Design'] });
  });

  it('lights a folder card instead of its window, so there is only one target', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE, FOLDER]);
    controller([source.handle]);
    const data = await startDrag(source);
    source.cards[1].dispatchEvent(dragEvent('dragover', data));
    await tick();
    source.cards[1].dispatchEvent(dragEvent('dragover', data));
    expect(source.record.filter((line) => line.startsWith('drop')).pop()).to.equal('drop undefined');
    const style = source.folder.shadowRoot!.getElementById('umbradesktop-media-drop');
    expect(style?.textContent).to.contain(FOLDER);
    expect(source.label()?.lines[0]).to.deep.equal({ key: 'umbraDesktopMedia_dragMove', args: ['Archive'] });
  });

  it('is no target in the folder the items are already in', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    controller([source.handle]);
    const data = await startDrag(source);
    source.handle.element.dispatchEvent(dragEvent('dragover', data));
    await tick();
    const over = dragEvent('dragover', data);
    source.handle.element.dispatchEvent(over);
    expect(over.defaultPrevented).to.equal(false);
    expect(source.label()).to.equal(undefined);
  });

  it('copies with Ctrl, which makes a duplicate in the items’ own folder', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    const { ops } = controller([source.handle]);
    const data = await startDrag(source);
    source.handle.element.dispatchEvent(dragEvent('dragover', data, { ctrlKey: true }));
    await tick();
    const over = dragEvent('dragover', data, { ctrlKey: true });
    source.handle.element.dispatchEvent(over);
    expect(over.defaultPrevented).to.equal(true);
    expect(data.dropEffect).to.equal('copy');
    expect(source.label()?.lines).to.deep.equal([{ key: 'umbraDesktopMedia_dragCopy', args: ['People'] }]);
    source.handle.element.dispatchEvent(dragEvent('drop', data, { ctrlKey: true }));
    await tick();
    expect(ops).to.deep.equal([`copy Banjo to ${PEOPLE}`]);
  });

  it('turns red and refuses when the folder allows none of the items, saying why', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [OTHER]);
    const target = managerWindow({ kind: 'folder', unique: DESIGN }, []);
    controller([source.handle, target.handle], ['image']);
    const data = await startDrag(source);
    target.handle.element.dispatchEvent(dragEvent('dragover', data));
    await tick();
    const over = dragEvent('dragover', data);
    target.handle.element.dispatchEvent(over);
    expect(over.defaultPrevented).to.equal(false);
    expect(target.record).to.include('drop refused');
    expect(target.label()).to.deep.include({ refused: true });
    expect(target.label()?.lines[0].args[0]).to.equal('Clip');
  });

  it('fades the originals while moving, and not while copying', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    controller([source.handle]);
    const data = await startDrag(source);
    expect(source.folder.shadowRoot!.getElementById('umbradesktop-media-dragging')?.textContent).to.contain(IMAGE);
    source.handle.element.dispatchEvent(dragEvent('dragover', data, { ctrlKey: true }));
    expect(source.folder.shadowRoot!.getElementById('umbradesktop-media-dragging')?.textContent ?? '').to.equal('');
  });
});

describe('dropping', () => {
  it('moves into the window’s folder, brings it forward and selects what arrived', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    const target = managerWindow({ kind: 'folder', unique: DESIGN }, []);
    const { ops } = controller([source.handle, target.handle]);
    const data = await startDrag(source);
    target.handle.element.dispatchEvent(dragEvent('dragover', data));
    await tick();
    const drop = dragEvent('drop', data);
    target.handle.element.dispatchEvent(drop);
    await tick();
    expect(drop.defaultPrevented).to.equal(true);
    expect(ops).to.deep.equal([`move Banjo to ${DESIGN}`]);
    expect(target.record).to.include('raise');
    expect(target.record).to.include(`select ${IMAGE}`);
  });

  it('moves into a tree folder', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    const { ops } = controller([source.handle]);
    const data = await startDrag(source);
    source.tree.design.dispatchEvent(dragEvent('dragover', data));
    await tick();
    source.tree.design.dispatchEvent(dragEvent('drop', data));
    await tick();
    expect(ops).to.deep.equal([`move Banjo to ${DESIGN}`]);
  });

  it('shows the drop on the folder: loading while it runs, then the folder that went into it', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [FOLDER]);
    controller([source.handle]);
    const data = await startDrag(source);
    source.tree.design.dispatchEvent(dragEvent('dragover', data));
    await tick();
    source.tree.design.dispatchEvent(dragEvent('drop', data));
    await tick();
    expect(source.arrivals).to.deep.equal([`arriving in ${DESIGN}`, 'done', `landed in ${DESIGN}: ${FOLDER}`]);
  });

  it('reads a tree folder that appeared during the drag, and drops into it rather than the root around it', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    const { ops } = controller([source.handle]);
    const data = await startDrag(source);
    const archive = source.openRoot(FOLDER);
    archive.dispatchEvent(dragEvent('drop', data));
    await tick();
    await tick();
    expect(ops).to.deep.equal([`move Banjo to ${FOLDER}`]);
  });

  it('names a tree folder that appeared during the drag once it has read it', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    controller([source.handle]);
    const data = await startDrag(source);
    const archive = source.openRoot(FOLDER);
    archive.dispatchEvent(dragEvent('dragover', data));
    await tick();
    archive.dispatchEvent(dragEvent('dragover', data));
    await tick();
    archive.dispatchEvent(dragEvent('dragover', data));
    expect(source.label()?.lines[0]).to.deep.equal({ key: 'umbraDesktopMedia_dragMove', args: ['Archive'] });
  });

  it('reads the items afresh for every drag, since a drop moves them', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    controller([source.handle]);
    let data = await startDrag(source);
    source.cards[0].dispatchEvent(dragEvent('dragend', data));
    const before = refs[IMAGE];
    refs[IMAGE] = { ...before, parent: DESIGN };
    try {
      data = await startDrag(source);
      source.handle.element.dispatchEvent(dragEvent('dragover', data));
      await tick();
      source.handle.element.dispatchEvent(dragEvent('dragover', data));
      expect(source.label()?.lines[0]).to.deep.equal({ key: 'umbraDesktopMedia_dragMove', args: ['People'] });
    } finally {
      refs[IMAGE] = before;
    }
  });

  it('trashes on the recycle bin', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    const { ops } = controller([source.handle]);
    const data = await startDrag(source);
    source.tree.bin.dispatchEvent(dragEvent('dragover', data));
    await tick();
    source.tree.bin.dispatchEvent(dragEvent('drop', data));
    await tick();
    expect(ops).to.deep.equal(['trash Banjo']);
  });

  it('restores out of the recycle bin into a folder', async () => {
    const source = managerWindow({ kind: 'bin' }, [IMAGE]);
    const target = managerWindow({ kind: 'folder', unique: DESIGN }, []);
    const { ops } = controller([source.handle, target.handle]);
    const data = await startDrag(source);
    expect(JSON.parse(data.getData(UMBRADESKTOP_MEDIA_DRAG_TYPE)).fromBin).to.equal(true);
    target.handle.element.dispatchEvent(dragEvent('dragover', data));
    await tick();
    expect(target.label()?.lines[0]).to.deep.equal({ key: 'umbraDesktopMedia_dragRestore', args: ['Design'] });
    target.handle.element.dispatchEvent(dragEvent('drop', data));
    await tick();
    expect(ops).to.deep.equal([`restore Banjo to ${DESIGN}`]);
  });

  it('clears everything it drew when the drag ends without a drop', async () => {
    const source = managerWindow({ kind: 'folder', unique: PEOPLE }, [IMAGE]);
    const target = managerWindow({ kind: 'folder', unique: DESIGN }, []);
    const { ops } = controller([source.handle, target.handle]);
    const data = await startDrag(source);
    target.handle.element.dispatchEvent(dragEvent('dragover', data));
    await tick();
    source.cards[0].dispatchEvent(dragEvent('dragend', data));
    expect(ops).to.deep.equal([]);
    expect(target.record[target.record.length - 1]).to.equal('drop undefined');
    expect(target.label()).to.equal(undefined);
    expect(source.folder.shadowRoot!.getElementById('umbradesktop-media-dragging')?.textContent ?? '').to.equal('');
  });
});
