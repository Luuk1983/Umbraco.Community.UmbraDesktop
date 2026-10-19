// Batch 4 of the Media Manager mocks: the recycle bin, undo, and refusals. Writes ../batch-4.html.
const fs = require('fs');
const path = require('path');
const K = require('./kit.cjs');
const { PRODUCTS, PEOPLE, FOLDERS, byId, manager, scene, cardRect, treeRect, menu, ghost, dialog, toast, ic } = K;

const SINGLE = { x: 60, y: 40, w: 1120, h: 623 };
const LEFT = { x: 24, y: 24, w: 768, h: 623 };
const RIGHT = { x: 808, y: 24, w: 768, h: 760 };
const tasks = (...l) => l.map(([label, active]) => ({ label, active }));

const BIN = [
  { id: 'bowling', name: 'Bowling Ball' },
  { id: 'unicorn', name: 'Unicorn' },
  { id: null, name: 'Old banner.pdf', icon: 'file' },
  { id: 'erica', name: 'Erica Quessenberry' },
];
const BROCHURE = { id: null, name: 'Brochure.pdf', icon: 'file' };

const s9 = [];
{
  const u = cardRect(SINGLE, 1);
  s9.push(
    scene({
      id: 's9a',
      title: '9a. The recycle bin is a place in the tree',
      lede: 'Click Recycle bin in the tree and the window shows what is in it, like any folder.',
      wins: [manager({ ...SINGLE, title: 'Recycle bin', icon: 'trash', active: true, treeOpts: { current: 'bin' }, items: BIN, noCreate: true, state: { unicorn: { hover: true } } })],
      tasks: tasks(['Recycle bin', true]),
      over: menu([['restore', 'Restore...'], ['trash', 'Delete...']], u.x + u.w - 66, u.y + 40),
      notes: [
        [1, 300, 616, 'Recycle bin sits at the foot of core\'s tree. Its own menu there has core\'s Empty recycle bin.'],
        [2, u.x + u.w + 110, u.y + 58, 'Each item\'s menu is core\'s: Restore, and Delete, which deletes for good.'],
        [3, null, null, 'Ours: drag an item out of the bin onto a folder to restore it there, through core\'s restore. Dragging onto the bin trashes (2d).'],
        [4, null, null, 'Permissions and the "do not delete when referenced" rule are core\'s, since every action is.'],
      ],
    }),
  );

  const body = `Unicorn will be restored to the folder it was in:</p><div class="dref">${ic('folder', 16)}<span>Products</span><u>Choose another folder</u></div><p style="display:none">`;
  s9.push(
    scene({
      id: 's9b',
      title: '9b. Restore',
      lede: 'Restore on Unicorn opens core\'s restore dialog. Drawn from memory, so its exact wording is core\'s, whatever it is.',
      wins: [manager({ ...SINGLE, title: 'Recycle bin', icon: 'trash', active: true, treeOpts: { current: 'bin' }, items: BIN, noCreate: true })],
      tasks: tasks(['Recycle bin', true]),
      over: dialog({ headline: 'Restore Unicorn', text: body, actions: [['Cancel'], ['Restore', 'positive']] }),
      notes: [
        [1, 1070, 300, 'Core\'s dialog. If the original folder is gone too, core asks for another one.'],
        [2, null, null, 'After restoring, any manager window on Products shows Unicorn again.'],
      ],
    }),
  );
}

const s10 = [];
{
  const back = cardRect(LEFT, 1);
  s10.push(
    scene({
      id: 's10a',
      title: '10a. Ctrl+Z after a move',
      lede: 'Straight after the drop in 2e, you press Ctrl+Z. Banjo goes back to Products.',
      wins: [
        manager({ ...RIGHT, title: 'People', current: 'people', items: PEOPLE }),
        manager({ ...LEFT, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: { banjo: { selected: true, flash: true } }, selectionBar: '1 of 8 selected' }),
      ],
      tasks: tasks(['Products', true], ['People']),
      notes: [
        [1, back.x + back.w - 8, back.y + 10, 'Banjo is back where it was, selected, and Products comes to the front: the same rule as a drop.'],
        [2, null, null, 'No message. Explorer and the Finder say nothing either: the change on screen is the answer. A message only appears when undo cannot be done (10b).'],
        [3, null, null, 'One undo history for the whole manager, across all its windows, as in Explorer and the Finder. So Ctrl+Z in either window undoes a drag between them.'],
        [4, null, null, 'What can be undone: a move (moved back), a copy (the copies go to the recycle bin), a rename (renamed back), a trash (restored). Uploads cannot. Cmd+Z on a Mac.'],
      ],
    }),
  );

  s10.push(
    scene({
      id: 's10b',
      title: '10b. When undo cannot be done',
      lede: 'You press Ctrl+Z, but a colleague moved Banjo to Design in the meantime.',
      wins: [
        manager({ ...RIGHT, title: 'People', active: true, current: 'people', items: PEOPLE }),
        manager({ ...LEFT, title: 'Products', current: 'products', items: PRODUCTS.filter((i) => i.id !== 'banjo') }),
      ],
      tasks: tasks(['Products'], ['People', true]),
      over: toast({ warn: true, icon: 'alert', title: 'Can\'t undo the move', text: 'Banjo was moved to Design by someone else after you moved it. Nothing was changed.' }),
      notes: [
        [1, 1240, 860, 'The desktop\'s own notification, because nothing on screen changes. The step is dropped from the history, so the next Ctrl+Z goes further back.'],
      ],
    }),
  );
}

const s12 = [];
{
  const t = treeRect(SINGLE, 1);
  const tx = t.x + 100, ty = t.y + 20;
  s12.push(
    scene({
      id: 's12a',
      title: '12a. A folder you may not move into',
      lede: 'Banjo dragged onto Engage, where your user group may not create or move items.',
      wins: [manager({ ...SINGLE, title: 'Products', active: true, treeOpts: { current: 'products', refuse: 'engage' }, items: PRODUCTS, state: { banjo: { dim: true } } })],
      tasks: tasks(['Products', true]),
      over: ghost(tx, ty, { items: byId(PRODUCTS, 'banjo'), label: 'You can\'t move items into Engage', refuse: true }),
      notes: [
        [1, t.x + t.w + 14, t.y + 18, 'The folder turns red and the label says no before you let go. The check is core\'s: the same one that leaves Engage out of core\'s Move to dialog.'],
        [2, null, null, 'Letting go does nothing. Folders outside your start nodes are not in the tree at all, as in the Media section.'],
      ],
    }),
  );

  const items = [...PRODUCTS, BROCHURE];
  const lsel = { banjo: { selected: true, dim: true }, jumpsuit: { selected: true, dim: true } };
  const design = cardRect(RIGHT, 2);
  const dx = design.cx + 10, dy = design.cy - 10;
  s12.push(
    scene({
      id: 's12b',
      title: '12b. A type the folder does not allow',
      lede: 'Banjo, Jumpsuit and Brochure.pdf dragged onto Design, which only allows images.',
      wins: [
        manager({ ...RIGHT, title: 'Media', current: 'media', items: FOLDERS, state: { design: { drop: true } } }),
        manager({ ...LEFT, title: 'Products', active: true, current: 'products', items, state: lsel, selectionBar: '3 of 9 selected' }),
      ],
      tasks: tasks(['Products', true], ['Media']),
      over: ghost(dx, dy, { items: [...byId(PRODUCTS, 'banjo', 'jumpsuit'), BROCHURE], label: 'Move 2 of 3 to Design', hint: 'Brochure.pdf: Design does not allow File' }),
      notes: [
        [1, dx + 270, dy + 46, 'The label says what will happen, and what will not, before you let go.'],
        [2, null, null, 'The two images move and Brochure.pdf stays in Products, still selected. The same rule as the Transfers window: one item that cannot go does not stop the rest.'],
        [3, null, null, 'When nothing in the drag fits, the folder turns red and the label says "Design does not allow File", as in 12a.'],
      ],
    }),
  );

  const VIDEO = { x: 60, y: 40, w: 1120, h: 623 };
  s12.push(
    scene({
      id: 's12c',
      title: '12c. Pasting into a folder that does not take images',
      lede: 'You pressed Ctrl+V with a screenshot on the clipboard, in a folder that only allows videos.',
      wins: [manager({
        ...VIDEO, title: 'Video', active: true, items: [], empty: 'No items',
        treeOpts: {
          current: 'video',
          rows: [
            { label: 'Media', icon: 'image', depth: 0, open: true, id: 'media' },
            { label: 'People', icon: 'folder', depth: 1, open: true, id: 'people' },
            { label: 'Spring campaign', icon: 'folder', depth: 2, open: true, id: 'spring' },
            { label: 'Banners', icon: 'folder', depth: 3, id: 'banners' },
            { label: 'Video', icon: 'folder', depth: 3, id: 'video' },
            { label: 'Products', icon: 'folder', depth: 1, kids: true, id: 'products' },
          ],
        },
      })],
      tasks: tasks(['Video', true]),
      over: toast({ warn: true, icon: 'alert', title: 'Can\'t paste here', text: 'Video does not allow Image. Paste the screenshot into another folder.' }),
      notes: [
        [1, 1240, 860, 'Nothing is uploaded; the notification says why. The rule is the folder\'s allowed types, read from core.'],
        [2, null, null, 'Files dropped from Explorer go through core\'s dropzone, so core decides; a refused file shows in Transfers with Umbraco\'s reason (6a).'],
      ],
    }),
  );
}

const html = K.page({
  title: 'Media Manager mocks, batch 4',
  lede: `<p class="lede">Scenarios 9, 10 and 12: the recycle bin, undo, and what happens when something is not allowed. The last batch; after this the decisions go into the design doc.</p>
<div class="key"><span><span class="mk">1</span> a note, listed under the picture</span><span><span class="sw" style="background:#fbe9ec;box-shadow:inset 0 0 0 2px #d42054"></span> a target that refuses</span></div>`,
  sections: [
    `<section class="sc"><h2>9. The recycle bin</h2>${s9.join('')}</section>`,
    `<section class="sc"><h2>10. Undo</h2>${s10.join('')}</section>`,
    `<section class="sc"><h2>12. Refusals</h2>${s12.join('')}</section>`,
  ],
  decided: [
    'Undo says nothing when it works, as in Explorer and the Finder. Only an undo that cannot be done gets a notification.',
    'One undo history for the whole manager, across all its windows, as in the OS file managers.',
    'A drag where some items are not allowed moves the ones that fit and leaves the rest, selected, where they were.',
  ],
});

fs.writeFileSync(path.join(__dirname, '..', 'batch-4.html'), html);
console.log('batch-4.html', (html.length / 1024).toFixed(0) + ' KB');
