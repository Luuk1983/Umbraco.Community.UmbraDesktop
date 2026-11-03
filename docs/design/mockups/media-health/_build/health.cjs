// Media Health mocks (#141): the shapes the library-wide checks could take, drawn on the Media
// Manager kit so they sit in the same desktop, windows and cards as the Manager and the item.
// Static HTML, because the side panel that shows these runs no scripts. From this folder:
//   node health.cjs
const fs = require('fs');
const path = require('path');
const k = require('../../media-manager/_build/kit.cjs');

/** Icons the kit lacks, Lucide like the rest. */
const MORE = {
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  drive: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
  shrink: '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  unlink: '<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  wand: '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
  pie: '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
};
const ic = (name, size = 16, extra = '') =>
  MORE[name]
    ? `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${MORE[name]}</svg>`
    : k.ic(name, size, extra);

const CSS = `
/* Media Health */
.mh { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #f7f7f8; }
.mhsum { display: flex; align-items: flex-start; gap: 18px; padding: 26px 28px 18px; }
.mhsum .big { font-size: 34px; font-weight: 700; color: #1b264f; line-height: 1.05; }
.mhsum .big small { display: block; font-size: 14.5px; font-weight: 400; color: #515054; margin-top: 6px; }
.mhsum .when { margin-left: auto; text-align: right; font-size: 13.5px; color: #515054; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.mhbar { margin: 0 28px 8px; }
.mhbar .segs { display: flex; height: 18px; border-radius: 4px; overflow: hidden; }
.mhbar .segs span { display: block; height: 100%; }
.mhbar .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 8px; font-size: 13px; color: #515054; }
.mhbar .legend span { display: inline-flex; align-items: center; gap: 6px; }
.mhbar .legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.mhrows { margin: 14px 28px 0; display: flex; flex-direction: column; gap: 10px; }
.mhrow { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: #fff; border: 1px solid #e3e3e6; border-radius: 4px; }
.mhrow.dim { opacity: .45; }
.mhrow .mhi { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: #eef0fb; color: #1b264f; }
.mhrow .mht { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mhrow .mht b { font-size: 15px; color: #1b264f; }
.mhrow .mht small { font-size: 13.5px; color: #515054; }
.mhrow .mht small em { font-style: normal; color: #1b264f; font-weight: 700; }
.mhrow .mha { display: flex; gap: 8px; }
.mhrow.good .mhi { background: #e6f6ec; color: #2e8540; }
.mhfoot { margin-top: auto; padding: 14px 28px 18px; font-size: 13px; color: #6b6b72; display: flex; align-items: center; gap: 8px; }
.mhprog { padding: 26px 28px 8px; }
.mhprog .pt { display: flex; justify-content: space-between; font-size: 14.5px; color: #1b264f; margin-bottom: 10px; }
.pbar { height: 8px; border-radius: 4px; background: #e3e3e6; overflow: hidden; }
.pbar span { display: block; height: 100%; background: #3544b1; border-radius: 4px; }
.pbar.pulse span { background: repeating-linear-gradient(90deg, #3544b1 0 14px, #5c69c7 14px 28px); }

/* Facts on cards and rows */
.card .sz { position: absolute; right: 8px; bottom: 48px; padding: 2px 7px; border-radius: 3px; background: rgba(27, 38, 79, .78); color: #fff; font-size: 12px; font-weight: 700; }
.card .tag { position: absolute; left: 8px; bottom: 48px; display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 6px; border-radius: 3px; background: rgba(255, 255, 255, .92); color: #515054; font-size: 12px; box-shadow: 0 0 0 1px #d8d7d9; }
.card .tag.big { color: #8a4b00; }
.card.info .name { height: 54px; flex-direction: column; align-items: flex-start; justify-content: center; line-height: 1.2; gap: 1px; }
.card.info .name small { font-size: 12.5px; color: #6b6b72; font-weight: 400; }
.card.info .name small em { font-style: normal; color: #1b264f; }
.card.wait { opacity: .55; }
.tr .tn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr .tc { width: 90px; text-align: right; color: #303033; font-variant-numeric: tabular-nums; }
.tr .tu { width: 150px; display: inline-flex; align-items: center; gap: 6px; color: #303033; white-space: nowrap; }
.tr .tu.none { color: #8f8f93; }
.tr .tu.big { color: #8a4b00; }
.tr.th .tc, .tr.th .tu { color: #000; font-weight: 700; }
.tr.th .sorted { text-decoration: underline; }
.filter .chip { display: inline-flex; align-items: center; gap: 8px; height: 25px; padding: 0 6px 0 10px; border-radius: 3px; background: #e3e6f7; color: #1b264f; font-size: 13.5px; font-weight: 700; }
.filter .chip .ic { opacity: .7; }
.filter .chip + i { margin-left: 10px; }

/* Review */
.rv { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #f7f7f8; }
.rvh { flex: none; height: 44px; display: flex; align-items: center; gap: 14px; padding: 0 20px; background: #fff; border-bottom: 1px solid #e3e3e6; font-size: 14px; color: #515054; }
.rvh b { color: #1b264f; }
.rvh .pbar { width: 220px; }
.rvb { flex: 1; min-height: 0; display: flex; }
.rvimg { flex: 1; min-width: 0; margin: 22px; border-radius: 4px; background-color: #111; background-size: contain; background-position: center; background-repeat: no-repeat; display: grid; place-items: center; position: relative; }
.rvimg .nav { position: absolute; top: 50%; width: 38px; height: 38px; margin-top: -19px; border-radius: 50%; background: rgba(255, 255, 255, .9); display: grid; place-items: center; color: #1b264f; box-shadow: 0 2px 6px rgba(0, 0, 0, .25); }
.rvimg .nav.l { left: 12px; }
.rvimg .nav.r { right: 12px; }
.rvside { flex: none; width: 330px; padding: 22px 22px 22px 0; display: flex; flex-direction: column; gap: 12px; }
.rvside .box { padding-bottom: 6px; }
.rvside h5 { margin: 0; padding: 14px 18px 6px; font-size: 18px; color: #1b264f; }
.rvside .wsp { padding: 6px 18px; grid-template-columns: 96px 1fr; }
.rvuse { display: flex; align-items: center; gap: 10px; margin: 10px 18px 12px; padding: 10px 12px; border-radius: 4px; background: #f3f3f5; color: #515054; font-size: 14px; }
.rvuse.ok { background: #e6f6ec; color: #2e8540; }
.rvact { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
.rvact .row { display: flex; gap: 8px; }
.rvact .dbtn { flex: 1; justify-content: center; height: 42px; font-size: 15px; }
.rvact .dbtn.keep { background: #fff; border: 1px solid #c2c2c2; }
.rvact small { text-align: center; color: #8f8f93; font-size: 12.5px; }
.rvact kbd { display: inline-block; min-width: 20px; padding: 0 5px; border: 1px solid #c2c2c2; border-bottom-width: 2px; border-radius: 3px; background: #fff; font: 11.5px Lato, sans-serif; color: #303033; }
.rvstrip { flex: none; height: 78px; display: flex; gap: 8px; align-items: center; padding: 0 22px; background: #fff; border-top: 1px solid #e3e3e6; }
.rvstrip span { width: 72px; height: 54px; border-radius: 3px; background-color: #ddd; background-size: cover; background-position: center; border: 1px solid #d8d7d9; }
.rvstrip span.on { box-shadow: 0 0 0 2px #3544b1; }
.rvstrip span.gone { opacity: .35; }

/* Item Info tab */
.wstab.on2 { background: #f5c1bc; }
.use { display: flex; flex-direction: column; }
.use .ur { display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-top: 1px solid #f0f0f2; font-size: 14.5px; }
.use .ur b { color: #1b264f; text-decoration: underline; }
.use .ur small { color: #6b6b72; }
.use .ur .st { margin-left: auto; font-size: 12.5px; padding: 2px 8px; border-radius: 3px; background: #e6f6ec; color: #2e8540; }
.use .ur .st.draft { background: #f3f3f5; color: #515054; }
.useh { display: flex; align-items: center; gap: 10px; padding: 14px 18px 10px; font-size: 15px; color: #1b264f; }
.useh .ic { color: #2e8540; }

/* Properties dialog window */
.props { flex: 1; display: flex; flex-direction: column; padding: 18px 22px; gap: 12px; background: #f7f7f8; font-size: 14.5px; }
.props .ph { display: flex; align-items: center; gap: 12px; }
.props .ph .fi { width: 46px; height: 46px; display: grid; place-items: center; color: #1b264f; background: #fff; border: 1px solid #d8d7d9; border-radius: 4px; }
.props .ph b { font-size: 17px; color: #1b264f; display: block; }
.props .ph small { color: #515054; }
.props .kv { display: grid; grid-template-columns: 120px 1fr; gap: 6px 14px; padding: 12px 16px; background: #fff; border-radius: 3px; border: 1px solid #e3e3e6; }
.props .kv b { color: #303033; }
.props .kv .a { display: inline-flex; gap: 10px; align-items: center; }
.props .kv .a u { color: #3544b1; text-decoration: underline; }
.props .pf { margin-top: auto; display: flex; justify-content: flex-end; gap: 8px; }

/* The options at the top */
.shapes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 16px 0 36px; }
.shape { background: #fff; border: 1px solid #d8dbe3; border-radius: 10px; padding: 16px 18px; }
.shape .letter { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #1b264f; color: #fff; font-weight: 700; margin-bottom: 8px; }
.shape h3 { margin: 0 0 6px; font-size: 16px; }
.shape p { margin: 0 0 8px; font-size: 14px; color: #4a4f63; }
.shape ul { margin: 0; padding-left: 18px; font-size: 13.5px; color: #4a4f63; }
.shape.rec { border-color: #e8573f; box-shadow: 0 0 0 1px #e8573f inset; }
.shape .tagline { font-size: 12.5px; color: #e8573f; font-weight: 700; }
`;

// ---------------------------------------------------------------------------------------------
// Pieces

const SEGS = [
  ['Products', 1.1, '#1b264f'],
  ['People', 0.62, '#3544b1'],
  ['Engage', 0.41, '#7b86d6'],
  ['Design', 0.18, '#b7bde8'],
  ['Other', 0.09, '#dcdfef'],
];
function spaceBar() {
  const total = SEGS.reduce((s, [, v]) => s + v, 0);
  return `<div class="mhbar"><div class="segs">${SEGS.map(([, v, c]) => `<span style="width:${(v / total) * 100}%;background:${c}"></span>`).join('')}</div><div class="legend">${SEGS.map(([n, v, c]) => `<span><i style="background:${c}"></i>${n} ${v >= 1 ? v.toFixed(1) + ' GB' : Math.round(v * 1000) + ' MB'}</span>`).join('')}</div></div>`;
}

function row(o) {
  const acts = (o.actions ?? []).map(([l, p]) => `<span class="tbtn${p ? ' primary' : ''}">${l}</span>`).join('');
  return `<div class="mhrow${o.cls ? ' ' + o.cls : ''}"><span class="mhi">${ic(o.icon, 20)}</span><span class="mht"><b>${o.title}</b><small>${o.text}</small></span><span class="mha">${acts}</span></div>`;
}

const ROWS = [
  { icon: 'unlink', title: 'Unused media', text: '<em>733 items, 94 MB</em> are not placed on any page.', actions: [['View'], ['Review...', true]] },
  { icon: 'drive', title: 'Orphaned files', text: '<em>58 files, 31 MB</em> are on disk with no media item.', actions: [['View'], ['Delete...']] },
  { icon: 'shrink', title: 'Oversized images', text: '<em>41 images, 212 MB</em> are over 2 MB. Optimizing them saves about 160 MB.', actions: [['View'], ['Optimize...', true]] },
];

/** The Media Health window at rest, after a check. */
function healthBody(o = {}) {
  return `<div class="mh">
<div class="mhsum"><div class="big">2.4 GB<small>1,284 items in 23 folders</small></div><div class="when"><span>Checked today, 3:12 PM</span><span class="tbtn">${ic('reload', 14)}Check again</span></div></div>
${spaceBar()}
<div class="mhrows">${ROWS.map(row).join('')}</div>
<div class="mhfoot">${ic('info', 15)}Usage and orphaned files are found by ProWorks MediaAudit.</div>
</div>`;
}

/** The same window while a check runs. */
function healthScanning() {
  return `<div class="mh">
<div class="mhprog"><div class="pt"><span>Checking the library...</span><span>412 of 1,284 items</span></div><div class="pbar"><span style="width:32%"></span></div></div>
<div class="mhrows">${ROWS.map((r) => row({ ...r, cls: 'dim', actions: [] })).join('')}</div>
<div class="mhfoot">${ic('info', 15)}You can close this window; the check keeps running and the taskbar shows how far it is.</div>
</div>`;
}

/** The Review window: one unused item at a time. */
function reviewBody() {
  const strip = ['knitted', 'banjo', 'jumpsuit', 'bowling', 'pingpong', 'unicorn', 'tattoo', 'biker']
    .map((id, i) => `<span class="th-${id}${i === 1 ? ' on' : ''}${i === 0 ? ' gone' : ''}"></span>`)
    .join('');
  return `<div class="rv">
<div class="rvh"><b>Review unused media</b><span>12 of 733</span><span class="pbar"><span style="width:1.6%"></span></span><span style="margin-left:auto">Largest first · 94 MB to go</span></div>
<div class="rvb">
<div class="rvimg th-banjo"><span class="nav l">${ic('left', 20)}</span><span class="nav r">${ic('right', 20)}</span></div>
<div class="rvside">
<div class="box"><h5>Banjo</h5>
<div class="wsp"><b>Folder</b><span>Products / 2023</span></div>
<div class="wsp"><b>Size</b><span>4.8 MB · 4000 × 3000</span></div>
<div class="wsp"><b>Last changed</b><span>14 Mar 2023</span></div>
<div class="rvuse">${ic('unlink', 16)}Not placed on any page</div>
</div>
<div class="rvact"><div class="row"><span class="dbtn keep">${ic('check', 16)}&nbsp;Keep</span><span class="dbtn danger">${ic('trash', 16)}&nbsp;Trash</span></div><div class="row"><span class="tbtn" style="flex:1;justify-content:center">${ic('eye', 14)}Open item</span><span class="tbtn" style="flex:1;justify-content:center">${ic('edit', 14)}Edit image</span></div><small><kbd>←</kbd> keep &nbsp; <kbd>→</kbd> trash &nbsp; <kbd>Space</kbd> skip</small></div>
</div></div>
<div class="rvstrip">${strip}</div>
</div>`;
}

/** The item workspace on its Info tab, with a Usage box. */
function infoBody(o) {
  const uses = [
    ['Homepage', 'Hero image', 'Published'],
    ['Spring campaign', 'Gallery · block 3', 'Published'],
    ['About us', 'Team photo', 'Draft'],
    ['Newsletter March', 'Header', 'Published'],
  ]
    .map(([p, prop, st]) => `<div class="ur">${ic('file', 15)}<b>${p}</b><small>${prop}</small><span class="st${st === 'Draft' ? ' draft' : ''}">${st}</span></div>`)
    .join('');
  return `<div class="ws">
<div class="wsh">${ic('image', 18)}<span class="wsname">${o.name}<span class="wsmore">${ic('more', 16)}</span></span><span class="wstabs"><span class="wstab">${ic('image', 18)}<span>Media</span></span><span class="wstab on">${ic('alert', 18)}<span>Info</span></span></span></div>
<div class="wsb" style="display:flex;flex-direction:column;gap:18px">
<div class="box use"><div class="useh">${ic('link', 18)}<b>Used on 4 pages</b><span style="margin-left:auto;font-size:13px;color:#6b6b72">Checked just now</span></div>${uses}</div>
<div class="box"><div class="boxh">File</div><div class="wsp"><b>Name</b><span>banjo.jpg</span></div><div class="wsp"><b>Size</b><span>4.8 MB · 4000 × 3000 ${ic('shrink', 13)} <u style="color:#3544b1">Optimize</u></span></div><div class="wsp"><b>Path</b><span>/media/q3fkz1a/banjo.jpg</span></div></div>
</div>
<div class="wsf"><span class="crumb"><u>Media</u> <span class="sl">/</span> <u>Products</u> <span class="sl">/</span> ${o.name}</span><span class="save">Save</span></div>
</div>`;
}

/** A folder's Properties dialog, as its own small window. */
function propsBody() {
  return `<div class="props">
<div class="ph"><span class="fi">${ic('folder', 26)}</span><span><b>Products</b><small>Media / Products</small></span></div>
<div class="kv"><b>Size</b><span>1.1 GB</span><b>Contains</b><span>312 items in 8 folders</span><b>Last change</b><span>Yesterday, 16:40 by Janae</span></div>
<div class="kv"><b>Unused</b><span class="a">41 items, 38 MB <u>View</u> <u>Review</u></span><b>Oversized</b><span class="a">12 images, 96 MB <u>View</u> <u>Optimize</u></span><b>Checked</b><span>Today, 3:12 PM</span></div>
<div class="pf"><span class="tbtn">${ic('activity', 14)}Open Media Health</span><span class="tbtn primary">Close</span></div>
</div>`;
}

/** Core's collection toolbar plus our own table with Size and Used on columns. */
function tableCollection(o) {
  const toolbar = `<div class="toolbar"><span class="btn">Create ${ic('right', 13)}</span><span class="filter">${o.filter ?? '<i>Type to filter...</i>'}</span><span class="viewbtn">${ic('list', 16)}</span></div>`;
  const rows = o.rows
    .map(
      (r) =>
        `<div class="tr${r.selected ? ' selected' : ''}"><span class="cb${r.selected ? ' on' : ''}">${r.selected ? ic('check', 12) : ic(r.folder ? 'folder' : 'image', 16)}</span><span class="tn">${r.name}</span><span class="tc">${r.size}</span><span class="tu${r.used === 0 ? ' none' : ''}${r.big ? ' big' : ''}">${r.folder ? '' : r.used === 0 ? ic('unlink', 14) + 'Not used' : ic('link', 14) + (r.used === 1 ? '1 page' : r.used + ' pages')}</span><span class="tacts">${ic('more', 16)}${ic('plus', 15)}</span></div>`,
    )
    .join('');
  const head = `<div class="tr th"><span class="cb"></span><b class="tn">Name</b><b class="tc${o.sort === 'size' ? ' sorted' : ''}">Size ${o.sort === 'size' ? '↓' : ''}</b><b class="tu">Used on</b><span class="tacts" style="visibility:hidden">${ic('more', 16)}${ic('plus', 15)}</span></div>`;
  const sel = o.selectionBar
    ? `<div class="selbar"><div class="si"><span class="sbtn">Clear selection</span><span>${o.selectionBar}</span></div><div class="si">${o.bulk.map(([l, ours]) => `<span class="sbtn${ours ? ' ours' : ''}">${l}</span>`).join('')}</div></div>`
    : '';
  return `<div class="coll">${toolbar}<div class="scroll"><div class="table">${head}${rows}</div></div>${sel}</div>`;
}

/** A Manager window around a table collection. */
function managerTable(o) {
  const body = `<div class="mm">${k.tree({ current: o.current })}${tableCollection(o)}</div>`;
  return k.win({ ...o, body });
}

const chip = (icon, text) => `<span class="chip">${ic(icon, 13)}${text}${ic('x', 13)}</span><i>Type to filter...</i>`;
const sz = (s) => `<span class="sz">${s}</span>`;
const tag = (icon, text, cls = '') => `<span class="tag ${cls}">${ic(icon, 12)}${text}</span>`;

// ---------------------------------------------------------------------------------------------
// Scenes

const TASKS_MM = [{ label: 'Media Manager', icon: 'image', active: true }];

const scenes = [];

// 1. The Media Health app at rest.
{
  const hw = { x: 470, y: 150, w: 660, h: 580, title: 'Media Health', icon: 'activity', active: true };
  scenes.push(
    k.scene({
      id: 'app',
      title: '1. Media Health, the app, after a check',
      lede: 'One window, three checks and a picture of where the space goes. Each row has its own verb, because the right answer differs per row: unused media wants reviewing, orphaned files want deleting, oversized images want optimizing.',
      wins: [k.win({ ...hw, body: healthBody() })],
      tasks: [{ label: 'Media Health', icon: 'activity', active: true }],
      notes: [
        [1, 700, 230, 'The library in one line: total size, items, folders. The bar underneath is the top-level folders by size, so "where did 2.4 GB go?" is answered before you scroll.'],
        [2, 1000, 400, 'View opens a Media Manager window filtered to that category (scene 3). Review and Optimize are the actions that make the category smaller (scenes 5 and 7). Delete on orphaned files is MediaAudit\'s, with its re-check and log.'],
        [3, 640, 690, 'Credit where the data comes from. The sizes check and the bar are ours, computed over the items we already list.'],
        [4, 300, 950, 'Taskbar button, like any app. No new entry in the Manager\'s sidebar.'],
      ],
    }),
  );
}

// 2. A check running while you work.
{
  const hw = { x: 60, y: 300, w: 660, h: 560, title: 'Media Health', icon: 'activity' };
  const mm = { x: 560, y: 80, w: 980, h: 700, title: 'Media Manager', icon: 'image', active: true, current: 'products', items: [...k.PRODUCTS] };
  scenes.push(
    k.scene({
      id: 'scan',
      title: '2. A check runs in the background',
      lede: 'Start a check and carry on. The window shows how far it is; so does the taskbar button, through window progress (#108). Minimise it and nothing stops.',
      wins: [k.win({ ...hw, body: healthScanning() }), k.manager(mm)],
      tasks: [{ label: 'Media Health', icon: 'activity', progress: 0.32 }, ...TASKS_MM],
      notes: [
        [1, 390, 380, 'A real count, 412 of 1,284, not a spinner. MediaAudit reports totals only at the end today; this is the first thing to ask its author for.'],
        [2, 300, 955, 'The ring on the taskbar button is the same progress, so the window can be minimised.'],
      ],
    }),
  );
}

// 3. View: the Manager filtered to unused media, largest first.
{
  const items = k.byId(k.PRODUCTS, 'banjo', 'knitted', 'tattoo', 'biker', 'jumpsuit', 'bowling', 'unicorn', 'pingpong');
  const sizes = ['4.8 MB', '3.9 MB', '3.1 MB', '2.6 MB', '1.9 MB', '1.2 MB', '840 KB', '610 KB'];
  const state = {};
  items.forEach((it, i) => (state[it.id] = { badge: sz(sizes[i]), selected: i < 3 }));
  const mm = { x: 180, y: 70, w: 1240, h: 800, title: 'Media Manager', icon: 'image', active: true, items, state, filter: chip('unlink', 'Unused media · 733 items · 94 MB'), selectionBar: '3 items selected · 11.8 MB', bulk: [['Move to'], ['Copy to', true], ['Trash']], treeOpts: {} };
  scenes.push(
    k.scene({
      id: 'view',
      title: '3. View: a Manager window filtered to one category',
      lede: 'View does not open a report. It opens the Media Manager you already know, with the category as a filter token in the filter box, sorted by size. Cards, selection, Trash, Edit image, drag to a folder: all the same.',
      wins: [k.manager(mm)],
      tasks: TASKS_MM,
      notes: [
        [1, 910, 150, 'The category is a token in core\'s filter box. Clear it and you are back in the tree. No new sidebar entry, no mode.'],
        [2, 620, 470, 'Every card shows its size in this view, and the biggest come first, so the first screen is the biggest win.'],
        [3, 1000, 845, 'Core\'s own selection bar and Trash. A trash from here goes through MediaAudit\'s delete, which re-checks each item is still unused and logs it. The tree is not highlighted: these items come from many folders.'],
      ],
    }),
  );
}

// 4. Facts in the Manager at rest.
{
  const rootItems = k.FOLDERS;
  const rootState = {
    engage: { badge: tag('pie', '410 MB') },
    people: { badge: tag('pie', '620 MB') },
    design: { badge: tag('pie', '180 MB') },
    products: { badge: tag('pie', '1.1 GB') + '<span class="tag" style="left:auto;right:8px;color:#8a4b00">41 unused</span>' },
  };
  const left = { x: 40, y: 70, w: 720, h: 560, title: 'Media Manager', icon: 'image', current: 'media', items: rootItems, state: rootState, noCreate: false };
  const rows = [
    { name: '2023', folder: true, size: '310 MB', used: null },
    { name: 'Banjo', size: '4.8 MB', used: 0 },
    { name: 'Knitted West', size: '3.9 MB', used: 0, big: true },
    { name: 'Biker Jacket', size: '2.6 MB', used: 4 },
    { name: 'Jumpsuit', size: '1.9 MB', used: 1 },
    { name: 'Bowling Ball', size: '1.2 MB', used: 2 },
    { name: 'Unicorn', size: '840 KB', used: 0 },
    { name: 'Ping Pong Ball', size: '610 KB', used: 7 },
  ];
  const right = { x: 790, y: 180, w: 770, h: 680, title: 'Media Manager', icon: 'image', active: true, current: 'products', rows, sort: 'size' };
  scenes.push(
    k.scene({
      id: 'facts',
      title: '4. The facts where you already are',
      lede: 'Nothing here needs the app open. Folders carry their size; the list view gets Size and Used on columns and sorts by them. This is the half that makes the Manager better every day, not only on cleanup day.',
      wins: [k.manager(left), managerTable(right)],
      tasks: TASKS_MM,
      notes: [
        [1, 330, 260, 'A folder card wears its size, and a count of unused items when there are any. Quiet: small, grey, bottom corner, not a red badge.'],
        [2, 1250, 300, 'List view: Size and Used on, sortable. "Not used" is grey, not alarming; it is a fact, not a warning. The amber on Knitted West means oversized.'],
        [3, 1150, 560, 'Used on shows the count; the item\'s Info tab (scene 6) names the pages.'],
      ],
    }),
  );
}

// 5. Review unused media, one at a time.
{
  const rw = { x: 250, y: 90, w: 1100, h: 760, title: 'Review unused media', icon: 'unlink', active: true };
  scenes.push(
    k.scene({
      id: 'review',
      title: '5. Review: one item at a time',
      lede: 'Cleaning 733 items from a grid is a chore. Reviewing them one at a time, largest first, with Keep and Trash under your fingers, is the part that could make an editor like doing it. Like sorting holiday photos.',
      wins: [k.win({ ...rw, body: reviewBody() })],
      tasks: [{ label: 'Review unused media', icon: 'unlink', active: true }],
      notes: [
        [1, 700, 450, 'The image big enough to judge. Arrows, or the keys, move on.'],
        [2, 1180, 330, 'What you need to decide: where it is, how big, how old, and that nothing uses it. Open item and Edit image are a click away.'],
        [3, 1180, 690, 'Keep marks it reviewed so it does not come back next time. Trash goes through MediaAudit\'s delete. The header counts down the megabytes.'],
        [4, 700, 810, 'The strip shows what is coming and what you already did.'],
      ],
    }),
  );
}

// 6. The item knows where it is used, and Edit image warns before saving over.
{
  const ww = { x: 40, y: 70, w: 760, h: 700, title: 'Banjo', icon: 'image' };
  const ew = { x: 840, y: 120, w: 720, h: 640, title: 'Edit image: Banjo', icon: 'edit', active: true, dirty: true };
  const editBody = `<div style="flex:1;display:flex;flex-direction:column;background:#2b2b30"><div style="flex:none;height:44px;display:flex;align-items:center;gap:14px;padding:0 16px;background:#f7f7f8;border-bottom:1px solid #e3e3e6;color:#303033;font-size:14px"><span>Crop</span><span>Rotate</span><span>Flip</span><span>Adjust</span><span style="margin-left:auto" class="tbtn sm">Cancel</span><span class="tbtn sm primary">Save ${ic('down', 12)}</span></div><div class="th-banjo" style="flex:1;margin:20px;background-size:contain;background-position:center;background-repeat:no-repeat"></div></div>`;
  const dialog = k
    .dialog({
      headline: 'Save over the original?',
      text: 'Banjo is placed on 4 pages. They will all show the edited image. Save a copy to keep the original as it is.',
      actions: [['Cancel'], ['Save a copy'], ['Save over', 'danger']],
    })
    .replace('class="dialog"', 'class="dialog" style="left:1200px"');
  scenes.push(
    k.scene({
      id: 'item',
      title: '6. The item: Used on, and a warning before saving over',
      lede: 'Per item, "where is this used" comes from core\'s own references, so this works with or without MediaAudit. The Info tab names the pages, and Edit image says it out loud before an overwrite.',
      wins: [k.win({ ...ww, body: infoBody({ name: 'Banjo' }) }), k.win({ ...ew, body: editBody })],
      tasks: [{ label: 'Banjo', icon: 'image' }, { label: 'Edit image: Banjo', icon: 'edit', active: true }],
      over: dialog,
      notes: [
        [1, 420, 250, 'The Info tab\'s Usage box lists the pages, the property, and whether that page is published. Each is a link. The scrim is the dialog\'s, not ours.'],
        [2, 1200, 290, 'Edit image\'s Save over (from #176) asks when the image is on pages. Save a copy is the safe way out.'],
        [3, 700, 450, 'The File box carries an Optimize link when the file is oversized, the same hand-off as the app\'s Optimize.'],
      ],
    }),
  );
}

// 7. Folder properties.
{
  const items = k.FOLDERS;
  const mm = { x: 40, y: 70, w: 820, h: 620, title: 'Media Manager', icon: 'image', active: false, current: 'media', items, state: { products: { hover: true } } };
  const menuItems = [...k.CORE_ITEM_MENU, ['activity', 'Properties...', true]];
  const r = k.cardRect(mm, 3);
  const pw = { x: 900, y: 200, w: 520, h: 470, title: 'Products properties', icon: 'folder', active: true };
  scenes.push(
    k.scene({
      id: 'props',
      title: '7. Properties on a folder',
      lede: 'The OS way to ask "how big is this and what is in it": Properties on a folder. Size, counts, and the health of just this folder, with the same View, Review and Optimize verbs scoped to it.',
      wins: [k.manager(mm), k.win({ ...pw, body: propsBody() })],
      over: k.menu(menuItems, r.x + r.w - 40, r.y + 40),
      tasks: [...TASKS_MM, { label: 'Products properties', icon: 'folder' }],
      notes: [
        [1, r.x + r.w - 20, r.y + 250, 'One entry in core\'s item menu, marked as ours like Copy to is.'],
        [2, 1160, 420, 'Everything the app says about the library, said about one folder. For a client folder or a campaign, this is the view that matters.'],
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Page

const shapes = `<div class="shapes">
<div class="shape"><span class="letter">A</span><h3>An app</h3><p>Media Health in the launcher, Disk Cleanup style. Scenes 1, 2, 5.</p><ul><li>Self-contained, easy to explain</li><li>Lives beside the Manager, not in it</li><li>The Manager learns nothing</li></ul></div>
<div class="shape"><span class="letter">B</span><h3>In the Manager only</h3><p>A pane or token inside the Manager. Scenes 3, 4, 7.</p><ul><li>No new app</li><li>Library-wide checks squeezed into a window about one folder</li><li>A scan with no window of its own</li></ul></div>
<div class="shape rec"><span class="letter">C</span><span class="tagline">My pick</span><h3>Both, with a split</h3><p>The app owns the library-wide checks and the actions. The Manager carries the facts. All scenes.</p><ul><li>View from the app opens the Manager, filtered</li><li>Sizes, Used on and unused marks live on cards, rows and the Info tab</li><li>Properties on a folder is the app scoped to one folder</li></ul></div>
</div>`;

const html = k.page({
  title: 'Media Health: what cleaning up could look like',
  lede: `<style>${CSS}</style><p class="lede">Seven scenes for #141, renamed Media Health because it checks more than unused files: where the space goes, what is unused, what is orphaned on disk, and what is oversized and could go through Optimize images. Drawn on the Media Manager kit so they sit next to the Manager and the item as built.</p>
<p class="lede">Three shapes first; the scenes follow.</p>${shapes}`,
  sections: scenes,
  questions: [
    'The shape: A, B or C?',
    'The name: Media Health, Media Cleanup, or something else? Health says it is more than deleting; Cleanup says what you came for.',
    'Which checks in the first version: the space bar, unused, orphaned, oversized? Any to drop or add?',
    'Which facts in the Manager (scene 4): the folder size tag, the unused count, the Size and Used on columns? All, some, none?',
    'Review (scene 5): in the first version, later, or not at all?',
    'The item\'s Usage box and the Save over warning (scene 6): in, since they need only core?',
    'Properties on a folder (scene 7): in, later, or not at all?',
  ],
});

fs.writeFileSync(path.join(__dirname, '..', 'health.html'), html);
console.log('wrote health.html');
