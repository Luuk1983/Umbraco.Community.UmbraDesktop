// Media Cleanup step 4 mock (#141): one line in a Media Manager window that says the last check found
// something to clean up in the folder shown, while that check is valid (design §16.20). Drawn on the
// Media Manager kit, with health.cjs's icons. Static HTML, because the side panel that shows these
// runs no scripts. From this folder:
//   node step4.cjs
const fs = require('fs');
const path = require('path');
const k = require('../../media-manager/_build/kit.cjs');

/** health.cjs's pieces, up to its scenes, without running its scenes or writing its page. */
const source = fs.readFileSync(path.join(__dirname, 'health.cjs'), 'utf8');
const pieces = source.slice(source.indexOf('/** Icons the kit lacks'), source.indexOf('// Scenes'));
const { ic, CSS } = new Function('k', `${pieces}; return { ic, CSS };`)(k);

/** The line, drawn as the Manager's "files were not uploaded" line (#179), but in the flow above core's toolbar. */
const STEP4_CSS = `
.coll { display: flex; flex-direction: column; }
.hint { flex: none; display: flex; align-items: center; gap: 9px; margin: 12px 20px 0; padding: 9px 12px; background: #fff; color: #000; border: 1px solid #d8d7d9; border-radius: 3px; font-size: 14px; }
.hint .ic:first-child { color: #3544b1; }
.hint span.t { flex: 1; min-width: 0; }
.hint u { color: #3544b1; cursor: pointer; white-space: nowrap; }
`;

/**
 * A Manager window on a folder, with the line or without.
 * @param o The window, plus `hint` (the line's text) and `items`.
 */
function managerWith(o) {
  const coll = k.collection(o);
  const line = o.hint ? `<div class="hint">${ic('info', 16)}<span class="t">${o.hint}</span><u>Review in Media Cleanup</u><u>Dismiss</u></div>` : '';
  const body = `<div class="mm">${k.tree({ current: o.current })}${coll.replace('<div class="coll">', `<div class="coll">${line}`)}</div>`;
  return k.win({ ...o, body });
}

const ITEMS = [
  { id: 'f2023', name: '2023', folder: true },
  { id: 'farchive', name: 'Archive', folder: true },
  ...k.PRODUCTS.slice(0, 6),
];
const TASKS = [{ label: 'Media Manager', icon: 'image', active: true }];

const scenes = [];

// 1. A folder the last check found something in.
{
  const mm = { x: 40, y: 70, w: 980, h: 660, title: 'Media Manager', icon: 'image', active: true, current: 'products', items: ITEMS };
  scenes.push(
    k.scene({
      id: 'line',
      title: '1. The line, while the check is valid',
      lede: 'You open Products in the Media Manager. The last check, from this morning, found 41 unused items and 12 oversized images in it and the folders under it, so the window says so, once, and offers to take you there.',
      wins: [managerWith({ ...mm, hint: '<b>41 unused items</b> and <b>12 oversized images</b> in this folder and the folders under it, found by this morning\'s check.' })],
      tasks: TASKS,
      notes: [
        [1, 330, 190, 'In the window\'s own flow above core\'s toolbar, so it covers no card. Looks like the Manager\'s existing "files were not uploaded" line.'],
        [2, 860, 190, 'Opens Media Cleanup\'s list on this folder and everything under it, on the first kind with something in it.'],
        [3, 990, 190, 'Hides the line in this window until a newer check.'],
        [4, null, null, 'Valid means what it means for Clean up: under a day old. Older, and there is no line at all. Kept items are not counted. Orphaned files belong to no folder, so they never show here.'],
        [5, null, null, 'Cost: one small read when the window opens, the counts per folder from the stored check. Nothing while browsing, no file touched.'],
      ],
    }),
  );
}

// 2. Everything else.
{
  const mm = { x: 40, y: 70, w: 980, h: 660, title: 'Media Manager', icon: 'image', active: true, current: 'products', items: ITEMS };
  scenes.push(
    k.scene({
      id: 'none',
      title: '2. Every other case: the Manager as it is today',
      lede: 'No check yet, a check over a day old, a folder with nothing to clean up, the recycle bin, or a line someone dismissed: the window shows nothing extra. No sizes, no tags, no "out of date" notice.',
      wins: [managerWith(mm)],
      tasks: TASKS,
    }),
  );
}

const html = k.page({
  title: 'Media Cleanup in the Media Manager (step 4)',
  lede: `<style>${CSS}${STEP4_CSS}</style><p class="lede">Step 4, cut down on 2026-11-03: the Manager shows no sizes and no per-item facts, since they go stale. It only says, while the last check is valid, that there is something to clean up in the folder you are in, and takes you to Media Cleanup for it.</p>`,
  sections: scenes,
  questions: [],
});

fs.writeFileSync(path.join(__dirname, '..', 'step4.html'), html);
console.log('wrote step4.html');
