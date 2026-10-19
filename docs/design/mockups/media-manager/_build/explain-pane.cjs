// Pictures for two batch 3 questions that were hard to follow in words: what the pink outline on
// the open card is, and what "one item per window, Shift-click for more" looks like.
// Writes ../explain-pane.html.
const fs = require('fs');
const path = require('path');
const K = require('./kit.cjs');
const { PRODUCTS, manager, win, scene, cardRect, workspace, itemPane } = K;

const PANE_W = 600;
const WIDE = { x: 30, y: 30, w: 1540, h: 623 };
const CARDS = { ...WIDE, w: WIDE.w - PANE_W };
const tasks = (...l) => l.map(([label, active]) => ({ label, active }));
const ws = (id, name) => workspace({ name, thumb: id, crumb: ['Media', 'Products', name] });
const pane = (id, name) => itemPane({ w: PANE_W, title: name, body: ws(id, name) });

const b = cardRect(CARDS, 1);
const j = cardRect(CARDS, 2);
const sel = { jumpsuit: { selected: true }, unicorn: { selected: true } };

const q4 = [
  scene({
    id: 'q4a',
    title: 'With the outline',
    lede: 'Banjo is open in the pane on the right. Afterwards you ticked Jumpsuit and Unicorn. Banjo\'s card has a pink border, so you can see which card is the one in the pane.',
    wins: [manager({ ...WIDE, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: { ...sel, banjo: { open: true } }, selectionBar: '2 of 8 selected', pane: pane('banjo', 'Banjo') })],
    tasks: tasks(['Products', true]),
    notes: [
      [1, b.x + b.w - 8, b.y + 10, 'The pink border: "this card is the one open on the right". Same pink as Products in the tree, which is Umbraco\'s colour for "where you are".'],
      [2, j.x + j.w - 8, j.y + 10, 'Blue border and a tick: selected, for the bar at the bottom (Move to, Copy to, Trash).'],
    ],
  }),
  scene({
    id: 'q4b',
    title: 'Without the outline',
    lede: 'Exactly the same, minus the pink border. Only the pane\'s title says Banjo is the open one.',
    wins: [manager({ ...WIDE, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: sel, selectionBar: '2 of 8 selected', pane: pane('banjo', 'Banjo') })],
    tasks: tasks(['Products', true]),
    notes: [[1, b.x + b.w - 8, b.y + 10, 'Banjo looks like any other card. You read "Banjo" in the pane to know which one is open.']],
  }),
];

const q3 = [
  scene({
    id: 'q3a',
    title: 'Click: the pane switches to the new item',
    lede: 'Banjo was open. You clicked Jumpsuit. The pane now shows Jumpsuit, and Banjo is closed. One item at a time in the pane.',
    wins: [manager({ ...WIDE, title: 'Products', active: true, current: 'products', items: PRODUCTS, state: { jumpsuit: { open: true } }, pane: pane('jumpsuit', 'Jumpsuit') })],
    tasks: tasks(['Products', true]),
    notes: [[1, j.x + j.w - 8, j.y + 10, 'A plain click replaces what is in the pane. If Banjo had unsaved changes, Umbraco asks first (7b).']],
  }),
  scene({
    id: 'q3b',
    title: 'Shift-click: the new item opens in its own window',
    lede: 'Banjo was open. You held Shift and clicked Jumpsuit. Banjo stays in the pane, and Jumpsuit opens in a separate window on top, which you can move anywhere.',
    wins: [
      manager({ ...WIDE, title: 'Products', current: 'products', items: PRODUCTS, state: { banjo: { open: true } }, pane: pane('banjo', 'Banjo') }),
      win({ x: 380, y: 250, w: 640, h: 690, title: 'Jumpsuit', active: true, body: ws('jumpsuit', 'Jumpsuit') }),
    ],
    tasks: tasks(['Products'], ['Jumpsuit', true]),
    notes: [
      [1, 960, 560, 'Jumpsuit in its own window, the same window you get when you open it from launcher search. Shift-click more cards for more windows.'],
      [2, 1180, 140, 'Banjo is still in the pane.'],
    ],
  }),
];

const html = K.page({
  title: 'The pane, two examples',
  lede: '<p class="lede">Pictures for the two open questions from batch 3.</p>',
  sections: [
    `<section class="sc"><h2>Question 4: the pink outline on the open card</h2>${q4.join('')}</section>`,
    `<section class="sc"><h2>Question 3: opening a second item</h2>${q3.join('')}</section>`,
  ],
  questions: [
    'Pink outline: keep it (first picture) or drop it (second picture)?',
    'Opening a second item: click replaces what is in the pane, and Shift-click opens it in a window of its own. Fine?',
  ],
});

fs.writeFileSync(path.join(__dirname, '..', 'explain-pane.html'), html);
console.log('explain-pane.html', (html.length / 1024).toFixed(0) + ' KB');
