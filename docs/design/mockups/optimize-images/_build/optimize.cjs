// The Optimize images mocks (issue #139): the bulk action, its settings, the job window while it runs,
// minimised, finished and cancelled. Draws with the Media Manager kit, so the desktop, windows and core's
// collection match the Manager's own mocks. Static HTML, like the others. Writes ../optimize-images.html.
const fs = require('fs');
const path = require('path');
const K = require('../../media-manager/_build/kit.cjs');

const { PRODUCTS, PEOPLE, FOLDERS, byId, manager, scene, ic, win, dialog } = K;

const LEFT = { x: 24, y: 24, w: 880, h: 900 };
const RIGHT = { x: 920, y: 24, w: 656, h: 900 };
const FULL = { x: 60, y: 30, w: 1200, h: 880 };

const ITEMS = [FOLDERS[2], ...PRODUCTS, ...byId(PEOPLE, 'ravi', 'janae', 'erica')];
const SELECTED = ['design', 'knitted', 'banjo', 'jumpsuit', 'bowling', 'pingpong', 'unicorn', 'tattoo', 'biker', 'ravi'];
const state = Object.fromEntries(SELECTED.map((id) => [id, { selected: true }]));

/** Core's bulk actions with ours marked: Copy to is the Manager's, Optimize images is this issue's. */
const BULK = [['Move to'], ['Copy to', true], ['Optimize images', true], ['Trash']];

const tasks = (...l) => l.map(([label, active, icon, progress, failed]) => ({ label, active, icon, progress, failed }));

/** A toggle row heading a group of settings. */
const toggle = (on, label, locked) =>
  `<span class="tg${on ? ' on' : ''}${locked ? ' locked' : ''}"><i></i></span><b>${label}</b>`;

/** A segmented control: one option on. */
const seg = (opts, on) => `<span class="seg">${opts.map((o) => `<span${o === on ? ' class="on"' : ''}>${o}</span>`).join('')}</span>`;

/** A radio choice. */
const radio = (on, label, hint) =>
  `<div class="rd${on ? ' on' : ''}"><span class="rb"></span><div><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div></div>`;

/**
 * The settings: resize, convert and remove metadata as three ticks, then where the result goes, then
 * the button that starts the job.
 */
function settings(o = {}) {
  const resize = o.resize ?? true;
  const convert = o.convert ?? true;
  const reencode = resize || convert;
  return `<div class="opt${o.inWindow ? ' inwin' : ''}">
<div class="oh"><b>Optimize ${o.count ?? 9} images</b><small>1 folder in the selection is skipped.</small></div>
<div class="og"><div class="ogh">${toggle(resize, 'Resize')}</div>
${resize ? `<div class="ogb"><div class="row"><label>Max width</label><span class="in">2560</span><span class="u">px</span><label class="l2">Max height</label><span class="in">2560</span><span class="u">px</span></div>
<p class="hint">Never made larger. An image already inside the box is left at its size. The focal point and crops are kept.</p></div>` : ''}</div>
<div class="og"><div class="ogh">${toggle(convert, 'Convert')}</div>
${convert ? `<div class="ogb"><div class="row"><label>Format</label>${seg(['Keep', 'JPEG', 'PNG', 'WebP'], 'WebP')}</div>
<div class="row"><label>Quality</label><span class="sl"><span style="width:80%"></span><i style="left:80%"></i></span><span class="in sm">80</span></div>
<p class="hint">The file keeps its name with the new extension. Pages that use the image keep working.</p></div>` : ''}</div>
<div class="og"><div class="ogh">${toggle(true, 'Remove metadata', reencode)}</div>
<div class="ogb"><p class="hint">${
    reencode
      ? 'Location, camera and date. Always removed when an image is resized or converted, because it is saved anew.'
      : 'Location, camera and date. Removed without saving the picture anew, so the quality stays exactly the same.'
  }</p></div></div>
<div class="og"><div class="ogh"><b>Save</b></div><div class="ogb">
${radio(o.copies !== true, 'Replace the originals')}
${o.copies !== true ? `<div class="warn">${ic('alert', 16)}<span>4 of these images are used in 11 places. Replacing changes them everywhere.</span></div>` : ''}
${radio(o.copies === true, 'Save copies next to them', 'Named like the original with "-optimized", in the same folder.')}
</div></div>
<div class="of"><span class="dbtn">Cancel</span><span class="dbtn positive">Optimize ${o.count ?? 9} images</span></div>
</div>`;
}

/** One item in the job: before, after, and what came of it. */
const ROWS = {
  knitted: ['Knitted West', '6000 × 4000 JPEG, 8.4 MB', '2560 × 1707 WebP, 412 KB', '−95%'],
  banjo: ['Banjo', '5472 × 3648 JPEG, 7.1 MB', '2560 × 1707 WebP, 388 KB', '−95%'],
  jumpsuit: ['Jumpsuit', '4032 × 3024 JPEG, 4.6 MB', '2560 × 1920 WebP, 301 KB', '−93%'],
  bowling: ['Bowling Ball', '6000 × 4000 JPEG, 9.2 MB', '2560 × 1707 WebP, 455 KB', '−95%'],
  pingpong: ['Ping Pong Ball', '4000 × 6000 JPEG, 6.8 MB', '1707 × 2560 WebP, 350 KB', '−95%'],
  unicorn: ['Unicorn', '1800 × 1200 WebP, 140 KB', null, null],
  tattoo: ['Tattoo', '6000 × 4000 JPEG, 8.9 MB', '2560 × 1707 WebP, 430 KB', '−95%'],
  biker: ['Biker Jacket', '5184 × 3456 PNG, 21.3 MB', '2560 × 1707 WebP, 520 KB', '−98%'],
  ravi: ['Ravi Motha', '3024 × 4032 JPEG, 3.9 MB', '1920 × 2560 WebP, 268 KB', '−93%'],
};
const ORDER = ['knitted', 'banjo', 'jumpsuit', 'bowling', 'pingpong', 'unicorn', 'tattoo', 'biker', 'ravi'];

/**
 * A job row. `st` is done, run, wait, fail, same (left as it was), skip (not an image) or notrun
 * (cancelled before it started).
 */
function row(id, st, extra = {}) {
  if (id === 'design') {
    return `<div class="jr skip"><span class="tth">${ic('folder', 16)}</span><span class="tnm"><b>Design</b><small>A folder, skipped</small></span><span class="js">Skipped</span></div>`;
  }
  const [name, before, after, saved] = ROWS[id];
  const detail =
    st === 'done'
      ? `${before} <span class="ar">→</span> ${after}`
      : st === 'same'
        ? `${before}. Already inside 2560 × 2560 and WebP, left as it was`
        : before;
  const status = {
    done: `<span class="js ok">${ic('check', 15)}${saved}</span>`,
    run: `<span class="js run"><span class="mini"><span style="width:${(extra.p ?? 0.5) * 100}%"></span></span>Saving</span>`,
    wait: '<span class="js">Waiting</span>',
    fail: `<span class="js bad">${ic('alert', 15)}Failed</span>`,
    same: '<span class="js">Unchanged</span>',
    notrun: '<span class="js">Not started</span>',
  }[st];
  return `<div class="jr ${st}"><span class="tth th-${id}"></span><span class="tnm"><b>${name}</b><small>${detail}</small>${extra.reason ? `<em>${extra.reason}</em>` : ''}</span>${status}</div>`;
}

/** The job window's content: the summary at the top, then a row per item. */
function job(o) {
  return `<div class="job">
<div class="jh">${ic(o.icon ?? 'image', 18)}<b>${o.title}</b><span class="tob">${(o.buttons ?? []).map((b) => `<span class="tbtn${b.primary ? ' primary' : ''}">${b.label}</span>`).join('')}</span></div>
<div class="tbar${o.failed ? ' failed' : ''}"><span style="width:${o.overall * 100}%"></span></div>
<div class="jm">${o.meta}</div>
<div class="jsets">${o.sets ?? 'Resize to 2560 × 2560 · WebP at 80 · metadata removed · replacing the originals'}</div>
<div class="jl">${o.rows.join('')}</div>
</div>`;
}

const CSS = `<style>
.opt { width: 640px; background: #fff; color: #303033; font-size: 14.5px; display: flex; flex-direction: column; }
.opt.dlg { position: absolute; z-index: 86; left: 50%; top: 47%; transform: translate(-50%, -50%); border-radius: 6px; box-shadow: 0 14px 40px rgba(0,0,0,.4); }
.opt.inwin { width: auto; height: 100%; }
.oh { padding: 20px 24px 14px; border-bottom: 1px solid #e9e9eb; display: flex; flex-direction: column; }
.oh b { font-size: 18px; color: #1b264f; }
.oh small { color: #6b6b72; font-size: 13.5px; }
.og { padding: 14px 24px; border-bottom: 1px solid #f0f0f2; }
.ogh { display: flex; align-items: center; gap: 12px; }
.ogh b { font-size: 15px; }
.ogb { margin: 10px 0 0 50px; display: grid; gap: 10px; }
.opt .og:nth-last-of-type(1) .ogb { margin-left: 0; }
.tg { position: relative; width: 38px; height: 22px; border-radius: 11px; background: #c9ccd8; }
.tg i { position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; }
.tg.on { background: #3544b1; }
.tg.on i { left: 19px; }
.tg.locked { opacity: .45; }
.row { display: flex; align-items: center; gap: 10px; }
.row label { width: 84px; color: #515054; }
.row label.l2 { width: auto; margin-left: 18px; }
.in { display: inline-flex; align-items: center; width: 86px; height: 34px; padding: 0 10px; border: 1px solid #c2c2c2; border-radius: 3px; }
.in.sm { width: 56px; }
.u { color: #6b6b72; }
.seg { display: inline-flex; border: 1px solid #c2c2c2; border-radius: 3px; overflow: hidden; }
.seg span { padding: 6px 14px; border-left: 1px solid #c2c2c2; }
.seg span:first-child { border-left: 0; }
.seg span.on { background: #3544b1; color: #fff; }
.sl { position: relative; width: 260px; height: 4px; border-radius: 2px; background: #e3e6f5; }
.sl span { display: block; height: 100%; background: #3544b1; border-radius: 2px; }
.sl i { position: absolute; top: -7px; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: #fff; border: 2px solid #3544b1; }
.hint { margin: 0; color: #6b6b72; font-size: 13px; }
.rd { display: flex; gap: 10px; align-items: flex-start; }
.rd b { font-weight: 400; }
.rd small { display: block; color: #6b6b72; font-size: 13px; }
.rb { flex: none; width: 18px; height: 18px; margin-top: 2px; border-radius: 50%; border: 2px solid #8f8f93; }
.rd.on .rb { border-color: #3544b1; box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 9px #3544b1; }
.warn { display: flex; gap: 8px; align-items: flex-start; margin: -2px 0 2px 28px; padding: 8px 10px; background: #fff3e0; border-radius: 3px; font-size: 13.5px; color: #6b4a00; }
.warn .ic { color: #c27c00; margin-top: 1px; }
.of { margin-top: auto; padding: 14px 24px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid #e9e9eb; }
.job { flex: 1; min-width: 0; height: 100%; padding: 18px 20px; background: #fff; display: flex; flex-direction: column; overflow: hidden; }
.jh { display: flex; align-items: center; gap: 10px; font-size: 16px; color: #1b264f; }
.jm { font-size: 14px; color: #303033; }
.jsets { font-size: 12.5px; color: #8a8a90; margin: 2px 0 10px; }
.tbar.failed span { background: #d42054; }
.jl { border-top: 1px solid #ececef; overflow: hidden; }
.jr { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0f0f2; font-size: 14px; }
.jr .tth { width: 48px; height: 36px; }
.jr .tnm small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jr .ar { color: #3544b1; font-weight: 700; }
.jr.wait, .jr.notrun, .jr.skip { opacity: .6; }
.jr.fail { background: #fdf0f3; margin: 0 -20px; padding: 8px 20px; }
.js { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #515054; min-width: 80px; justify-content: flex-end; }
.js.ok { color: #2e8540; font-weight: 700; }
.js.bad { color: #d42054; font-weight: 700; }
.task.failed .ring { background: conic-gradient(#ff3b5c calc(var(--p) * 360deg), rgba(255,255,255,.18) 0); }
.tip { position: absolute; z-index: 60; padding: 6px 10px; background: #1f2230; color: #fff; border-radius: 4px; font-size: 13px; }
.cap2 { margin: 6px 0 0; font-size: 13.5px; color: #4a4f63; }
</style>`;

/** The taskbar with our task's ring in the failure colour when the run failed. */
function taskbarFix(html, failed) {
  return failed ? html.replace(/<span class="task( active)?">(<span class="ring")/g, (m, a, r) => m.replace('class="task', 'class="task failed')) : html;
}

const sections = [];

// 1. The action.
sections.push(
  `<section class="sc"><h2>1. Where it is</h2><p>Select images in the media collection, in a Media Manager window or in the Media section window. Optimize images joins the bulk actions in the selection bar. Like Edit image, it only shows on the desktop.</p>
${scene({
  id: 's1',
  title: '1. Ten selected, one of them a folder',
  wins: [manager({ ...FULL, title: 'Products', active: true, current: 'products', items: ITEMS, state, selectionBar: '10 of 13 selected', bulk: BULK })],
  tasks: tasks(['Products', true]),
  notes: [
    [1, 1118, 846, 'Ours, after the Manager\'s Copy to. An entityBulkAction for media, so nothing of core\'s is overridden.'],
    [2, null, null, 'The folder is in the selection. It is not refused here: the job skips it and says so.'],
  ],
})}</section>`,
);

// 2. The settings, two ways.
sections.push(
  `<section class="sc"><h2>2. The settings, two ways to show them</h2><p>The same settings either way. A: a dialog over the desktop first, and the job window opens when you start. B: the job window opens straight away with the settings in it, and turns into the progress view when you start.</p>
${scene({
  id: 's2a',
  title: '2A. A dialog, then the job window',
  wins: [manager({ ...FULL, title: 'Products', active: true, current: 'products', items: ITEMS, state, selectionBar: '10 of 13 selected', bulk: BULK })],
  tasks: tasks(['Products', true]),
  over: `<div class="scrim"></div>${settings({}).replace('class="opt', 'class="opt dlg')}`,
})}
${scene({
  id: 's2b',
  title: '2B. The job window opens with its settings',
  wins: [
    manager({ ...LEFT, title: 'Products', current: 'products', items: ITEMS, state, selectionBar: '10 of 13 selected', bulk: BULK }),
    win({ ...RIGHT, title: 'Optimize images', icon: 'image', active: true, body: settings({ inWindow: true }) }),
  ],
  tasks: tasks(['Products'], ['Optimize images', true]),
  notes: [[1, null, null, 'The window is already there to move or minimise, and it is where the result ends up. Cancel closes it.']],
})}
${scene({
  id: 's2c',
  title: '2C. Remove metadata on its own, saving copies',
  lede: 'With Resize and Convert off, metadata is removed from the file\'s bytes and the picture is not saved anew, so a JPEG keeps its exact quality.',
  wins: [
    manager({ ...LEFT, title: 'Products', current: 'products', items: ITEMS, state, selectionBar: '10 of 13 selected', bulk: BULK }),
    win({ ...RIGHT, title: 'Optimize images', icon: 'image', active: true, body: settings({ inWindow: true, resize: false, convert: false, copies: true }) }),
  ],
  tasks: tasks(['Products'], ['Optimize images', true]),
})}</section>`,
);

// 3. Running.
const running = job({
  title: 'Optimizing 9 images',
  overall: 4 / 9,
  meta: '<b>4 of 9</b> · 30.4 MB saved so far',
  buttons: [{ label: 'Cancel' }],
  rows: [row('knitted', 'done'), row('banjo', 'done'), row('jumpsuit', 'done'), row('bowling', 'done'), row('pingpong', 'run', { p: 0.6 }), row('unicorn', 'wait'), row('tattoo', 'wait'), row('biker', 'wait'), row('ravi', 'wait'), row('design')],
});
sections.push(
  `<section class="sc"><h2>3. While it runs</h2><p>One image at a time: open, resize, encode, save through Umbraco's media save, next. Each row says what it was and what it is now.</p>
${scene({
  id: 's3',
  title: '3. Halfway',
  wins: [manager({ ...LEFT, title: 'Products', current: 'products', items: ITEMS, state: {} }), win({ ...RIGHT, title: 'Optimize images', icon: 'image', active: true, body: running })],
  tasks: tasks(['Products', false, 'image'], ['Optimize images', true, 'image', 4.6 / 9]),
  notes: [
    [1, 730, 975, 'The taskbar button and title bar show progress, as for an upload (window progress, #108). Closing the window asks first, because it is busy.'],
    [2, null, null, 'The Manager window refreshes as each item is saved, so the thumbnails change while you watch.'],
  ],
})}
${scene({
  id: 's3b',
  title: '3B. Minimised, carrying on elsewhere',
  wins: [manager({ ...FULL, title: 'People', active: true, current: 'people', items: PEOPLE, state: {} })],
  tasks: tasks(['People', true, 'image'], ['Optimize images', false, 'image', 7.4 / 9]),
  over: '<div class="tip" style="left:500px;top:906px">Optimize images · Optimizing 7 of 9</div>',
})}</section>`,
);

// 4. Finished, failed, cancelled.
const finished = job({
  title: '7 optimized, 1 unchanged, 1 failed',
  overall: 1,
  failed: true,
  meta: '<b>54.8 MB saved</b>, 95% of what the optimized images were',
  buttons: [{ label: 'Retry failed' }, { label: 'Close', primary: true }],
  rows: [
    row('knitted', 'done'),
    row('banjo', 'done'),
    row('jumpsuit', 'done'),
    row('bowling', 'done'),
    row('pingpong', 'done'),
    row('unicorn', 'same'),
    row('tattoo', 'fail', { reason: 'Someone else saved this image after you started. It was left alone, so their change is not lost.' }),
    row('biker', 'done'),
    row('ravi', 'done'),
    row('design'),
  ],
});
const cancelled = job({
  title: 'Cancelled after 5 of 9',
  overall: 5 / 9,
  meta: '<b>36.0 MB saved</b>. The 5 done stay done.',
  buttons: [{ label: 'Run the rest' }, { label: 'Close', primary: true }],
  rows: [row('knitted', 'done'), row('banjo', 'done'), row('jumpsuit', 'done'), row('bowling', 'done'), row('pingpong', 'done'), row('unicorn', 'notrun'), row('tattoo', 'notrun'), row('biker', 'notrun'), row('ravi', 'notrun'), row('design')],
});
let s4 = scene({
  id: 's4',
  title: '4A. Done, with one failure',
  wins: [manager({ ...LEFT, title: 'Products', current: 'products', items: ITEMS, state: {} }), win({ ...RIGHT, title: 'Optimize images', icon: 'image', active: true, body: finished })],
  tasks: tasks(['Products', false, 'image'], ['Optimize images', true, 'image', 1]),
  notes: [
    [1, null, null, 'One failure does not stop the rest. The reason is Umbraco\'s, in the words the Image Editor shows on a refused save.'],
    [2, null, null, 'The failure colour stays on the taskbar button until you have looked at the window, as window progress already does.'],
    [3, null, null, 'An image with nothing to do is left alone and counted as unchanged, not saved again.'],
  ],
});
s4 = taskbarFix(s4, true);
sections.push(
  `<section class="sc"><h2>4. When it ends</h2>
${s4}
${scene({
  id: 's4b',
  title: '4B. Cancelled',
  wins: [manager({ ...LEFT, title: 'Products', current: 'products', items: ITEMS, state: {} }), win({ ...RIGHT, title: 'Optimize images', icon: 'image', active: true, body: cancelled })],
  tasks: tasks(['Products', false, 'image'], ['Optimize images', true, 'image']),
  notes: [[1, null, null, 'Cancel lets the image being saved finish, then stops. Nothing is rolled back.']],
})}</section>`,
);

const html = K.page({
  title: 'Optimize images (#139)',
  lede: `${CSS}<p class="lede">Resize, convert and remove metadata for many images at once, as one action. Drawn in the Umbraco theme with the Media Manager's mock kit. Pink-edged buttons in the selection bar are ours.</p>`,
  sections,
  questions: [
    'Settings in a dialog first (2A), or in the job window from the start (2B)?',
    'Defaults: 2560 × 2560, WebP at 80, replace the originals. Remembered per user after the first run. Right?',
    'Copies named "-optimized" in the same folder (2C)?',
  ],
});
fs.writeFileSync(path.join(__dirname, '..', 'optimize-images.html'), html);
console.log('optimize-images.html', fs.statSync(path.join(__dirname, '..', 'optimize-images.html')).size);
