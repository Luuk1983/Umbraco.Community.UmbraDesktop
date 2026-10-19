import { expect } from '@open-wc/testing';
import { itemAt } from './item-at.js';
import { rangeBetween } from './range.js';
import { neighbour } from './neighbour.js';
import { boxBetween, intersecting } from './box.js';
import { typeAhead, TYPEAHEAD_RESET_MS } from './typeahead.js';
import { keyIntent } from './keys.js';

/** The pure rules behind selecting in a manager window (#144, design §3, plan phase 3). */

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const D = '44444444-4444-4444-4444-444444444444';

describe('the item under a press', () => {
  it('is read off an element with an item, as core’s grid cards have', () => {
    const card = Object.assign(document.createElement('div'), { item: { unique: A, entityType: 'media' } });
    expect(itemAt([document.createElement('span'), card, document.body])).to.deep.equal({ unique: A, entityType: 'media' });
  });

  it('is read off a table row’s sortable id', () => {
    const row = document.createElement('div');
    row.setAttribute('data-sortable-id', B);
    expect(itemAt([document.createElement('span'), row])).to.deep.equal({ unique: B, entityType: 'media' });
  });

  it('is read off an edit link', () => {
    const link = document.createElement('a');
    link.setAttribute('href', `section/media/workspace/media/edit/${C}`);
    expect(itemAt([link])).to.deep.equal({ unique: C, entityType: 'media' });
  });

  it('takes the first match on the path, inside out', () => {
    const card = Object.assign(document.createElement('div'), { item: { unique: A, entityType: 'media' } });
    const row = document.createElement('div');
    row.setAttribute('data-sortable-id', B);
    expect(itemAt([card, row])?.unique).to.equal(A);
  });

  it('is nothing on empty space, and stops at the boundary it is given', () => {
    const boundary = document.createElement('div');
    const row = document.createElement('div');
    row.setAttribute('data-sortable-id', B);
    expect(itemAt([document.createElement('span')])).to.equal(undefined);
    expect(itemAt([document.createElement('span'), boundary, row], boundary)).to.equal(undefined);
  });
});

describe('a range', () => {
  const order = [A, B, C, D];
  it('runs from the anchor to the item, either way', () => {
    expect(rangeBetween(order, B, D)).to.deep.equal([B, C, D]);
    expect(rangeBetween(order, D, B)).to.deep.equal([B, C, D]);
  });
  it('is the item alone without an anchor in the order', () => {
    expect(rangeBetween(order, 'gone', C)).to.deep.equal([C]);
    expect(rangeBetween(order, undefined, C)).to.deep.equal([C]);
  });
  it('is nothing for an item not in the order', () => {
    expect(rangeBetween(order, A, 'gone')).to.deep.equal([]);
  });
});

describe('the next item in a direction', () => {
  const rect = (x: number, y: number, w = 100, h = 100) => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h });
  // A grid of three columns: A B C on the first row, D on the second.
  const grid = [
    { unique: A, rect: rect(0, 0) },
    { unique: B, rect: rect(110, 0) },
    { unique: C, rect: rect(220, 0) },
    { unique: D, rect: rect(0, 110) },
  ];

  it('goes along a row and wraps to the next', () => {
    expect(neighbour(grid, A, 'right')).to.equal(B);
    expect(neighbour(grid, C, 'right')).to.equal(D);
    expect(neighbour(grid, D, 'left')).to.equal(C);
  });

  it('goes down to the card below, or the nearest one on the row below', () => {
    expect(neighbour(grid, A, 'down')).to.equal(D);
    expect(neighbour(grid, C, 'down')).to.equal(D);
    expect(neighbour(grid, D, 'up')).to.equal(A);
  });

  it('stays put at an edge', () => {
    expect(neighbour(grid, A, 'up')).to.equal(A);
    expect(neighbour(grid, A, 'left')).to.equal(A);
    expect(neighbour(grid, D, 'down')).to.equal(D);
  });

  it('goes to the first and the last', () => {
    expect(neighbour(grid, C, 'first')).to.equal(A);
    expect(neighbour(grid, A, 'last')).to.equal(D);
  });

  it('starts at the first item when nothing has the focus', () => {
    expect(neighbour(grid, undefined, 'down')).to.equal(A);
    expect(neighbour([], undefined, 'down')).to.equal(undefined);
  });

  it('moves up and down a table, one row at a time', () => {
    const table = [A, B, C].map((unique, i) => ({ unique, rect: rect(0, i * 40, 600, 40) }));
    expect(neighbour(table, A, 'down')).to.equal(B);
    expect(neighbour(table, C, 'up')).to.equal(B);
  });
});

describe('the selection box', () => {
  it('spans its two corners whichever way it is dragged', () => {
    expect(boxBetween({ x: 50, y: 80 }, { x: 10, y: 20 })).to.deep.equal({ left: 10, top: 20, right: 50, bottom: 80 });
  });

  it('covers the items it touches, and not the ones it misses', () => {
    const items = [
      { unique: A, rect: { left: 0, top: 0, right: 100, bottom: 100 } },
      { unique: B, rect: { left: 110, top: 0, right: 210, bottom: 100 } },
      { unique: C, rect: { left: 0, top: 110, right: 100, bottom: 210 } },
    ];
    expect(intersecting({ left: 90, top: 90, right: 120, bottom: 95 }, items)).to.deep.equal([A, B]);
    expect(intersecting({ left: 101, top: 101, right: 109, bottom: 109 }, items)).to.deep.equal([]);
  });
});

describe('type-ahead', () => {
  const names = [
    { unique: A, name: 'Banjo' },
    { unique: B, name: 'Bowling Ball' },
    { unique: C, name: 'biker jacket' },
    { unique: D, name: 'Unicorn' },
  ];

  it('finds the first name starting with the letters typed, ignoring case', () => {
    const first = typeAhead({ buffer: '', at: 0 }, 'b', 1000, names, undefined);
    expect(first.match).to.equal(A);
    const second = typeAhead(first.state, 'o', 1200, names, first.match);
    expect(second.match).to.equal(B);
  });

  it('moves on to the next match when the same letter is typed again', () => {
    const first = typeAhead({ buffer: '', at: 0 }, 'b', 1000, names, undefined);
    const again = typeAhead(first.state, 'b', 1100, names, first.match);
    expect(again.match).to.equal(B);
    const third = typeAhead(again.state, 'b', 1200, names, again.match);
    expect(third.match).to.equal(C);
  });

  it('starts again after a pause', () => {
    const first = typeAhead({ buffer: '', at: 0 }, 'b', 1000, names, undefined);
    const later = typeAhead(first.state, 'u', 1000 + TYPEAHEAD_RESET_MS + 1, names, first.match);
    expect(later.match).to.equal(D);
    expect(later.state.buffer).to.equal('u');
  });

  it('finds nothing for letters no name starts with', () => {
    expect(typeAhead({ buffer: '', at: 0 }, 'z', 1000, names, A).match).to.equal(undefined);
  });
});

describe('a key', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

  it('opens, selects, renames and trashes', () => {
    expect(keyIntent(key({ key: 'Enter' }), false)).to.deep.equal({ kind: 'open' });
    expect(keyIntent(key({ key: ' ' }), false)).to.deep.equal({ kind: 'toggle' });
    expect(keyIntent(key({ key: 'F2' }), false)).to.deep.equal({ kind: 'rename' });
    expect(keyIntent(key({ key: 'Delete' }), false)).to.deep.equal({ kind: 'trash' });
  });

  it('trashes with Cmd+Backspace on a Mac, as the Finder does', () => {
    expect(keyIntent(key({ key: 'Backspace', metaKey: true }), true)).to.deep.equal({ kind: 'trash' });
    expect(keyIntent(key({ key: 'Backspace' }), false)).to.equal(undefined);
  });

  it('moves with the arrows, Home and End, and extends with Shift', () => {
    expect(keyIntent(key({ key: 'ArrowDown' }), false)).to.deep.equal({ kind: 'move', direction: 'down', extend: false });
    expect(keyIntent(key({ key: 'ArrowLeft', shiftKey: true }), false)).to.deep.equal({ kind: 'move', direction: 'left', extend: true });
    expect(keyIntent(key({ key: 'Home' }), false)).to.deep.equal({ kind: 'move', direction: 'first', extend: false });
    expect(keyIntent(key({ key: 'End', shiftKey: true }), false)).to.deep.equal({ kind: 'move', direction: 'last', extend: true });
  });

  it('selects all with the platform’s modifier, and clears with Esc', () => {
    expect(keyIntent(key({ key: 'a', ctrlKey: true }), false)).to.deep.equal({ kind: 'select-all' });
    expect(keyIntent(key({ key: 'a', metaKey: true }), true)).to.deep.equal({ kind: 'select-all' });
    expect(keyIntent(key({ key: 'a', ctrlKey: true }), true)?.kind, 'Ctrl+A on a Mac is not select all').to.not.equal('select-all');
    expect(keyIntent(key({ key: 'Escape' }), false)).to.deep.equal({ kind: 'clear' });
  });

  it('cuts, copies and pastes with the platform’s modifier', () => {
    expect(keyIntent(key({ key: 'x', ctrlKey: true }), false)).to.deep.equal({ kind: 'cut' });
    expect(keyIntent(key({ key: 'c', ctrlKey: true }), false)).to.deep.equal({ kind: 'copy' });
    expect(keyIntent(key({ key: 'v', ctrlKey: true }), false)).to.deep.equal({ kind: 'paste' });
    expect(keyIntent(key({ key: 'c', metaKey: true }), true)).to.deep.equal({ kind: 'copy' });
    expect(keyIntent(key({ key: 'C', ctrlKey: true, shiftKey: true }), false), 'Ctrl+Shift+C is something else').to.equal(undefined);
  });

  it('undoes with Ctrl+Z, Cmd+Z on a Mac, and leaves Shift with it alone', () => {
    expect(keyIntent(key({ key: 'z', ctrlKey: true }), false)).to.deep.equal({ kind: 'undo' });
    expect(keyIntent(key({ key: 'z', metaKey: true }), true)).to.deep.equal({ kind: 'undo' });
    expect(keyIntent(key({ key: 'Z', ctrlKey: true, shiftKey: true }), false)).to.equal(undefined);
  });

  it('types ahead with a printable character and no modifier', () => {
    expect(keyIntent(key({ key: 'b' }), false)).to.deep.equal({ kind: 'type', char: 'b' });
    expect(keyIntent(key({ key: 'b', ctrlKey: true }), false)).to.equal(undefined);
    expect(keyIntent(key({ key: 'b', altKey: true }), false)).to.equal(undefined);
  });

  it('takes the keys on a checkbox, a radio or a button, which nobody types into', () => {
    for (const type of ['checkbox', 'radio', 'button']) {
      const input = Object.assign(document.createElement('input'), { type });
      expect(keyIntent(key({ key: 'c', ctrlKey: true }), false, [input]), type).to.deep.equal({ kind: 'copy' });
    }
    const text = Object.assign(document.createElement('input'), { type: 'text' });
    expect(keyIntent(key({ key: 'c', ctrlKey: true }), false, [text])).to.equal(undefined);
  });

  it('ignores a key typed into a field', () => {
    const input = document.createElement('input');
    const event = key({ key: 'b' });
    expect(keyIntent(event, false, [input])).to.equal(undefined);
    expect(keyIntent(key({ key: 'Delete' }), false, [document.createElement('uui-input')])).to.equal(undefined);
  });
});
