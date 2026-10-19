// The Image Editor mocks (issue #136). Reuses a copy of the Media Manager mocks' kit (kit/) for the desktop, the
// window and the taskbar, and draws the editor on top. Everything is static HTML, because the side
// panel that shows these runs no scripts. Writes ../image-editor.html.
const fs = require('fs');
const path = require('path');
const K = require('./kit/kit.cjs');

const IMG = path.join(__dirname, 'img');
const b64 = (f) => fs.readFileSync(path.join(IMG, f)).toString('base64');

/** More Lucide paths, the icon set the backoffice uses. */
const ICONS = {
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  adjust: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  markup: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  redact: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  resize: '<path d="M21 3 9 15"/><path d="M12 3H3v18h18v-9"/><path d="M16 3h5v5"/><path d="M14 15H9v-5"/>',
  rotL: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  rotR: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  flipH: '<path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
  flipV: '<path d="m17 3-5 5-5-5h10"/><path d="m17 21-5-5-5 5h10"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
  zin: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zout: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  arrow: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  rect: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  pen: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  pointer: '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  compare: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
  pixel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  blur: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  focal: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  open: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  editor: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
};
const ic = (name, size = 16) =>
  ICONS[name]
    ? `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
    : K.ic(name, size);

/* Geometry, in stage pixels. One window, the size an editor gets on a 1600x1000 desktop. */
const WIN = { x: 60, y: 24, w: 1480, h: 910 };
const CAPTION = 40;
/** The mode bar, which leads with the File tab. MENU is the menu bar of the alternatives page only. */
const MENU = 32;
const MODEBAR = 52;
const BAR = MODEBAR;
const STATUS = 34;
const PANEL = 320;
const PAD = 40;
/** The canvas area: right of the rail (layout B only), left of the panel, between bar and status. */
const area = (rail = 0, extra = 0) => ({
  x: WIN.x + rail,
  y: WIN.y + CAPTION + BAR + extra,
  w: WIN.w - PANEL - rail,
  h: WIN.h - CAPTION - BAR - extra - STATUS,
});

/** Where an image `iw` x `ih` lands when fitted into the canvas area, and at what zoom. */
function fit(iw, ih, a = area()) {
  const z = Math.min((a.w - PAD * 2) / iw, (a.h - PAD * 2) / ih);
  const w = iw * z;
  const h = ih * z;
  return { x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2, w, h, z };
}

const MODES = [
  ['crop', 'Crop'],
  ['adjust', 'Adjust'],
  ['markup', 'Markup'],
  ['redact', 'Redact'],
  ['resize', 'Resize'],
];

/** The menus, in menu bar order: label, then items as [label, shortcut, flags]. '-' is a separator. */
const MENUS = {
  File: [['Open...', 'Ctrl+O'], '-', ['Save', 'Ctrl+S'], ['Save as...', 'Ctrl+Shift+S'], '-', ['Close', 'Ctrl+W']],
  Edit: [['Undo crop', 'Ctrl+Z'], ['Redo', 'Ctrl+Y', 'off'], '-', ['Revert to saved', '']],
  View: [['Zoom in', 'Ctrl++'], ['Zoom out', 'Ctrl+−'], ['Fit to window', 'Ctrl+0'], ['Actual size', 'Ctrl+1'], '-', ['Split view', '', 'check']],
  Image: [['Rotate left', 'Ctrl+L'], ['Rotate right', 'Ctrl+R'], ['Flip horizontal', ''], ['Flip vertical', ''], '-', ['Resize...', '']],
  Help: [['Image Editor help', 'F1']],
};

/** The menu bar: the desktop's own element from #112, drawn here in the Umbraco theme. */
function menubar(o) {
  return `<div class="mbar">${Object.keys(MENUS).map((m) => `<span class="mbi${o.menu === m ? ' open' : ''}">${m}</span>`).join('')}</div>`;
}

/** An open menu, hanging under its title in the menu bar. `hover` is the highlighted item. */
function dropdown(name, hover, empty) {
  const x = WIN.x + 8 + Object.keys(MENUS).indexOf(name) * 62;
  const items = MENUS[name]
    .map((it) => {
      if (it === '-') return '<div class="dsep"></div>';
      const [label, key, flag] = it;
      const off = flag === 'off' || (empty && !['Open...', 'Close', 'Image Editor help'].includes(label));
      return `<div class="di${label === hover ? ' hov' : ''}${off ? ' off' : ''}"><span class="dck">${flag === 'check' ? ic('check', 14) : ''}</span><span>${label}</span><kbd>${key}</kbd></div>`;
    })
    .join('');
  return `<div class="drop" style="left:${x}px;top:${WIN.y + CAPTION + MENU}px">${items}</div>`;
}

/**
 * The mode bar: the File tab, undo and redo, the five modes, and Save. `classic` draws the menu
 * bar above it instead of the File tab, for the alternatives page.
 */
function bar(o) {
  const tabs = MODES.map(
    ([id, label]) => `<span class="mt${o.mode === id && !o.file ? ' on' : ''}${o.empty ? ' off' : ''}">${ic(id, 19)}<span>${label}</span></span>`,
  ).join('');
  if (!o.classic) {
    return `<div class="ebar fbar${o.file ? ' filing' : ''}"><span class="mt file${o.file ? ' on' : ''}">${ic('open', 19)}<span>File</span></span><span class="tsep"></span>
<span class="ib${o.empty || !o.undo ? ' off' : ''}">${ic('undo', 18)}</span><span class="ib${o.redo ? '' : ' off'}">${ic('redo', 18)}</span>
<span class="tabs">${tabs}</span><span class="eb save${o.empty || !o.dirty ? ' off' : ''}">Save</span></div>`;
  }
  return `${menubar(o)}<div class="ebar">
<span class="ib${o.empty || !o.undo ? ' off' : ''}">${ic('undo', 18)}</span><span class="ib${o.redo ? '' : ' off'}">${ic('redo', 18)}</span>
${o.rail ? '<span class="grow"></span>' : `<span class="tabs">${tabs}</span>`}<span class="ib ghost"></span><span class="ib ghost"></span>
</div>`;
}

/** The status bar: the media item's name, where it lives, its size, and zoom at the right. */
function status(o) {
  const off = o.empty ? ' off' : '';
  const z = parseInt(o.zoom, 10) || 100;
  const zoom = `<span class="szoom${off}"><span class="ib sm">${ic('zout', 16)}</span><span class="ztrk"><span class="knob" style="left:${Math.min(100, (z / 200) * 100)}%"></span></span><span class="ib sm">${ic('zin', 16)}</span><span class="zv">${o.empty ? '' : o.zoom}</span><span class="zfit">Fit</span></span>`;
  if (o.empty) return `<div class="estat"><span class="sname none">No image open</span>${zoom}</div>`;
  return `<div class="estat"><span class="sname">${o.name}</span><span class="sm2">in ${o.folder}</span><span class="sdim">${o.dims}</span><span class="sm2">${o.size}</span>${zoom}</div>`;
}

/** One group in the side panel, drawn as Umbraco's uui-box. */
const box = (title, body, extra = '') => `<div class="pbox ${extra}"><div class="pbh">${title}</div><div class="pbb">${body}</div></div>`;
/** A slider with its label and value. `v` is 0..1 along the track, `centre` draws the zero mark. */
const slider = (label, value, v, centre = true) =>
  `<div class="sl"><div class="slh"><span>${label}</span><b>${value}</b></div><div class="trk">${centre ? '<i class="z"></i>' : ''}<span class="fill" style="${centre ? `left:${Math.min(v, 0.5) * 100}%;width:${Math.abs(v - 0.5) * 100}%` : `left:0;width:${v * 100}%`}"></span><span class="knob" style="left:${v * 100}%"></span></div></div>`;
/** A segmented button group; `on` is the chosen label. */
const seg = (labels, on, icons) =>
  `<div class="seg">${labels.map((l, i) => `<span class="${l === on ? 'on' : ''}">${icons ? ic(icons[i], 16) : ''}${l}</span>`).join('')}</div>`;
const btn = (label, icon, cls = '') => `<span class="pbtn ${cls}">${icon ? ic(icon, 16) : ''}${label}</span>`;
const field = (label, value, suffix) => `<label class="fld"><span>${label}</span><span class="inp">${value}${suffix ? `<i>${suffix}</i>` : ''}</span></label>`;
const swatches = (on) =>
  `<div class="sw6">${['#d42054', '#f5c142', '#2bc37c', '#3544b1', '#1b264f', '#ffffff'].map((c) => `<span style="background:${c}"${c === on ? ' class="on"' : ''}></span>`).join('')}</div>`;

/** The editor window: caption, bar, canvas, panel and status bar. `rail` switches to layout B. */
function editor(o) {
  const railW = o.rail ? 64 : 0;
  const a = area(railW, o.classic ? MENU : 0);
  const rail = o.rail
    ? `<div class="rail">${[['pointer', 'Select'], ...MODES].map(([id, label]) => `<span class="ri${o.tool === id ? ' on' : ''}" title="${label}">${ic(id === 'markup' ? 'pen' : id, 20)}</span>`).join('')}<span class="rsep"></span>${['type', 'arrow', 'rect'].map((id) => `<span class="ri">${ic(id, 20)}</span>`).join('')}</div>`
    : '';
  const body = `<div class="ed">${bar(o)}<div class="emid">${rail}<div class="cv${o.dark ? ' dark' : ''}" style="width:${a.w}px"></div><div class="panel">${o.panel ?? ''}</div></div>${status(o)}</div>`;
  return K.win({ ...WIN, title: o.title ?? 'Image Editor', icon: 'image', active: true, dirty: o.dirty, body });
}

/** The picture on the canvas, at stage coordinates, with an optional CSS filter for Adjust. */
const pic = (f, file, extra = '') =>
  `<div class="pic" style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px;background-image:var(--${file})${extra}"></div>`;

/** The crop frame over a fitted image `f`: dimmed outside, thirds inside, eight handles. */
function cropFrame(f, c) {
  const x = f.x + c.x * f.w;
  const y = f.y + c.y * f.h;
  const w = c.w * f.w;
  const h = c.h * f.h;
  const hs = [
    [0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1],
  ].map(([hx, hy]) => `<span class="hd" style="left:${hx * w - 7}px;top:${hy * h - 7}px"></span>`).join('');
  return `<div class="clip-pic" style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px"><div class="cropbox" style="left:${x - f.x}px;top:${y - f.y}px;width:${w}px;height:${h}px"><i class="t1"></i><i class="t2"></i><i class="t3"></i><i class="t4"></i>${hs}</div></div>
<div class="cdim" style="left:${x + w / 2 - 70}px;top:${y + h + 12}px">${c.label}</div>`;
}

/** The image's focal point, as the media item stores it, drawn where it falls on the canvas. */
const focal = (f, fx, fy, faded) =>
  `<span class="fp${faded ? ' faded' : ''}" style="left:${f.x + fx * f.w - 13}px;top:${f.y + fy * f.h - 13}px"></span>`;

/** A markup arrow on the stage, from (x1,y1) to (x2,y2). */
function arrowSvg(x1, y1, x2, y2, color, selected) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = (s) => [x2 - 22 * Math.cos(ang + s * 0.45), y2 - 22 * Math.sin(ang + s * 0.45)];
  const [ax, ay] = head(1);
  const [bx, by] = head(-1);
  const hd = selected
    ? [[x1, y1], [x2, y2]].map(([x, y]) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#fff" stroke="#3544b1" stroke-width="2"/>`).join('')
    : '';
  return `<svg class="over" width="1600" height="1000"><g stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".85"><path d="M${x1} ${y1}L${x2} ${y2}"/><path d="M${ax} ${ay}L${x2} ${y2}L${bx} ${by}"/></g><g stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M${x1} ${y1}L${x2} ${y2}"/><path d="M${ax} ${ay}L${x2} ${y2}L${bx} ${by}"/></g>${hd}</svg>`;
}

/** A dialog centred on the editor window, with the window dimmed behind it: Umbraco's own modal look. */
const dialog = (body, w = 520) =>
  `<div class="wscrim" style="left:${WIN.x}px;top:${WIN.y + CAPTION}px;width:${WIN.w}px;height:${WIN.h - CAPTION}px"></div><div class="dlg" style="left:${WIN.x + (WIN.w - w) / 2}px;width:${w}px">${body}</div>`;

const LOUNGE = { iw: 1200, ih: 800 };
const fl = fit(LOUNGE.iw, LOUNGE.ih);
const tasks = (label = 'Image Editor') => [{ label, active: true, icon: 'image' }];

/** A recent image on the Open page: thumbnail, name and folder. */
const tile = (name, where, bg, pos = 'center', size = 'cover') =>
  `<div class="rtile"><span class="rimg" style="background-image:var(--${bg});background-position:${pos};background-size:${size}"></span><b>${name}</b><small>${where}</small></div>`;
const RECENT = [
  tile('Lounge', 'Media / Design', 'lounge'),
  tile('Codegarden stage', 'Media / Engage', 'onesie', 'center 20%'),
  tile('Media library how-to', 'Media / Engage', 'shot', 'left top'),
  tile('Lounge (banner)', 'Media / Design', 'lounge', 'center 45%', '160%'),
  tile('Ukulele', 'Media / Design', 'lounge', '62% 30%', '420%'),
  tile('Stage, wide', 'Media / Engage', 'onesie', 'center 70%', '140%'),
];

/**
 * The File page: over the whole window under the mode bar, a list of pages down the left and the
 * chosen page beside it. `on` is the page; `empty` greys what needs an open image.
 */
function filePage(o) {
  const pages = [['open', 'Open'], ['save', 'Save'], ['copy', 'Save as'], ['info', 'Info'], ['x', 'Close']];
  const needs = ['Save', 'Save as', 'Info'];
  const nav = `<div class="fn back${o.empty ? ' off' : ''}">${ic('undo', 20)}Back to the picture</div>${pages
    .map(([i, l]) => `<div class="fn${o.on === l ? ' on' : ''}${o.empty && needs.includes(l) ? ' off' : ''}">${ic(i, 20)}${l}</div>`)
    .join('')}`;
  return `<div class="fsheet" style="left:${WIN.x}px;top:${WIN.y + CAPTION + MODEBAR}px;width:${WIN.w}px;height:${WIN.h - CAPTION - MODEBAR}px"><div class="fnav">${nav}</div><div class="fbody">${o.body}</div></div>`;
}

/** The Open page's content. */
const openBody = `<h2>Open</h2><p>Recent images in the media library</p><div class="rgrid">${RECENT.join('')}</div>
<div class="fbtns"><span class="pbtn big primary">${ic('open', 18)}Browse the media library...</span><span class="pbtn big">${ic('upload', 18)}Upload from this computer...</span></div>`;

const scenes = [];

/* 1. Opened from the launcher: the File page, on Open. */
scenes.push(
  K.scene({
    id: 's1',
    title: '1. Opened from the launcher: the File page',
    lede: 'With nothing open, the editor starts on File, Open. Every command has a place on screen; nothing is in a menu.',
    wins: [editor({ empty: true, file: true, zoom: '' }) + filePage({ on: 'Open', empty: true, body: openBody })],
    tasks: tasks(),
    notes: [
      [1, 300, WIN.y + CAPTION + 26, 'File is the first tab of the mode bar. It turns the window into this page; the picture is a tap away under Back.'],
      [2, 1300, 300, 'The images you edited recently, from the media library. Most opens are one tap, without the media picker.'],
      [3, 900, 790, 'Browse is Umbraco\'s media picker, with its folders and search. Upload puts a file from your computer into the media library first.'],
      [4, null, null, 'Disabled, never hidden: Back, Save, Save as and Info are greyed until an image is open.'],
    ],
  }),
);

/* 2. Crop: 16:9, rotate and flip, the focal point riding along. */
{
  const crop = { x: 0.0, y: 0.06, w: 1, h: 0.84375, label: '1200 × 675 px' };
  scenes.push(
    K.scene({
      id: 's2',
      title: '2. Crop, rotate and flip',
      lede: 'A dark photo of the Umbraco HQ lounge, cropped to 16:9 for a hero banner.',
      wins: [
        editor({
          mode: 'crop',
          dirty: true,
          undo: true,
          zoom: Math.round(fl.z * 100) + '%',
          name: 'Lounge',
          folder: 'Media / Design',
          dims: '1200 × 800 px',
          size: '1.4 MB JPEG',
          panel:
            box('Aspect ratio', `<div class="chips">${['Free', 'Original', '1:1', '4:3', '3:2', '16:9'].map((r) => `<span class="${r === '16:9' ? 'on' : ''}">${r}</span>`).join('')}</div>` + '<div class="row2"><span class="pbtn sm">Portrait</span><span class="pbtn sm on">Landscape</span></div>') +
            box('Rotate and flip', `<div class="iconrow">${btn('', 'rotL', 'sq')}${btn('', 'rotR', 'sq')}${btn('', 'flipH', 'sq')}${btn('', 'flipV', 'sq')}</div>`) +
            box('Focal point', `<p class="pp">${ic('focal', 15)} Saving a crop, rotate or flip resets the focal point and the named crops to the centre. Set them again in the Media section.</p>`) +
            `<div class="pfoot">${btn('Reset')}<span class="pbtn primary">Apply crop</span></div>`,
        }) +
          pic(fl, 'lounge') +
          cropFrame(fl, crop) +
          focal(fl, 0.62, 0.48),
      ],
      tasks: tasks(),
      notes: [
        [1, fl.x + fl.w - 30, fl.y + 60, 'Drag the frame or its handles. A fixed ratio keeps its shape; Free does not. The size under the frame is in real pixels.'],
        [2, fl.x + 0.62 * fl.w + 22, fl.y + 0.48 * fl.h - 22, 'The focal point the media item already has, drawn so you know it is there. Shown only in Crop.'],
        [3, WIN.x + WIN.w - 26, WIN.y + CAPTION + BAR + 160, 'Rotate turns by 90°, flip mirrors. Both apply straight away and are one undo step each.'],
        [4, null, null, 'Apply crop, Enter, or switching mode applies it. Escape or Reset throws the frame away.'],
      ],
    }),
  );
}

/* 3. Adjust: the cropped photo from scene 2, brighter, in split view. */
{
  const f = fit(1200, 675);
  const ADJ = 'filter:brightness(1.55) contrast(1.06) saturate(.92)';
  // The 16:9 crop of scene 2: the same file, shifted up by the 48 pixels the crop took off the top.
  const cropped = (w, style) =>
    `<div class="pic" style="left:${f.x}px;top:${f.y}px;width:${w}px;height:${f.h}px;background-image:var(--lounge);background-size:${f.w}px auto;background-position:0 ${-48 * f.z}px;${style}"></div>`;
  scenes.push(
    K.scene({
      id: 's3',
      title: '3. Adjust, with a live preview',
      lede: 'The cropped photo: exposure up, a little contrast, a little less orange. The picture changes as the sliders move.',
      wins: [
        editor({
          mode: 'adjust',
          dirty: true,
          undo: true,
          zoom: Math.round(f.z * 100) + '%',
          name: 'Lounge',
          folder: 'Media / Design',
          dims: '1200 × 675 px',
          size: '1.4 MB JPEG',
          panel:
            box('Light', slider('Exposure', '+0.8', 0.7) + slider('Brightness', '+12', 0.56) + slider('Contrast', '+6', 0.53)) +
            box('Colour', slider('Saturation', '−8', 0.46)) +
            box('Compare', `<p class="pp">Hold to see the original, or split the picture.</p><div class="row2">${btn('Hold to compare', 'compare')}${btn('Split view', 'compare', 'on')}</div>`) +
            `<div class="pfoot">${btn('Reset all')}</div>`,
        }) +
          cropped(f.w, ADJ) +
          cropped(f.w / 2, '') +
          `<span class="splitline" style="left:${f.x + f.w / 2 - 1}px;top:${f.y}px;height:${f.h}px"><b>Before</b><b>After</b></span>`,
      ],
      tasks: tasks(),
      notes: [
        [1, WIN.x + WIN.w - 26, WIN.y + CAPTION + BAR + 26, 'Four sliders, each zero in the middle. Double-click a slider to put it back to zero.'],
        [2, f.x + f.w / 2 + 30, f.y + 60, 'Split view: the original on the left, the adjusted picture on the right. Drag the line.'],
        [3, null, null, 'One drag of a slider is one undo step, not one per pixel moved.'],
      ],
    }),
  );
}

/* 4. Markup on a screenshot. */
{
  const SH = { iw: 1100, ih: 590 };
  const f = fit(SH.iw, SH.ih);
  const p = (x, y) => [f.x + (x / SH.iw) * f.w, f.y + (y / SH.ih) * f.h];
  const [rx, ry] = p(494, 272);
  const [rx2, ry2] = p(554, 298);
  const [ax1, ay1] = p(250, 300);
  const [ax2, ay2] = p(486, 287);
  const [tx, ty] = p(70, 290);
  scenes.push(
    K.scene({
      id: 's4',
      title: '4. Markup: text, arrows, rectangles and a pen',
      lede: 'A screenshot for an editors\' how-to. Each mark stays movable until you save.',
      wins: [
        editor({
          mode: 'markup',
          dirty: true,
          undo: true,
          zoom: Math.round(f.z * 100) + '%',
          name: 'Media library how-to',
          folder: 'Media / Engage',
          dims: '1100 × 590 px',
          size: '412 KB PNG',
          panel:
            box('Tool', seg(['Select', 'Text', 'Arrow', 'Box', 'Pen'], 'Arrow', ['pointer', 'type', 'arrow', 'rect', 'pen'])) +
            box('Colour', swatches('#d42054')) +
            box('Line', slider('Width', '5 px', 0.3, false)) +
            box('Selected arrow', `<div class="row2">${btn('Delete', 'trash')}${btn('Bring to front')}</div>`) +
            `<p class="pp hint">Marks become part of the picture when you save.</p>`,
        }) +
          pic(f, 'shot') +
          `<div class="mrect" style="left:${rx}px;top:${ry}px;width:${rx2 - rx}px;height:${ry2 - ry}px"></div>` +
          arrowSvg(ax1, ay1, ax2, ay2, '#d42054', true) +
          `<div class="mtext" style="left:${tx}px;top:${ty}px">Start here: Create</div>`,
      ],
      tasks: tasks(),
      notes: [
        [1, WIN.x + WIN.w - 26, WIN.y + CAPTION + BAR + 26, 'Pick a tool and drag on the picture. Text is typed straight onto it.'],
        [2, (ax1 + ax2) / 2, ay1 - 30, 'The selected arrow has handles. Move it, change its colour or width, or Delete it.'],
        [3, null, null, 'Marks are objects until you save, then they are burned into the pixels. There are no layers to manage.'],
      ],
    }),
  );
}

/* 5. Redact: a face pixelated, a head blurred. */
{
  const O = { iw: 600, ih: 900 };
  const f = fit(O.iw, O.ih);
  const r = (x, y, w, h) => ({ x: f.x + x * f.w, y: f.y + y * f.h, w: w * f.w, h: h * f.h, px: x, py: y });
  const face = r(0.29, 0.17, 0.26, 0.14);
  const head = r(0.0, 0.72, 0.22, 0.2);
  const region = (g, file, cls) =>
    `<div class="redact ${cls}" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;background-image:var(--${file});background-size:${f.w}px ${f.h}px;background-position:${-g.px * f.w}px ${-g.py * f.h}px">${cls.includes('sel') ? [[0, 0], [1, 0], [0, 1], [1, 1]].map(([hx, hy]) => `<span class="hd" style="left:${hx * g.w - 7}px;top:${hy * g.h - 7}px"></span>`).join('') : ''}</div>`;
  scenes.push(
    K.scene({
      id: 's5',
      title: '5. Redact: blur or pixelate a region',
      lede: 'An event photo going on a public page. The speaker\'s face is pixelated, the head in the front row blurred.',
      wins: [
        editor({
          mode: 'redact',
          dirty: true,
          undo: true,
          zoom: Math.round(f.z * 100) + '%',
          name: 'Codegarden stage',
          folder: 'Media / Engage',
          dims: '600 × 900 px',
          size: '188 KB JPEG',
          panel:
            box('Style', seg(['Pixelate', 'Blur'], 'Pixelate', ['pixel', 'blur'])) +
            box('Strength', slider('Block size', '20 px', 0.6, false)) +
            box('Selected region', `<div class="row2">${btn('Delete', 'trash')}</div>`) +
            `<p class="pp hint">${ic('info', 15)} Drag over what should not be seen. Redaction is burned into the saved file; the original pixels are gone from it.</p>`,
        }) +
          pic(f, 'onesie') +
          region(face, 'onesiePx', 'px sel') +
          region(head, 'onesieBlur', 'bl'),
      ],
      tasks: tasks(),
      notes: [
        [1, face.x + face.w + 18, face.y + 10, 'Pixelate, selected: drag to draw, then move or resize it. Each region keeps its own style.'],
        [2, head.x + head.w + 18, head.y + 30, 'Blur. Strong by default: a light blur can be undone by software, and redaction that can be undone is not redaction.'],
        [3, null, null, 'Regions stay editable until you save, like markup. Then they are burned in.'],
      ],
    }),
  );
}

/* 6. Resize. */
{
  scenes.push(
    K.scene({
      id: 's6',
      title: '6. Resize',
      lede: 'A 4000 pixel upload shrunk to what the site actually shows.',
      wins: [
        editor({
          mode: 'resize',
          dirty: true,
          undo: true,
          zoom: Math.round(fl.z * 100) + '%',
          name: 'Lounge',
          folder: 'Media / Design',
          dims: '4000 × 2667 px → 1920 × 1280 px',
          size: '6.1 MB JPEG',
          panel:
            box('Size', `<div class="row2 fl">${field('Width', '1920', 'px')}<span class="lock on">${ic('link', 16)}</span>${field('Height', '1280', 'px')}</div>${seg(['Pixels', 'Percent'], 'Pixels')}`) +
            box('Common widths', `<div class="chips">${['2560', '1920', '1280', '800', 'Half'].map((w) => `<span class="${w === '1920' ? 'on' : ''}">${w}</span>`).join('')}</div>`) +
            `<p class="pp hint">Resize changes the picture's pixels. Zoom only changes how close you look.</p>` +
            `<div class="pfoot">${btn('Reset')}<span class="pbtn primary">Apply size</span></div>`,
        }) + pic(fl, 'lounge', ';filter:brightness(1.55) contrast(1.06) saturate(.92)'),
      ],
      tasks: tasks(),
      notes: [
        [1, WIN.x + WIN.w - 26, WIN.y + CAPTION + BAR + 26, 'Width and height stay in proportion while the link is on. Only shrinking is offered by the presets; enlarging is allowed by typing.'],
        [2, 520, WIN.y + WIN.h - 17, 'The status bar shows the size before and after until you save.'],
      ],
    }),
  );
}

/* 7. Save, and the Save as page. */
{
  const radio = (on, label, sub) => `<div class="rcard${on ? ' on' : ''}"><span class="rb"></span><span><b>${label}</b><small>${sub}</small></span></div>`;
  const saveAs = (copy) => `<h2>Save as</h2><p>${copy ? 'A new media item. Lounge stays as it is.' : 'Lounge is replaced. Umbraco keeps no older version of media.'}</p>
<div class="sagrid"><div class="saform">
<div class="rcards">${radio(!copy, 'Replace Lounge', 'Write over the media item')}${radio(copy, 'Save a copy', 'Keep the original as it is')}</div>
${copy ? `<div class="row2 fl">${field('Name', 'Lounge (banner)')}</div><p class="pp">${ic('open', 15)} In <b>Media / Design</b>, next to the original. <u>Change...</u></p>` : ''}
${box('File', `${seg(['Keep (JPEG)', 'JPEG', 'PNG', 'WebP'], copy ? 'Keep (JPEG)' : 'WebP')}${slider('Quality', copy ? '85' : '82', copy ? 0.85 : 0.82, false)}<div class="sizes"><span>Now<b>6.1 MB</b></span><span class="arr">→</span><span>After<b>${copy ? '486 KB' : '214 KB'}</b></span><em>${copy ? '−92%' : '−96%'}</em></div>`, 'flat')}
${copy ? '' : `<p class="pp warn">${ic('info', 15)} A new format changes the file's address. Pages that pick the image are fine; a link someone pasted to the old file will break.</p>`}
<div class="fbtns"><span class="pbtn big save">${copy ? 'Save copy' : 'Replace Lounge'}</span></div></div>
<div class="saprev"><span class="sapic" style="background-image:var(--lounge);filter:brightness(1.55) contrast(1.06) saturate(.92)"></span><small>1920 × 1280 px, as it will be saved</small></div></div>`;
  const base = { mode: 'resize', dirty: true, undo: true, file: true, zoom: '84%', name: 'Lounge', folder: 'Media / Design', dims: '1920 × 1280 px', size: '6.1 MB JPEG' };
  scenes.push(
    K.scene({
      id: 's7a',
      title: '7a. Save as: replacing the original in a new format',
      lede: 'Save, at the right of the mode bar, writes over the item straight away in the same format. Save as is a page of File, for format, quality and copies.',
      wins: [editor(base) + filePage({ on: 'Save as', body: saveAs(false) })],
      tasks: tasks(),
      notes: [
        [1, WIN.x + WIN.w - 130, WIN.y + CAPTION + 26, 'Save stays on screen, outside File: it is the command people use most, and Ctrl+S does the same.'],
        [2, 902, 274, 'Replace or copy, as two big choices. The page has room to show the picture as it will be saved.'],
        [3, 900, 470, 'Keep is the default: same format, quality matched to the original. The size after is measured by encoding the picture, not guessed.'],
        [4, null, null, 'Unsaved work, someone else\'s change and save errors use the shared media service: the unsaved dot, the Overwrite question, and the reason in the status bar.'],
        [5, null, null, 'If the picture was cropped, rotated or flipped, saving resets the item\'s focal point and named crops to the centre. Other changes keep them.'],
      ],
    }),
  );
  scenes.push(
    K.scene({
      id: 's7b',
      title: '7b. Save as: keeping the original',
      lede: 'Umbraco does not keep media versions, so a copy is how an editor keeps the original.',
      wins: [editor(base) + filePage({ on: 'Save as', body: saveAs(true) })],
      tasks: tasks(),
      notes: [
        [1, 900, 360, 'The copy goes next to the original. Change... opens Umbraco\'s folder picker.'],
        [2, null, null, 'After saving a copy, the editor is on the copy: the next Save writes to it, not to the original.'],
      ],
    }),
  );
}

/* 8. The other layout: a tool rail, for comparison. */
{
  const a = area(64);
  const f = fit(LOUNGE.iw, LOUNGE.ih, a);
  scenes.push(
    K.scene({
      id: 's8',
      title: '8. For comparison: a tool rail instead of modes',
      lede: 'The Paint.NET and Photoshop way: every tool as an icon down the side, settings for the chosen one on the right.',
      wins: [
        editor({
          rail: true,
          tool: 'adjust',
          dirty: true,
          undo: true,
          zoom: Math.round(f.z * 100) + '%',
          name: 'Lounge',
          folder: 'Media / Design',
          dims: '1200 × 800 px',
          size: '1.4 MB JPEG',
          panel: box('Adjust', slider('Exposure', '+0.8', 0.7) + slider('Brightness', '+12', 0.56) + slider('Contrast', '+6', 0.53) + slider('Saturation', '−8', 0.46)),
        }) + pic(f, 'lounge', ';filter:brightness(1.55) contrast(1.06) saturate(.92)'),
      ],
      tasks: tasks(),
      notes: [
        [1, WIN.x + 80, WIN.y + CAPTION + BAR + 96, 'Faster for people who know editors: no mode to switch, a tool is one click.'],
        [2, null, null, 'But the icons need learning, and it invites the question "where are my layers?" This is for fixing images, not composing them, so I recommend the modes (scenes 2 to 6).'],
      ],
    }),
  );
}

/*
 * The menu under four themes. Small stages of their own (800x380), each the top of the editor
 * window with File open, drawn in that theme's own idiom.
 */
const FILE = MENUS.File;
const MENU_NAMES = Object.keys(MENUS);
const winKey = (k) => k;
const macKey = (k) => k.replace('Ctrl+Shift+', '⇧⌘').replace('Ctrl+', '⌘');
/** The File menu's items in one theme's markup. */
const fileItems = (key, hover, mnemonic) =>
  FILE.map((it) => {
    if (it === '-') return '<div class="xsep"></div>';
    const [label, k] = it;
    const text = mnemonic ? `<u>${label[0]}</u>${label.slice(1)}` : label;
    return `<div class="xi${label === hover ? ' hov' : ''}"><span>${text}</span><kbd>${key(k)}</kbd></div>`;
  }).join('');
const bars = (mnemonic, open = 'File') => MENU_NAMES.map((m) => `<span class="${m === open ? 'open' : ''}">${mnemonic ? `<u>${m[0]}</u>${m.slice(1)}` : m}</span>`).join('');

function themeFigure(id, title, cap, inner, notes) {
  return `<figure class="scene" id="${id}"><h3>${title}</h3><p class="cap">${cap}</p><div class="tscreen"><div class="tstage">${inner}</div></div>${notes ? `<ol class="notes">${notes.map((n, i) => `<li><span class="mk">${i + 1}</span><span>${n}</span></li>`).join('')}</ol>` : ''}</figure>`;
}

/** The File page's parts every theme draws: its pages, and three recent images. */
const PAGES = ['Open', 'Save', 'Save as', 'Info', 'Close'];
const THUMBS = [['Lounge', 'lounge', 'center'], ['Codegarden stage', 'onesie', 'center 20%'], ['Media library how-to', 'shot', 'left top']];
const thumbs = (cls) => THUMBS.map(([n, v, pos]) => `<div class="${cls}"><span style="background-image:var(--${v});background-position:${pos}"></span><b>${n}</b></div>`).join('');
const modes = (cls, file) => `<span class="${cls} on">${file}</span>${MODES.map(([, l]) => `<span class="${cls}">${l}</span>`).join('')}`;

const themeFigures = [
  themeFigure('t-umbraco', 'Umbraco', 'Core\'s navy for the page list, Umbraco\'s boxes and buttons for the page.',
    `<div class="tu-win"><div class="tu-cap">${ic('image', 15)}<span>Image Editor</span><span class="tu-ctl">${K.ic('x', 13)}</span></div>
<div class="tu-modes">${modes('tm2', 'File')}</div>
<div class="tu-page"><div class="tu-nav">${PAGES.map((pg) => `<span class="${pg === 'Open' ? 'on' : ''}">${pg}</span>`).join('')}</div><div class="tu-body"><h4>Open</h4><div class="tu-grid">${thumbs('tu-t')}</div></div></div></div>`),
  themeFigure('t-win11', 'Windows 11', 'Like Windows 11\'s Settings: a light list with a blue marker on the chosen page, content in rounded cards.',
    `<div class="w11-win"><div class="w11-cap">${ic('image', 15)}<span>Image Editor</span><span class="w11-ctl"><i>&#8212;</i><i>&#9744;</i><i>&#10005;</i></span></div>
<div class="w11-modes">${modes('w11-m', 'File')}</div>
<div class="w11-page"><div class="w11-nav">${PAGES.map((pg) => `<span class="${pg === 'Open' ? 'on' : ''}">${pg}</span>`).join('')}</div><div class="w11-pb"><h4>Open</h4><div class="w11-grid">${thumbs('w11-t')}</div><span class="w11-btn">Browse the media library...</span></div></div></div>`),
  themeFigure('t-win98', 'Windows 98', 'Bevelled tabs, the page list as a sunken list box with a navy highlight, the images in a group box.',
    `<div class="w98-win"><div class="w98-cap">${ic('image', 14)}<span>Image Editor</span><span class="w98-ctl"><i>_</i><i>&#9633;</i><i>&#215;</i></span></div>
<div class="w98-modes">${modes('w98-m', '<u>F</u>ile')}</div>
<div class="w98-page"><div class="w98-nav">${PAGES.map((pg) => `<span class="${pg === 'Open' ? 'on' : ''}">${pg}</span>`).join('')}</div><div class="w98-pb"><fieldset><legend>Recent images</legend><div class="w98-grid">${thumbs('w98-t')}</div></fieldset><span class="w98-btn"><u>B</u>rowse...</span></div></div></div>`),
  themeFigure('t-macos', 'macOS', 'The modes as a segmented control in the toolbar, the page list as a translucent sidebar, the images as Finder shows them.',
    `<div class="mac-win mac-big"><div class="mac-cap mac-tb"><span class="tl r"></span><span class="tl y"></span><span class="tl g"></span><span class="mac-seg">${modes('mac-s', 'File')}</span></div>
<div class="mac-page"><div class="mac-side"><small>Image Editor</small>${PAGES.map((pg) => `<span class="${pg === 'Open' ? 'on' : ''}">${pg}</span>`).join('')}</div><div class="mac-body"><h4>Recents</h4><div class="mac-grid">${thumbs('mac-t')}</div></div></div></div>`),
];

const vars = `:root{--lounge:url(data:image/jpeg;base64,${b64('lounge.jpg')});--shot:url(data:image/jpeg;base64,${b64('shot.jpg')});--onesie:url(data:image/jpeg;base64,${b64('onesie.jpg')});--onesiePx:url(data:image/jpeg;base64,${b64('onesie-px.jpg')});--onesieBlur:url(data:image/jpeg;base64,${b64('onesie-blur.jpg')})}`;

/**
 * Builds a page from the kit, adds this mock's CSS and images, and writes it.
 * @param file The file name, next to _build.
 * @param opts What K.page takes.
 * @param css Extra CSS files to add.
 */
function writePage(file, opts, css = []) {
  let html = K.page(opts);
  const sheets = ['editor.css', 'menu.css', 'commands.css', 'filepage.css', 'filethemes.css', ...css].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  html = html.replace('</style>', `${vars}\n${sheets}\n</style>`);
  // The kit embeds the Media Manager's card thumbnails, which no scene here uses. The side panel
  // will not render a page over 512 KB, so they go.
  html = html.replace(/^\.th-[^\n]*\n?/gm, '');
  // The theme figures share the desktop's wallpaper, which the kit already embeds once for .stage.
  html = html.replace('.stage{background-image:', '.stage,.tstage{background-image:');
  fs.writeFileSync(path.join(__dirname, '..', file), html);
  console.log(file, (html.length / 1024).toFixed(0) + ' KB');
}

module.exports = { K, ic, area, WIN, CAPTION, PANEL, STATUS, PAD, MODES, MENUS, fit, status, box, slider, seg, btn, pic, editor, dropdown, writePage };

if (require.main === module) {
  writePage('image-editor.html', {
    title: 'Image Editor mocks',
    lede: `<p class="lede">Issue #136: the first app of the new UmbraDesktop Media add-on. Drawn in the Umbraco theme at the desktop's real size; every theme gets the same controls. Scenes 1 to 7 are my recommendation. Scene 8 is the alternative layout, for comparison.</p>
  <div class="key"><span><span class="mk">1</span> a note, listed under the picture</span></div>`,
    sections: [
      `<section class="sc"><h2>The editor</h2>${scenes.join('')}</section>`,
      `<section class="sc"><h2>The File page under each theme</h2><p>The same page in four themes. A theme restyles it and never leaves a page or a command out. Umbraco 4 follows the same tokens.</p>${themeFigures.join('')}</section>`,
    ],
    questions: [
      'Modes along the top (scenes 2 to 6), or a tool rail down the side (scene 8)? I recommend the modes.',
      'Save stays on screen at the right of the mode bar, outside File (my call: it is the command used most). Fine, or should it live only in File?',
      'The File page as a desktop element that any app can use (that is what #112 becomes), with the Image Editor as its first user? Or keep it inside the editor for now?',
      'Focal point and crops: I propose moving them with the picture, and resetting only the ones a crop cuts off. The alternatives are always resetting them, or warning first.',
    ],
  });
}
