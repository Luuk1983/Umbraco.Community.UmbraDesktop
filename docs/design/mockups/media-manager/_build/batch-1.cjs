// Batch 1 of the Media Manager mocks: opening it, two windows and dragging between them,
// selections and Ctrl to copy. Writes ../batch-1.html.
const fs = require('fs');
const path = require('path');
const K = require('./kit.cjs');
const { PRODUCTS, PEOPLE, FOLDERS, byId, manager, scene, ghost, cardRect, treeRect, menu, CORE_ITEM_MENU } = K;

const SINGLE = { x: 60, y: 40, w: 1120, h: 623 };
const LEFT = { x: 24, y: 24, w: 768, h: 623 };
const RIGHT = { x: 808, y: 24, w: 768, h: 760 };

const products = (o = {}) => manager({ ...SINGLE, title: 'Products', active: true, current: 'products', items: PRODUCTS, ...o });
const left = (o = {}) => manager({ ...LEFT, title: 'Products', active: true, current: 'products', items: PRODUCTS, ...o });
const right = (o = {}) => manager({ ...RIGHT, title: 'People', current: 'people', items: PEOPLE, ...o });
const tasks = (...labels) => labels.map(([label, active]) => ({ label, active }));
const sel = (...ids) => Object.fromEntries(ids.map((id) => [id, { selected: true }]));

const s1 = [];
{
  s1.push(
    scene({
      id: 's1a',
      title: '1a. The manager opens on a folder',
      lede: 'Media Manager in the launcher opens one window. The tree is on the left; everything to the right of it is Umbraco\'s own media collection, exactly as the spike rendered it.',
      wins: [products()],
      tasks: tasks(['Products', true]),
      notes: [
        [1, 150, 60, 'The window is named after its folder, and so is its taskbar button. No "Media Manager" prefix: with four windows open, the folder name is what tells them apart.'],
        [2, 286, 266, 'The folder tree: Media at the top, its folders, and the recycle bin pinned to the foot. The open folder is highlighted the way Umbraco highlights the current item. Clicking a folder opens it in this window.'],
        [3, 1140, 130, 'Umbraco\'s collection, untouched: Create, filter, view switcher, cards, the item menu on hover. We do not restyle any of it.'],
        [4, null, null, 'First open starts at Media. After that, the desktop\'s reopen-windows setting brings each window back at the folder and view it had.'],
      ],
    }),
  );

  const r = cardRect(SINGLE, 3);
  s1.push(
    scene({
      id: 's1b',
      title: '1b. A second window for a folder',
      lede: 'At Media, the folders show as core\'s folder cards. A folder\'s menu has one extra item, ours, at the top.',
      wins: [
        products({ title: 'Media', current: 'media', items: FOLDERS, state: { products: { hover: true } } }),
      ],
      tasks: tasks(['Media', true]),
      over: menu([['newWindow', 'Open in new window', true], ...CORE_ITEM_MENU], r.x + r.w - 66, r.y + 40),
      notes: [
        [1, r.x + r.w + 150, r.y + 58, '"Open in new window" is an entity action of ours, registered with a condition so it only shows inside the manager. The Media section\'s menus stay exactly as they are. The same item is on a folder\'s menu in the tree.'],
        [2, null, null, 'Middle-click on a folder card or a tree folder does the same, like a link in a browser. Opening Media Manager from the launcher while one is open also gives a new window, at Media.'],
        [3, r.x + 40, r.y + 100, 'A plain click on the folder opens it in this window, as core\'s click does in the Media section.'],
      ],
    }),
  );
}

const s2 = [];
{
  s2.push(
    scene({
      id: 's2a',
      title: '2a. Two folders side by side',
      lede: 'Any number of windows, each on its own folder. The narrower window still fits two columns of cards next to the tree.',
      wins: [right(), left()],
      tasks: tasks(['Products', true], ['People']),
      notes: [
        [1, 400, 44, 'Each window has its own folder, its own tree state and its own view.'],
        [2, 1180, 44, 'An inactive window turns quiet as every desktop window does. Nothing about the manager changes that.'],
        [3, 560, 975, 'One taskbar button per window.'],
      ],
    }),
  );

  const banjo = cardRect(LEFT, 1);
  const cx = 1150, cy = 470;
  s2.push(
    scene({
      id: 's2b',
      title: '2b. Dragging an item to the other window',
      lede: 'Banjo is picked up in Products and carried over the People window.',
      wins: [right({ dropAll: true }), left({ state: { banjo: { dim: true } } })],
      tasks: tasks(['Products', true], ['People']),
      over: ghost(cx, cy, { items: byId(PRODUCTS, 'banjo'), label: 'Move to People', hint: 'Hold Ctrl to copy' }),
      notes: [
        [1, cx - 80, cy - 40, 'What you drag: a thumbnail of the item, drawn by us as the drag image. The browser shows it slightly see-through.'],
        [2, cx + 220, cy + 46, 'A label under the pointer says what letting go will do, and how to change it. It switches live when you press the copy key: Ctrl on Windows and Linux, Option on a Mac, where it says "Hold Option to copy".'],
        [3, 1546, 300, 'The window you would drop into is outlined, folder area only. Its title bar does not activate while you drag.'],
        [4, banjo.cx, banjo.cy, 'The item stays where it is, faded, until you let go. Esc cancels.'],
      ],
    }),
  );

  const design = cardRect(RIGHT, 2);
  const dx = design.cx + 10, dy = design.cy - 10;
  s2.push(
    scene({
      id: 's2c',
      title: '2c. Dropping onto a folder card',
      lede: 'The other window is at Media. Over a folder card, the folder is the target, not the window.',
      wins: [
        right({ title: 'Media', current: 'media', items: FOLDERS, state: { design: { drop: true } } }),
        left({ state: { banjo: { dim: true } } }),
      ],
      tasks: tasks(['Products', true], ['Media']),
      over: ghost(dx, dy, { items: byId(PRODUCTS, 'banjo'), label: 'Move to Design', hint: 'Hold Ctrl to copy' }),
      notes: [
        [1, design.x + design.w - 16, design.y + 16, 'The folder under the pointer lights up and its icon opens. The window is not outlined, so there is only ever one target on screen.'],
        [2, null, null, 'Folder cards never open while you drag. Only a closed folder in the tree expands when you hover it (2d).'],
        [3, null, null, 'Dropping on a folder\'s own window area, or on the folder it already sits in, does nothing and the label says so.'],
      ],
    }),
  );

  const t = treeRect(SINGLE, 3);
  const tx = t.x + 110, ty = t.y + 20;
  s2.push(
    scene({
      id: 's2d',
      title: '2d. Dropping onto a folder in the tree',
      lede: 'Same window: Banjo dragged from the cards onto Design in its own tree.',
      wins: [products({ treeOpts: { current: 'products', drop: 'design' }, state: { banjo: { dim: true } } })],
      tasks: tasks(['Products', true]),
      over: ghost(tx, ty, { items: byId(PRODUCTS, 'banjo'), label: 'Move to Design', hint: 'Hold Ctrl to copy' }),
      notes: [
        [1, t.x + t.w + 14, t.y + 18, 'Every folder in the tree is a drop target, in this window and in the others. A collapsed folder with children expands when you hover it for a moment.'],
        [2, 134, 616, 'Dropping on Recycle bin trashes, through core\'s trash action, so the "do not delete when referenced" rule still applies. The label says "Move to Recycle bin".'],
      ],
    }),
  );

  const after = { ...RIGHT };
  s2.push(
    scene({
      id: 's2e',
      title: '2e. After the drop',
      lede: 'Banjo is in People now. The window you dropped on comes to the front with what you dropped selected.',
      wins: [
        manager({ ...LEFT, title: 'Products', current: 'products', items: PRODUCTS.filter((i) => i.id !== 'banjo') }),
        manager({ ...after, title: 'People', active: true, current: 'people', items: [...PEOPLE, ...byId(PRODUCTS, 'banjo')], scroll: 290, state: { banjo: { selected: true, flash: true } }, selectionBar: '1 of 7 selected' }),
      ],
      tasks: tasks(['Products'], ['People', true]),
      notes: [
        [1, 1110, 600, 'The moved item is selected and scrolled into view, so the next thing you do (Ctrl+Z, Delete, another drag) acts on it. Selected through core\'s own selection, which is why core\'s bar appears.'],
        [2, 600, 300, 'Products closes the gap. Both windows refresh, as the spike measured.'],
        [3, null, null, 'Undo and how it is announced is batch 4.'],
      ],
    }),
  );
}

const s3 = [];
{
  const three = sel('banjo', 'jumpsuit', 'unicorn');
  s3.push(
    scene({
      id: 's3a',
      title: '3a. Several items selected',
      lede: 'Three cards selected. Core\'s selection bar appears in its footer, as in the Media section.',
      wins: [products({ state: three, selectionBar: '3 of 8 selected' })],
      tasks: tasks(['Products', true]),
      notes: [
        [1, null, null, 'Core\'s rules, no double-click anywhere: a click opens the item, the checkbox selects, and once anything is selected core turns the cards select-only, so further clicks select. On top: Ctrl+click (Cmd on a Mac) adds or removes without opening, Shift+click selects a range, arrow keys move, Space selects, Enter opens.'],
        [2, 1140, 640, 'Core\'s bar: Clear selection, the count, Move to, Trash, and every bulk action another package registers. "Copy to" is ours, shown only in the manager, so copying never needs a modifier key.'],
      ],
    }),
  );

  const a = cardRect(SINGLE, 0), b = cardRect(SINGLE, 4);
  const box = { x: a.x - 14, y: a.y - 14, w: b.cx - a.x + 14, h: b.cy - a.y + 14 };
  s3.push(
    scene({
      id: 's3b',
      title: '3b. Selecting with a box',
      lede: 'Dragging from empty space (the padding, the gaps, below the last row) draws a selection box.',
      wins: [products({ state: sel('knitted', 'banjo', 'bowling', 'pingpong'), selectionBar: '4 of 8 selected' })],
      tasks: tasks(['Products', true]),
      over: `<div class="marquee" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"></div>${K.cursor(b.cx, b.cy)}`,
      notes: [
        [1, box.x + box.w + 16, box.y + box.h + 10, 'Every card the box touches is selected as it grows. Ctrl while boxing adds to what was selected. Core has no box selection, so this is ours, drawn over core\'s grid.'],
      ],
    }),
  );

  const lsel = { banjo: { selected: true, dim: true }, jumpsuit: { selected: true, dim: true }, unicorn: { selected: true, dim: true } };
  const cx = 1150, cy = 470;
  s3.push(
    scene({
      id: 's3c',
      title: '3c. Dragging the selection',
      lede: 'Pressing on any selected card and dragging takes the whole selection.',
      wins: [right({ dropAll: true }), left({ state: lsel, selectionBar: '3 of 8 selected' })],
      tasks: tasks(['Products', true], ['People']),
      over: ghost(cx, cy, { items: byId(PRODUCTS, 'banjo', 'jumpsuit', 'unicorn'), label: 'Move 3 items to People', hint: 'Hold Ctrl to copy' }),
      notes: [
        [1, cx + 70, cy - 70, 'A small stack with a count, the item you grabbed on top.'],
        [2, null, null, 'Pressing on an unselected card drags just that card and leaves the selection alone, as Explorer does.'],
      ],
    }),
  );

  s3.push(
    scene({
      id: 's3d',
      title: '3d. Ctrl to copy',
      lede: 'Same drag with Ctrl held. Only the pointer and the label change.',
      wins: [right({ dropAll: true }), left({ state: three, selectionBar: '3 of 8 selected' })],
      tasks: tasks(['Products', true], ['People']),
      over: ghost(cx, cy, { items: byId(PRODUCTS, 'banjo', 'jumpsuit', 'unicorn'), label: 'Copy 3 items to People', hint: 'Release Ctrl to move', copy: true }),
      notes: [
        [1, cx + 4, cy + 6, 'The pointer gets the operating system\'s copy badge.'],
        [2, cx + 238, cy + 46, 'The label says Copy, with a plus.'],
        [3, cardRect(LEFT, 1).cx, cardRect(LEFT, 1).cy, 'The originals do not fade, because they stay.'],
        [4, null, null, 'On a Mac the copy key is Option. Umbraco has no copy for media, so a copy is a new item made from the original\'s file with its properties copied over. That is slower than a move, so copying more than a handful runs in the transfer window (batch 3).'],
        [5, null, null, 'Ctrl+drag within the same folder makes duplicates next to the originals.'],
      ],
    }),
  );
}

const html = K.page({
  title: 'Media Manager mocks, batch 1',
  lede: `<p class="lede">Scenarios 1 to 3: opening the manager, two windows and dragging between them, selections and copying. Umbraco theme, at the spike's 1600 by 1000.</p>
<p class="lede">Inside each window, everything to the right of the tree is Umbraco's own media collection, drawn as it renders today with the real thumbnails from the spike. We do not change it. What these mocks design is everything around it: the tree, the windows, the drag feedback, and the few extra items we add.</p>
<div class="key"><span><span class="mk">1</span> a note, listed under the picture</span><span><span class="sw" style="background:#fff3e0;box-shadow:inset 3px 0 0 #e8573f"></span> an item that is ours, inside a core menu</span><span><span class="sw" style="background:#eef0fb;box-shadow:inset 0 0 0 2px #3544b1"></span> where a drop would land</span></div>`,
  sections: [
    `<section class="sc"><h2>1. Opening the manager</h2>${s1.join('')}</section>`,
    `<section class="sc"><h2>2. Two windows, and dragging between them</h2>${s2.join('')}</section>`,
    `<section class="sc"><h2>3. Selections, and Ctrl to copy</h2>${s3.join('')}</section>`,
  ],
  decided: [
    'Click opens, as in core. The checkbox, Ctrl or Cmd+click, Shift+click and the box select. No double-click anywhere.',
    'Modifier keys follow the platform: Ctrl on Windows and Linux, Cmd and Option on a Mac. "Copy to" in the selection bar copies without any modifier.',
    "The tree is Umbraco's own media tree, hosted, with its clicks taken over.",
    'A folder opens in a new window from its menu (ours, manager only), by middle-click, or by opening Media Manager from the launcher again.',
    'While dragging, only closed tree folders expand on hover. Folder cards never open by themselves.',
    'After a drop, the target window comes to the front with the dropped items selected.',
    'The drag look stays as drawn, to be checked once built.',
  ],
});

fs.writeFileSync(path.join(__dirname, '..', 'batch-1.html'), html);
console.log('batch-1.html', (html.length / 1024).toFixed(0) + ' KB');
