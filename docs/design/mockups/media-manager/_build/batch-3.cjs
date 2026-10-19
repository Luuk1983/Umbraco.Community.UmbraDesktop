// Batch 3 of the Media Manager mocks: opening an item in the pane, the unsaved-changes guard, the
// pane in a window with no room, several items selected, Create, and a view per window.
// Writes ../batch-3.html.
const fs = require('fs');
const path = require('path');
const K = require('./kit.cjs');
const { PRODUCTS, PEOPLE, manager, win, scene, cardRect, menu, workspace, itemPane, dialog, ic } = K;

const PANE_W = 600;
const WIDE = { x: 30, y: 30, w: 1540, h: 623 };
const CARDS = { ...WIDE, w: WIDE.w - PANE_W };
const SINGLE = { x: 60, y: 40, w: 1120, h: 623 };
const LEFT = { x: 24, y: 24, w: 768, h: 623 };
const RIGHT = { x: 808, y: 24, w: 768, h: 760 };
const tasks = (...labels) => labels.map(([label, active, progress, icon]) => ({ label, active, progress, icon }));

const banjoWs = (o = {}) => workspace({ name: 'Banjo', thumb: 'banjo', crumb: ['Media', 'Products', 'Banjo'], ...o });
const pane = (o = {}) => itemPane({ w: PANE_W, title: 'Banjo', body: banjoWs(o.ws), ...o });

const s7 = [];
{
  const b = cardRect(CARDS, 1);
  s7.push(
    scene({
      id: 's7a',
      title: '7a. Clicking an item opens it beside the cards',
      lede: 'You clicked Banjo. Umbraco\'s media workspace opens in a pane on the right of the same window.',
      wins: [manager({ ...WIDE, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: { banjo: { open: true } }, pane: pane() })],
      tasks: tasks(['Products', true]),
      notes: [
        [1, 1180, 140, 'The pane is the desktop\'s attached pane, the same one Preview and the workspace views use. What is in it is Umbraco\'s own media workspace, with every property, view and action core and other packages give it. Not a copy.'],
        [2, b.x + b.w - 8, b.y + 10, 'Ours: the open item is marked on its card in Umbraco\'s current-item colour, the same as the open folder in the tree.'],
        [3, 1494, 87, 'The pane header is the attached pane\'s own: reload, pop out, close. Pop out makes it a floating window grouped with this one (7c), with Dock to bring it back. The splitter sets its width.'],
        [4, null, null, 'Placement is the desktop\'s rule for every attached pane: the window grows to make room, and when it cannot, the item opens floating instead (7c). Shift-click opens it floating straight away, as for Preview.'],
        [5, null, null, 'One difference from Preview: the item can hold unsaved changes, and moving attached content rebuilds it. So while it has unsaved changes, Pop out and Dock are greyed out ("Save or discard your changes first"), and closing the pane or the window asks Umbraco\'s unsaved-changes question first. That is a small addition to the attached-windows contract, written into its guide when this is built.'],
        [6, null, null, 'Opening never changes the backoffice address. Clicking a folder card still opens the folder, not the pane.'],
      ],
    }),
  );

  const j = cardRect(CARDS, 2);
  s7.push(
    scene({
      id: 's7b',
      title: '7b. Opening another item with unsaved changes',
      lede: 'You renamed Banjo without saving, then clicked Jumpsuit.',
      wins: [
        manager({
          ...WIDE, title: 'Products', active: true, dirty: true, current: 'products', items: PRODUCTS, state: { banjo: { open: true }, jumpsuit: { hover: true } },
          pane: pane({ dirty: true, ws: { name: 'Banjo (vintage)' } }),
        }),
      ],
      tasks: tasks(['Products', true]),
      over: K.cursor(j.cx, j.cy + 60) + dialog({ headline: 'You have unsaved changes', text: 'Are you sure you want to navigate away from this page? - you have unsaved changes', actions: [['Stay'], ['Discard changes', 'danger']] }),
      notes: [
        [1, 1060, 300, 'Core\'s own dialog, the one the Media section shows. The manager asks the workspace whether it has changes before it swaps the item, then opens core\'s dialog. Stay keeps Banjo; Discard changes opens Jumpsuit.'],
        [2, 180, 50, 'The dot is the desktop\'s existing unsaved-changes marker, on the window and on the pane.'],
        [3, null, null, 'The same question comes when you close the pane, the window, or open a different folder\'s item.'],
      ],
    }),
  );

  const HALF = { x: 16, y: 16, w: 800, h: 841 };
  s7.push(
    scene({
      id: 's7c',
      title: '7c. No room for a pane',
      lede: 'Products is narrow and the desktop has no room for it to grow, so Banjo opens as a window of its own, attached to Products.',
      wins: [
        manager({ ...HALF, title: 'Products', current: 'products', items: PRODUCTS, state: { banjo: { open: true } } }),
        win({ x: 830, y: 50, w: 680, h: 860, title: 'Banjo', active: true, attachedTo: 'Products', dockOff: false, body: banjoWs() }),
      ],
      tasks: tasks(['Products'], ['Banjo', true]),
      notes: [
        [1, 1380, 107, 'The desktop\'s attached window, as Preview uses it: a strip says what it belongs to, with Dock. It rises, minimises and closes with Products, and its taskbar button sits in one box with Products\'.'],
        [2, null, null, 'Same placement rule as every attached pane, and Shift-click opens floating even when a pane would fit.'],
        [3, null, null, 'Dock and Pop out are greyed while the item has unsaved changes, because moving rebuilds the workspace. Save first, or discard.'],
        [4, null, null, 'One item per manager window, docked or floating, as attached content allows one of each kind per window. Opening another item replaces this one, with the guard from 7b. Two items side by side means two manager windows.'],
      ],
    }),
  );
}

const s8 = [];
{
  const three = { banjo: { open: true, selected: true }, jumpsuit: { selected: true }, unicorn: { selected: true } };
  s8.push(
    scene({
      id: 's8a',
      title: '8a. Several selected: the pane keeps the item you opened',
      lede: 'Banjo is open. You then selected Jumpsuit and Unicorn as well. Option A: selecting never changes the pane.',
      wins: [manager({ ...WIDE, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: three, selectionBar: '3 of 8 selected', pane: pane() })],
      tasks: tasks(['Products', true]),
      notes: [
        [1, 1180, 140, 'The pane only changes when you open something. Selecting is for core\'s bulk bar, drag and the keys.'],
        [2, null, null, 'Simple and predictable, and it matches core: once something is selected, clicks select rather than open, so the pane stays put.'],
      ],
    }),
  );

  const sum = `<div class="sum"><div class="box"><div class="boxh">3 items selected</div><div class="wsp col"><div class="sumg"><span class="th-banjo"></span><span class="th-jumpsuit"></span><span class="th-unicorn"></span></div></div><div class="wsp"><b>Types</b><span>3 images</span></div><div class="wsp"><b>Total size</b><span>1.2 MB</span></div><div class="wsp"><b>In</b><span>Products</span></div></div></div>`;
  s8.push(
    scene({
      id: 's8b',
      title: '8b. Several selected: the pane shows a summary',
      lede: 'Same selection. Option B: with more than one item selected, the pane shows what is selected instead of an item.',
      wins: [manager({ ...WIDE, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: { banjo: { selected: true }, jumpsuit: { selected: true }, unicorn: { selected: true } }, selectionBar: '3 of 8 selected', pane: itemPane({ w: PANE_W, title: '3 items selected', body: sum }) })],
      tasks: tasks(['Products', true]),
      notes: [
        [1, 1180, 140, 'Like Explorer\'s details pane: thumbnails, types, total size. Read-only; the actions stay in core\'s selection bar.'],
        [2, null, null, 'The catch: the item you had open closes, so unsaved changes trigger the guard just because you ticked a checkbox.'],
      ],
    }),
  );
}

const s11 = [];
{
  const createMenu = menu([['folder', 'Folder'], ['image', 'Image'], ['file', 'File'], ['image', 'Vector Graphics (SVG)'], ['file', 'Article']], SINGLE.x + K.TREE + K.PAD, SINGLE.y + K.CAPTION + K.PAD + 38);
  s11.push(
    scene({
      id: 's11a',
      title: '11a. Create, in the folder that is open',
      lede: 'Create in Products lists the types the Products folder allows.',
      wins: [manager({ ...SINGLE, title: 'Products', active: true, current: 'products', items: PRODUCTS })],
      tasks: tasks(['Products', true]),
      over: createMenu,
      notes: [
        [1, SINGLE.x + K.TREE + K.PAD + 230, SINGLE.y + K.CAPTION + K.PAD + 60, 'Core\'s list, from the folder\'s allowed child types, custom ones included (Article). Nothing of ours in it.'],
        [2, null, null, 'The spike found Create went to the root inside a window. The manager gives the collection its folder, so it creates here.'],
      ],
    }),
  );

  s11.push(
    scene({
      id: 's11b',
      title: '11b. The new item opens in the pane',
      lede: 'You picked Image. Core\'s workspace for a new Image opens in the pane, under Products.',
      wins: [manager({ ...WIDE, title: 'Products', active: true, current: 'products', items: PRODUCTS, pane: itemPane({ w: PANE_W, title: 'New Image', body: workspace({ isNew: true, crumb: ['Media', 'Products'] }) }) })],
      tasks: tasks(['Products', true]),
      notes: [
        [1, 1260, 330, 'Core\'s own create workspace: name, the upload field, Save. The breadcrumb says where it will land.'],
        [2, null, null, 'After Save, the new card appears in the folder, selected and marked as open.'],
      ],
    }),
  );

  const viewMenu = menu([['grid', 'Grid'], ['list', 'Table']], RIGHT.x + RIGHT.w - 24 - 150, RIGHT.y + K.CAPTION + K.PAD + 38);
  s11.push(
    scene({
      id: 's11c',
      title: '11c. A view per window',
      lede: 'Products shows grid, People shows table. The view picker is core\'s.',
      wins: [
        manager({ ...LEFT, title: 'Products', current: 'products', items: PRODUCTS }),
        manager({ ...RIGHT, title: 'People', active: true, current: 'people', items: PEOPLE, view: 'table' }),
      ],
      tasks: tasks(['Products'], ['People', true]),
      over: viewMenu,
      notes: [
        [1, RIGHT.x + RIGHT.w - 30, RIGHT.y + K.CAPTION + K.PAD + 90, 'Core\'s view picker. Every registered view is in it, other packages\' too.'],
        [2, 400, 44, 'Switching People to Table leaves Products on Grid. Core switches views through the backoffice address, which would switch every window; the manager sets each window\'s view itself.'],
        [3, null, null, 'Each window remembers its view, and gets it back when the desktop reopens windows.'],
      ],
    }),
  );
}

const html = K.page({
  title: 'Media Manager mocks, batch 3',
  lede: `<p class="lede">Scenarios 7, 8 and 11: opening and editing an item, several items selected, Create, and a view per window. As before, everything inside a window right of the tree is core's, and so is the workspace inside the pane.</p>
<div class="key"><span><span class="mk">1</span> a note, listed under the picture</span><span><span class="sw" style="box-shadow:0 0 0 3px #f5a6a0;background:#fff"></span> ours: the pink border on the open item's card</span></div>`,
  sections: [
    `<section class="sc"><h2>7. Opening and editing an item</h2>${s7.join('')}</section>`,
    `<section class="sc"><h2>8. Several items selected</h2>${s8.join('')}</section>`,
    `<section class="sc"><h2>11. Create, and a view per window</h2>${s11.join('')}</section>`,
  ],
  decided: [
    "The item opens as the desktop's attached content, exactly like Preview and the workspace views: docked when there is room, floating when not, Shift-click for floating, Pop out and Dock to move it.",
    'One item per manager window, docked or floating. Opening another replaces it, after the unsaved-changes question.',
    'While the item has unsaved changes, Pop out and Dock are greyed, and closing asks first. This extends the attached-windows contract.',
    'With several items selected, the pane keeps the item you opened (8a). Selecting never changes the pane.',
    'The pink border on the open item\'s card stays.',
  ],
});

fs.writeFileSync(path.join(__dirname, '..', 'batch-3.html'), html);
console.log('batch-3.html', (html.length / 1024).toFixed(0) + ' KB');
