import { expect } from '@open-wc/testing';
import { decodeDrag, draggedKeys, encodeDrag, isCopyDrag, UMBRADESKTOP_MEDIA_DRAG_TYPE } from './drag-session.js';
import { dropLabel } from './label.js';
import { targetAt } from './targets.js';

/** Dragging media between manager windows (design §4, plan tasks 5.3 and 5.4). */

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const F = '33333333-3333-3333-3333-333333333333';

describe('a drag', () => {
  it('carries the selection when the item pressed is selected, and just that item otherwise', () => {
    expect(draggedKeys(A, [A, B])).to.deep.equal([A, B]);
    expect(draggedKeys(A, [B])).to.deep.equal([A]);
    expect(draggedKeys(A, [])).to.deep.equal([A]);
  });

  it('copies with Ctrl, and with Option on a Mac', () => {
    expect(isCopyDrag({ ctrlKey: true, altKey: false, metaKey: false }, false)).to.equal(true);
    expect(isCopyDrag({ ctrlKey: false, altKey: true, metaKey: false }, false)).to.equal(false);
    expect(isCopyDrag({ ctrlKey: false, altKey: true, metaKey: false }, true)).to.equal(true);
    expect(isCopyDrag({ ctrlKey: true, altKey: false, metaKey: false }, true)).to.equal(false);
  });

  it('travels under a private type, and only its own payload is read back', () => {
    expect(UMBRADESKTOP_MEDIA_DRAG_TYPE).to.equal('application/x-umbradesktop-media');
    expect(decodeDrag(encodeDrag({ keys: [A], fromBin: false }))).to.deep.equal({ keys: [A], fromBin: false });
    expect(decodeDrag('not json')).to.equal(undefined);
    expect(decodeDrag(JSON.stringify({ keys: 'x' }))).to.equal(undefined);
  });
});

describe('the label', () => {
  it('says where a move goes, and how to copy instead', () => {
    expect(dropLabel({ kind: 'move', target: 'People', total: 1, going: 1 }, false)).to.deep.equal({
      lines: [{ key: 'umbraDesktopMedia_dragMove', args: ['People'] }, { key: 'umbraDesktopMedia_dragHoldToCopy', args: [] }],
      refused: false,
    });
  });

  it('names the Mac’s copy key on a Mac', () => {
    expect(dropLabel({ kind: 'move', target: 'People', total: 1, going: 1 }, true).lines[1].key).to.equal('umbraDesktopMedia_dragHoldToCopyMac');
  });

  it('says copy while copying, with no hint', () => {
    expect(dropLabel({ kind: 'copy', target: 'People', total: 2, going: 2 }, false).lines).to.deep.equal([
      { key: 'umbraDesktopMedia_dragCopy', args: ['People'] },
    ]);
  });

  it('says how many of how many go, and which one cannot and why', () => {
    expect(
      dropLabel({ kind: 'move', target: 'Design', total: 3, going: 2, notGoing: { name: 'Clip', reason: 'The folder does not allow this type' } }, false).lines,
    ).to.deep.equal([
      { key: 'umbraDesktopMedia_dragMoveSome', args: [2, 3, 'Design'] },
      { key: 'umbraDesktopMedia_dragCannot', args: ['Clip', 'The folder does not allow this type'] },
      { key: 'umbraDesktopMedia_dragHoldToCopy', args: [] },
    ]);
  });

  it('says only that the folder is out of reach, when it is: that is why for every item', () => {
    expect(dropLabel({ kind: 'move', target: 'Media', total: 2, going: 0, outOfReach: true }, false)).to.deep.equal({
      lines: [{ key: 'umbraDesktopMedia_refusedAccess', args: [] }],
      refused: true,
    });
  });

  it('is refused, with the reason, when nothing can go', () => {
    expect(dropLabel({ kind: 'move', target: 'Design', total: 1, going: 0, notGoing: { name: 'Clip', reason: 'No' } }, false)).to.deep.equal({
      lines: [{ key: 'umbraDesktopMedia_dragCannot', args: ['Clip', 'No'] }],
      refused: true,
    });
  });

  it('says the bin trashes and a drag out of the bin restores', () => {
    expect(dropLabel({ kind: 'trash', target: '', total: 1, going: 1 }, false).lines).to.deep.equal([{ key: 'umbraDesktopMedia_dragTrash', args: [] }]);
    expect(dropLabel({ kind: 'restore', target: 'People', total: 1, going: 1 }, false).lines).to.deep.equal([
      { key: 'umbraDesktopMedia_dragRestore', args: ['People'] },
    ]);
  });
});

describe('the target under the pointer', () => {
  /** A stand-in manager window showing a folder. */
  const windowShowing = (unique: string | null, kind: 'folder' | 'root' | 'bin' = unique ? 'folder' : 'root') => {
    const element = document.createElement('div');
    return { element, place: () => (kind === 'folder' ? { kind, unique: unique! } : { kind }) as never };
  };
  const card = (unique: string) => {
    const el = document.createElement('umb-entity-collection-item-card');
    el.setAttribute('href', `section/media/workspace/media/edit/${unique}`);
    return el;
  };
  const isFolder = (unique: string) => (unique === F ? true : unique === A ? false : undefined);

  it('is a folder card before the window it is in, so there is only ever one target', () => {
    const win = windowShowing(B);
    const folder = card(F);
    const target = targetAt([document.createElement('img'), folder, win.element], [win], isFolder);
    expect(target).to.deep.include({ kind: 'folder', unique: F, via: 'card' });
    expect(target?.window).to.equal(win);
  });

  it('is the window’s folder over a card that is not a folder', () => {
    const win = windowShowing(B);
    expect(targetAt([card(A), win.element], [win], isFolder)).to.deep.include({ kind: 'window', unique: B });
  });

  it('is the window over a card it does not know yet', () => {
    const win = windowShowing(null);
    expect(targetAt([card(B), win.element], [win], isFolder)).to.deep.include({ kind: 'window', unique: null });
  });

  it('is a tree folder, the Media root and the recycle bin in the tree', () => {
    const win = windowShowing(B);
    const treeItem = (href: string) => {
      const el = document.createElement('uui-menu-item');
      el.setAttribute('href', href);
      return el;
    };
    expect(targetAt([treeItem(`section/umbradesktop/workspace/media/edit/${F}`), win.element], [win], isFolder)).to.deep.include({ kind: 'folder', unique: F, via: 'tree' });
    expect(targetAt([treeItem('section/umbradesktop/workspace/media-root/edit/null'), win.element], [win], isFolder)).to.deep.include({ kind: 'folder', unique: null, via: 'tree' });
    expect(targetAt([treeItem('section/umbradesktop/workspace/media-recycle-bin-root/edit/null'), win.element], [win], isFolder)).to.deep.include({ kind: 'bin' });
  });

  it('is the recycle bin for a window showing it', () => {
    const win = windowShowing(null, 'bin');
    expect(targetAt([document.createElement('div'), win.element], [win], isFolder)).to.deep.include({ kind: 'bin' });
  });

  it('is nothing outside every manager window', () => {
    expect(targetAt([document.createElement('div'), document.body], [windowShowing(B)], isFolder)).to.equal(undefined);
  });
});
