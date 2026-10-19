// The drawing kit for the Media Manager mocks: the desktop, a window, the folder tree, and core's
// media collection as it renders today. Everything returns static HTML, because the side panel
// that shows these runs no scripts.
//
// Geometry is the Umbraco theme's and core's own: a 40px caption, a 52px taskbar, core's grid at
// minmax(200px, 1fr) with 200px rows and an 18px gap, 24px of padding round the collection. The
// helpers below compute card and tree positions with the same numbers the CSS uses, so a cursor
// drawn "over Banjo" lands on Banjo.
const fs = require('fs');
const path = require('path');

const IMG = path.join(__dirname, 'img');

/** Stage size: the spike screenshots' 1600x1000, so the mocks compare 1:1 with them. */
const W = 1600;
const H = 1000;
const TASKBAR = 52;
const CAPTION = 40;
const TREE = 240;
const PAD = 24;
const TOOLBAR = 32;
const GRID_TOP = PAD + TOOLBAR + 26;
const ROW = 200;
const GAP = 18;
const MIN_COL = 200;

const PRODUCTS = [
  ['knitted', 'Knitted West'], ['banjo', 'Banjo'], ['jumpsuit', 'Jumpsuit'], ['bowling', 'Bowling Ball'],
  ['pingpong', 'Ping Pong Ball'], ['unicorn', 'Unicorn'], ['tattoo', 'Tattoo'], ['biker', 'Biker Jacket'],
].map(([id, name]) => ({ id, name }));
const PEOPLE = [
  ['ravi', 'Ravi Motha'], ['janae', 'Janae Cram'], ['erica', 'Erica Quessenberry'], ['poornima', 'Poornima Nayar'],
  ['emmanuel', 'Emmanuel Tissera'], ['busra', 'Busra Şengül'],
].map(([id, name]) => ({ id, name }));
const FOLDERS = ['Engage', 'People', 'Design', 'Products'].map((name) => ({ id: name.toLowerCase(), name, folder: true }));
const byId = (list, ...ids) => ids.map((id) => list.find((i) => i.id === id));

/** Lucide paths, the icon set the backoffice uses. */
const ICONS = {
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  more: '<circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/><circle cx="5" cy="12" r="1.3" fill="currentColor"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  grid: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  moveTo: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
  sort: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  reload: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  export: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  newWindow: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M12 11v6"/><path d="M9 14h6"/>',
  expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  restore: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><path d="M12 3v12"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
};
const ic = (name, size = 16, extra = '') =>
  `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/** One CSS rule per thumbnail, so each image is in the file once however many scenes use it. */
function thumbCss() {
  return fs
    .readdirSync(IMG)
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => `.th-${f.replace('.jpg', '')}{background-image:url(data:image/jpeg;base64,${fs.readFileSync(path.join(IMG, f)).toString('base64')})}`)
    .join('\n');
}

/** Columns core's grid gets in a window `w` wide with the tree showing. */
function cols(w, tree = true) {
  const inner = w - (tree ? TREE : 0) - PAD * 2;
  const n = Math.max(1, Math.floor((inner + GAP) / (MIN_COL + GAP)));
  return { n, col: (inner - (n - 1) * GAP) / n, inner };
}

/** Where card `i` is on the stage, for a window placed at `win`. */
function cardRect(win, i, { scroll = 0, tree = true } = {}) {
  const { n, col } = cols(win.w, tree);
  const x = win.x + (tree ? TREE : 0) + PAD + (i % n) * (col + GAP);
  const y = win.y + CAPTION + GRID_TOP + Math.floor(i / n) * (ROW + GAP) - scroll;
  return { x, y, w: col, h: ROW, cx: x + col / 2, cy: y + ROW / 2 };
}

/** Where tree row `i` is on the stage. */
function treeRect(win, i) {
  return { x: win.x + 8, y: win.y + CAPTION + 12 + i * 36, w: TREE - 16, h: 36 };
}

/**
 * Core's upload placeholder: a disabled card with umb-temporary-file-badge, a ring that fills,
 * then turns into a tick (or a red mark on error).
 */
function placeholder(name, s) {
  const p = s.done ? 1 : s.progress ?? 0;
  const mid = s.error ? ic('alert', 22) : s.done ? ic('check', 22) : ic('upload', 20);
  return `<div class="card ph${s.error ? ' err' : ''}"><div class="media none"><span class="tfb" style="--p:${p}">${mid}</span></div><div class="name">${name}</div></div>`;
}

/** A core media card. */
function card(it, s = {}) {
  if (s.placeholder) return placeholder(it.name, s.placeholder);
  const cls = ['card', s.selected && 'selected', s.dim && 'dim', s.drop && 'drop', s.hover && 'hover', s.cut && 'cut', s.flash && 'flash', s.busy && 'busy', s.open && 'open'].filter(Boolean).join(' ');
  const media = it.folder
    ? `<div class="media folder">${ic(s.drop ? 'folderOpen' : 'folder', 26)}</div>`
    : it.id
      ? `<div class="media th-${it.id}"></div>`
      : `<div class="media none">${ic(it.icon ?? 'image', 26)}</div>`;
  const chrome =
    s.selected || s.hover
      ? `<span class="cb">${s.selected ? ic('check', 12) : ''}</span><span class="acts"><span class="act">${ic('more', 16)}</span><span class="act">${ic('plus', 15)}</span></span>`
      : '';
  return `<div class="${cls}">${media}<div class="name">${it.name}</div>${chrome}${s.badge ?? ''}</div>`;
}

/** Core's dropdown of entity actions, plus any items of ours, which are marked. */
function menu(items, x, y) {
  return `<div class="menu" style="left:${x}px;top:${y}px">${items
    .map(([icon, label, ours]) => `<div class="mi${ours ? ' ours' : ''}">${ic(icon, 15)}<span>${label}</span></div>`)
    .join('')}</div>`;
}
const CORE_ITEM_MENU = [['plus', 'Create...'], ['trash', 'Trash...'], ['moveTo', 'Move to...'], ['sort', 'Sort children...'], ['export', 'Export'], ['reload', 'Reload children']];

/**
 * Core's media collection: toolbar, grid (or table) and, when something is selected, the
 * selection bar in its footer. `state` maps item ids to card states.
 */
function collection(o) {
  const items = o.items;
  const state = o.state ?? {};
  const toolbar = `<div class="toolbar">${o.noCreate ? '' : `<span class="btn">Create ${ic('right', 13)}</span>`}<span class="filter">${o.filter ?? '<i>Type to filter...</i>'}</span><span class="viewbtn">${ic(o.view === 'table' ? 'list' : 'grid', 16)}</span></div>`;
  let body;
  if (o.view === 'table') {
    body = `<div class="table" style="transform:translateY(${-(o.scroll ?? 0)}px)"><div class="tr th"><span class="cb"></span><b>Name</b></div>${items
      .map((it) => {
        const s = state[it.id] ?? {};
        return `<div class="tr${s.selected ? ' selected' : ''}${s.drop ? ' drop' : ''}${s.dim ? ' dim' : ''}${s.flash ? ' flash' : ''}"><span class="cb${s.selected ? ' on' : ''}">${s.selected ? ic('check', 12) : ic(it.folder ? 'folder' : 'image', 16)}</span><span class="tn">${it.name}</span><span class="tacts">${ic('more', 16)}${ic('plus', 15)}</span></div>`;
      })
      .join('')}</div>`;
  } else {
    body = `<div class="grid" style="transform:translateY(${-(o.scroll ?? 0)}px)">${items.map((it) => card(it, state[it.id])).join('')}</div>`;
  }
  // Core's bulk actions, with ours ("Copy to", shown only in the manager) after core's Move to.
  const bulk = o.bulk ?? [['Move to'], ['Copy to', true], ['Trash']];
  const sel = o.selectionBar
    ? `<div class="selbar"><div class="si"><span class="sbtn">Clear selection</span><span>${o.selectionBar}</span></div><div class="si">${bulk
        .map(([label, ours]) => `<span class="sbtn${ours ? ' ours' : ''}">${label}</span>`)
        .join('')}</div></div>`
    : '';
  const empty = items.length === 0 ? `<div class="empty">${o.empty ?? 'No items'}</div>` : '';
  // Core's uui-loader-bar under the toolbar while its dropzone uploads.
  const loader = o.loader != null ? `<div class="loader"><span style="width:${o.loader * 100}%"></span></div>` : '';
  // Core's dropzone while files from the OS are over it: a 1px focus-coloured frame.
  const coreDrop = o.coreDrop ? `<div class="coredrop"></div>` : '';
  const strip = o.clip ? clipStrip(o.clip) : '';
  return `<div class="coll${o.dropAll ? ' dropall' : ''}">${toolbar}${loader}<div class="scroll">${body}${empty}</div>${strip}${sel}${coreDrop}${o.extra ?? ''}</div>`;
}

/**
 * Ours: the strip that shows what the manager's clipboard holds, in every manager window, until
 * it is pasted or cleared. `{ text, action }`.
 */
function clipStrip(c) {
  return `<div class="clip">${ic(c.icon ?? 'clipboard', 16)}<span class="ct">${c.text}</span>${c.action ? `<span class="cbtn">${c.action}</span>` : ''}<span class="cx">${ic('x', 14)}</span></div>`;
}

/** The folder tree: Media, its folders, and the recycle bin at the foot. */
function tree(o = {}) {
  const rows = o.rows ?? [
    { label: 'Media', icon: 'image', depth: 0, open: true, id: 'media' },
    { label: 'Engage', icon: 'folder', depth: 1, kids: true, id: 'engage' },
    { label: 'People', icon: 'folder', depth: 1, kids: true, id: 'people' },
    { label: 'Design', icon: 'folder', depth: 1, id: 'design' },
    { label: 'Products', icon: 'folder', depth: 1, kids: true, id: 'products' },
  ];
  const row = (r) => {
    const cls = ['tri', o.current === r.id && 'current', o.drop === r.id && 'drop', o.refuse === r.id && 'refuse'].filter(Boolean).join(' ');
    const caret = r.open ? ic('down', 13) : r.kids ? ic('right', 13) : '<span style="width:13px;display:inline-block"></span>';
    return `<div class="${cls}" style="padding-left:${10 + r.depth * 18}px"><span class="caret">${caret}</span>${ic(r.icon, 16)}<span class="tl">${r.label}</span></div>`;
  };
  const bin = { label: 'Recycle bin', icon: 'trash', depth: 0, id: 'bin' };
  return `<div class="tree">${rows.map(row).join('')}<div class="binrow">${row(bin)}</div></div>`;
}

/** A desktop window in the Umbraco theme. */
function win(o) {
  const strip = o.attachedTo
    ? `<div class="astrip">Attached to <b>${o.attachedTo}</b><span class="tbtn sm${o.dockOff ? ' off' : ''}">${ic('newWindow', 13)}Dock</span></div>`
    : '';
  return `<div class="win${o.active ? ' active' : ''}" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px">
<div class="wcap">${ic(o.icon ?? 'image', 17)}<span class="title">${o.title}${o.dirty ? '<span class="dirty"></span>' : ''}</span><span class="ctl">${ctl('min')}${ctl('max')}${ctl('close')}</span></div>
${strip}<div class="wbody">${o.body}</div></div>`;
}
function ctl(kind) {
  const g = {
    min: '<path d="M6 12h12"/>',
    max: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  }[kind];
  return `<span class="cb2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${g}</svg></span>`;
}

/** A Media Manager window: tree on the left, core's collection on the right. */
function manager(o) {
  const body = `<div class="mm${o.tree === false ? ' notree' : ''}">${o.tree === false ? '' : tree(o.treeOpts ?? { current: o.current })}${collection(o)}</div>${o.pane ?? ''}`;
  return win({ ...o, body });
}

/** The taskbar. `tasks` are { label, active, icon, progress }. */
function taskbar(tasks = []) {
  const pinned = ['expand', 'chat', 'copy', 'image', 'archive'].map((n) => `<span class="pin">${ic(n, 20)}</span>`).join('');
  const t = tasks
    .map(
      (k) =>
        `<span class="task${k.active ? ' active' : ''}">${k.progress != null ? `<span class="ring" style="--p:${k.progress}"></span>` : ''}${ic(k.icon ?? 'image', 17)}<span class="lbl">${k.label}</span></span>`,
    )
    .join('');
  return `<div class="taskbar"><span class="logo">U</span>${pinned}${t}<span class="clock">3:25 PM</span></div>`;
}

/** The mouse pointer; `copy` adds the OS's plus badge, `no` the not-allowed badge. */
function cursor(x, y, kind = 'move') {
  const badge =
    kind === 'copy'
      ? '<g transform="translate(13 15)"><rect width="11" height="11" rx="1.5" fill="#fff" stroke="#000" stroke-width="1"/><path d="M5.5 2.5v6M2.5 5.5h6" stroke="#000" stroke-width="1.4"/></g>'
      : kind === 'no'
        ? '<g transform="translate(13 15)"><circle cx="5.5" cy="5.5" r="5" fill="#fff" stroke="#c00" stroke-width="1.6"/><path d="M2 2l7 7" stroke="#c00" stroke-width="1.6"/></g>'
        : '';
  return `<svg class="cursor" style="left:${x}px;top:${y}px" width="26" height="28" viewBox="0 0 26 28"><path d="M1 1v18l4.5-4.2 3.2 7.2 3-1.3-3.1-7h6.2Z" fill="#000" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>${badge}</svg>`;
}

/**
 * What follows the pointer while dragging: the items' thumbnails, a count when there are several,
 * and a label saying what letting go will do.
 */
function ghost(x, y, o) {
  const thumbs = o.items
    .slice(0, 3)
    .map((it, i) => `<span class="gt ${it.id ? 'th-' + it.id : ''}" style="left:${i * 6}px;top:${i * 6}px;z-index:${3 - i}">${it.id ? '' : ic('image', 18)}</span>`)
    .reverse()
    .join('');
  const count = o.items.length > 1 ? `<span class="gcount">${o.items.length}</span>` : '';
  const label = o.label
    ? `<div class="glabel${o.refuse ? ' refuse' : ''}">${ic(o.refuse ? 'ban' : o.copy ? 'plus' : 'arrow', 14)}<span>${o.label}</span>${o.hint ? `<small>${o.hint}</small>` : ''}</div>`
    : '';
  return `<div class="ghost" style="left:${x - 30}px;top:${y - 46}px">${thumbs}${count}</div>${cursor(x, y, o.refuse ? 'no' : o.copy ? 'copy' : 'move')}${label ? `<div class="glwrap" style="left:${x + 18}px;top:${y + 26}px">${label}</div>` : ''}`;
}

/**
 * A drag that comes from the operating system. The ghost and its "+ Copy" label are drawn by
 * Windows, not by us, so they look like Windows whatever the desktop theme is.
 */
function osGhost(x, y, count, label = 'Copy') {
  const stack = [0, 1, 2]
    .slice(0, Math.min(3, count))
    .map((i) => `<span class="ost" style="left:${i * 5}px;top:${i * 5}px">${ic('file', 30)}</span>`)
    .reverse()
    .join('');
  return `<div class="osg" style="left:${x - 34}px;top:${y - 70}px">${stack}${count > 1 ? `<span class="osc">${count}</span>` : ''}</div>${cursor(x, y, 'copy')}<div class="ostip" style="left:${x + 16}px;top:${y + 24}px">+ ${label}</div>`;
}

/** A Windows File Explorer window, outside the browser, for drags that start there. */
function explorer(o) {
  const rows = o.rows
    .map((r) => `<div class="exr${r.sel ? ' sel' : ''}">${ic(r.folder ? 'folder' : 'file', 16)}<span>${r.name}</span><span class="exm">${r.meta ?? ''}</span></div>`)
    .join('');
  return `<div class="explorer" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px"><div class="exc">${ic('folder', 15)}<span>${o.title}</span><span class="exctl">&#8212;&nbsp;&nbsp;&#9744;&nbsp;&nbsp;&#10005;</span></div><div class="exb">${rows}</div></div>`;
}

/**
 * Ours: the transfer window's content. One section per operation, newest last; each has an
 * overall bar and a row per item.
 */
function transfers(ops) {
  const status = (it) => {
    if (it.status === 'done') return `<span class="ts ok">${ic('check', 16)}</span>`;
    if (it.status === 'fail') return `<span class="ts bad">${ic('alert', 16)}</span>`;
    if (it.status === 'wait') return `<span class="ts wait">Waiting</span>`;
    if (it.status === 'skip') return `<span class="ts wait">Cancelled</span>`;
    return `<span class="ts run"><span class="mini"><span style="width:${(it.p ?? 0) * 100}%"></span></span>${Math.round((it.p ?? 0) * 100)}%</span>`;
  };
  const row = (it) =>
    `<div class="trow${it.status === 'fail' ? ' fail' : ''}"><span class="tth ${it.thumb ? 'th-' + it.thumb : ''}">${it.thumb ? '' : ic(it.folder ? 'folder' : 'file', 16)}</span><span class="tnm"><b>${it.name}</b>${it.path ? `<small>${it.path}</small>` : ''}${it.reason ? `<em>${it.reason}</em>` : ''}</span>${status(it)}${it.status === 'fail' && it.retry !== false ? '<span class="tbtn sm">Retry</span>' : ''}</div>`;
  const op = (o) => `<div class="top${o.state ? ' ' + o.state : ''}">
<div class="toh">${ic(o.icon ?? 'upload', 18)}<b>${o.title}</b><span class="tob">${(o.buttons ?? []).map((b) => `<span class="tbtn${b.primary ? ' primary' : ''}">${b.icon ? ic(b.icon, 14) : ''}${b.label}</span>`).join('')}</span></div>
${o.overall != null ? `<div class="tbar${o.state === 'paused' ? ' paused' : ''}"><span style="width:${o.overall * 100}%"></span></div>` : ''}
<div class="tmeta">${o.meta ?? ''}</div>
${o.items ? `<div class="tlist">${o.items.map(row).join('')}</div>` : ''}</div>`;
  return `<div class="transfers">${ops.map(op).join('')}</div>`;
}

/**
 * Core's media workspace for an Image: name and views in the header, the image cropper and the
 * file's label properties in the body, the breadcrumb and Save in the footer.
 */
function workspace(o) {
  const name = o.isNew ? '<i>Enter a name...</i>' : o.name;
  const image = o.isNew
    ? `<div class="wsdrop">${ic('upload', 22)}<span>Drop a file here, or</span><span class="btn">Click to upload</span></div>`
    : `<div class="wsimg th-${o.thumb}"><span class="focal"></span></div><div class="wsbtns"><span class="tbtn sm">Remove file</span></div>`;
  const labels = o.isNew
    ? ''
    : [['Width', o.width ?? '1200 px'], ['Height', o.height ?? '800 px'], ['Size', o.size ?? '245 KB'], ['Type', 'jpg']]
        .map(([k, v]) => `<div class="wsp"><b>${k}</b><span>${v}</span></div>`)
        .join('');
  return `<div class="ws">
<div class="wsh">${ic('image', 18)}<span class="wsname">${name}<span class="wsmore">${ic('more', 16)}</span></span><span class="wstabs"><span class="wstab on">${ic('image', 18)}<span>Media</span></span><span class="wstab">${ic('alert', 18)}<span>Info</span></span></span></div>
<div class="wsb"><div class="box"><div class="boxh">Image</div><div class="wsp col"><b>Image</b>${image}</div>${labels}</div></div>
<div class="wsf"><span class="crumb">${o.crumb.map((c, i) => (i < o.crumb.length - 1 ? `<u>${c}</u>` : c)).join(' <span class="sl">/</span> ')}</span><span class="save${o.dirty ? '' : ''}">Save</span></div>
</div>`;
}

/**
 * Ours: the manager's item pane, part of the manager window's own layout rather than an attached
 * pane, because it holds the workspace's unsaved work. The header matches an attached pane's.
 */
function itemPane(o) {
  return `<div class="ipane" style="width:${o.w}px"><div class="iph">${ic('image', 15)}<span>${o.title}</span>${o.dirty ? '<span class="dirty"></span>' : ''}<span class="ipb">${ic('reload', 15)}${ic('expand', 15, o.dirty ? 'off' : '')}${ic('x', 15)}</span></div>${o.body}</div>`;
}

/** Core's confirmation dialog over the whole desktop, as core's modals open. */
function dialog(o) {
  return `<div class="scrim"></div><div class="dialog"><h4>${o.headline}</h4><p>${o.text}</p><div class="dact">${o.actions.map(([l, k]) => `<span class="dbtn ${k ?? ''}">${l}</span>`).join('')}</div></div>`;
}

/** The desktop's own notification, bottom right above the taskbar. */
function toast(o) {
  return `<div class="toast${o.warn ? ' warn' : ''}" style="right:16px;bottom:${52 + 16 + (o.lift ?? 0)}px">${ic(o.icon ?? 'check', 18)}<div><b>${o.title}</b><span>${o.text}</span></div>${o.action ? `<span class="tbtn">${o.action}</span>` : ''}</div>`;
}

/** A numbered marker for the notes under a scene. */
const pin = (n, x, y) => `<span class="mark" style="left:${x - 13}px;top:${y - 13}px">${n}</span>`;

/** One scene: the desktop at 1600x1000, shrunk to the column, with its notes. */
function scene(o) {
  const notes = (o.notes ?? []).map(([n, , , text]) => `<li><span class="mk">${n}</span><span>${text}</span></li>`).join('');
  const pins = (o.notes ?? []).filter(([, x]) => x != null).map(([n, x, y]) => pin(n, x, y)).join('');
  return `<figure class="scene" id="${o.id}"><h3>${o.title}</h3>${o.lede ? `<p class="cap">${o.lede}</p>` : ''}
<div class="screen"><div class="stage">${o.wins.join('')}${taskbar(o.tasks)}${o.over ?? ''}${pins}</div></div>
${notes ? `<ol class="notes">${notes}</ol>` : ''}</figure>`;
}

/** The page around the scenes. */
function page({ title, lede, sections, questions, decided }) {
  const css = fs.readFileSync(path.join(__dirname, 'kit.css'), 'utf8');
  const wall = fs.readFileSync(path.join(IMG, 'wallpaper.jpg')).toString('base64');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet">
<style>
${css}
.stage{background-image:url(data:image/jpeg;base64,${wall})}
${thumbCss()}
</style>
</head>
<body><main>
<h1>${title}</h1>
${lede}
${decided ? `<section class="qs done"><h2>Decided</h2><ul>${decided.map((q) => `<li>${q}</li>`).join('')}</ul></section>` : ''}
${sections.join('\n')}
${questions ? `<section class="qs"><h2>What I would like you to decide</h2><ol>${questions.map((q) => `<li>${q}</li>`).join('')}</ol></section>` : ''}
</main></body></html>`;
}

module.exports = {
  W, H, TASKBAR, CAPTION, TREE, PAD, GRID_TOP, ROW, GAP,
  PRODUCTS, PEOPLE, FOLDERS, byId, ic, cols, cardRect, treeRect, card, menu, CORE_ITEM_MENU,
  collection, tree, win, manager, taskbar, cursor, ghost, pin, scene, page, placeholder, clipStrip, osGhost, explorer, transfers, toast, workspace, itemPane, dialog,
};
