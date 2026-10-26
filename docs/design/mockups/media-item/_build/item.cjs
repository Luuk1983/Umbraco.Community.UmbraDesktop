// The media item as the hub (research doc 2026-10-26-media-coherence-research.md), second round:
// the item open beside a Media Manager window, with one split button in its footer (Edit image, with
// Download, Replace file and Optimize folded out of it) beside Save, the same tools on the Image
// property's own menu, and the editor window with the desktop's changed-elsewhere banner. Built on
// the Media Manager mock kit, so the window, tree, cards and core's workspace are drawn as that kit
// draws them. Writes ../item-page.html.
const fs = require('fs');
const path = require('path');
const K = require('../../media-manager/_build/kit.cjs');
const { ic, win, manager, scene, cardRect, PEOPLE } = K;

/** Icons the kit does not have, in the same Lucide style. */
const MORE_ICONS = {
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><path d="M12 15V3"/>',
  replace: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  shrink: '<path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/><path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/><path d="M15 4.2V9m0 0h4.8M15 9l6-6"/><path d="M9 4.2V9m0 0H4.2M9 9 3 3"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
  resize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  popout: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  pdf: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
};
const icon = (name, size = 16, extra = '') =>
  MORE_ICONS[name]
    ? `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${MORE_ICONS[name]}</svg>`
    : ic(name, size, extra);

const WIN = { x: 30, y: 22, w: 1540, h: 900 };
const PANE_W = 600;
const CARDS = { ...WIN, w: WIN.w - PANE_W };
const JANAE = { name: 'Janae Cram', thumb: 'janae', width: '2048 px', height: '1365 px', size: '1.2 MB' };

/** The item pane's header: the desktop's, as today. */
function paneHeader(o) {
  return `<div class="iph">${ic('image', 15)}<span>${o.title}</span>${o.dirty ? '<span class="dirty"></span>' : ''}<span class="ipb">${ic('reload', 15)}${icon('popout', 15)}${ic('x', 15)}</span></div>`;
}

/** Core's workspace header: the name, the item's actions menu, the views. */
function wsHeader(o) {
  const tab = (name, iconName, on) => `<span class="wstab${on ? ' on' : ''}">${icon(iconName, 18)}<span>${name}</span></span>`;
  return `<div class="wsh">${ic(o.file ? 'file' : 'image', 18)}<span class="wsname">${o.name}<span class="wsmore">${ic('more', 16)}</span></span><span class="wstabs">${tab('Details', 'image', true)}${tab('Info', 'info', false)}</span></div>`;
}

/**
 * The footer: the breadcrumb, then our split button beside core's Save. Its face is Edit image for
 * an image and Download for anything else; the arrow folds the rest out (scene 3).
 */
function wsFooter(o) {
  const crumb = ['Media', 'People', o.name].map((c, i) => (i < 2 ? `<u>${c}</u>` : c)).join(' <span class="sl">/</span> ');
  const face = o.file ? `${icon('download', 15)}Download` : `${icon('pencil', 15)}Edit image`;
  return `<div class="wsf"><span class="crumb">${crumb}</span><span class="wsacts"><span class="split ours${o.foldOpen ? ' open' : ''}"><span class="face">${face}</span><span class="arrow">${icon(o.foldOpen ? 'down' : 'up', 14)}</span></span><span class="save">Save</span></span></div>`;
}

/** The Details view: core's Image box, with the property's "..." (ours) beside its label. */
function details(o) {
  const labels = [['Width', o.width], ['Height', o.height], ['Size', o.size], ['Type', 'jpg']]
    .map(([k, v]) => `<div class="wsp"><b>${k}</b><span>${v}</span></div>`)
    .join('');
  return `<div class="wsb"><div class="box"><div class="boxh">Image</div>
<div class="wsp col"><b class="plabel">Image <i class="req">*</i><span class="pam${o.menuOpen ? ' open' : ''}">${ic('more', 16)}</span></b>
<div class="wsimg th-${o.thumb}"><span class="focal"></span></div>
<div class="wsbtns"><span class="tbtn sm">${ic('trash', 13)}Clear file(s)</span></div></div>${labels}</div></div>`;
}

/** The whole pane: header, workspace, footer. */
function pane(o) {
  return `<div class="ipane" style="width:${PANE_W}px">${paneHeader({ title: o.name })}<div class="ws">${wsHeader(o)}${details(o)}${wsFooter(o)}</div></div>`;
}

const FILE_ITEMS = [['pencil', 'Edit image'], ['download', 'Download'], ['replace', 'Replace file...'], ['shrink', 'Optimize...']];

/** The property's menu (ours), opened from the "..." beside Image. */
function propertyMenu(x, y) {
  return `<div class="menu pmenu" style="left:${x}px;top:${y}px">${FILE_ITEMS.map(([i, l]) => `<div class="mi ours">${icon(i, 15)}<span>${l}</span></div>`).join('')}</div>`;
}

/** The split button's fold-out (ours), opening upward above the footer as core's does. */
function foldOut(x, y) {
  const items = FILE_ITEMS.slice(1);
  return `<div class="menu pmenu fold" style="left:${x}px;top:${y - 8 - items.length * 36}px">${items.map(([i, l]) => `<div class="mi ours">${icon(i, 15)}<span>${l}</span></div>`).join('')}</div>`;
}

/** A People window with Janae open beside it. */
function peopleWin(o = {}) {
  return manager({
    ...WIN,
    title: 'People',
    active: !o.inactive,
    current: 'people',
    items: PEOPLE,
    state: { janae: { open: true }, ravi: o.hoverRavi ? { hover: true } : {} },
    pane: pane({ ...JANAE, ...o }),
  });
}

/** The desktop's own notice band under a window's titlebar, as the content editor shows it. */
function notice() {
  return `<div class="nband">${icon('warn', 20)}<div class="ntext"><b>Someone else changed this while you were editing it</b><span>Saving now replaces their version with yours.</span></div><span class="nacts"><span class="tbtn">Keep my changes</span><span class="tbtn">Discard mine, load theirs</span></span></div>`;
}

/** The Image Editor window at Janae, over the desktop. */
function editorWin(o = {}) {
  const mode = (name, iconName, on) => `<span class="emode${on ? ' on' : ''}">${icon(iconName, 20)}<span>${name}</span></span>`;
  const body = `<div class="ed">${o.notice ? notice() : ''}
<div class="ebar"><span class="eundo">${ic('undo', 20)}${icon('redo', 20, 'off')}</span><span class="emodes">${mode('Crop', 'crop', true)}${mode('Adjust', 'sliders')}${mode('Markup', 'pencil')}${mode('Redact', 'ban')}${mode('Resize', 'resize')}</span><span class="esave"><span class="save">Save</span>${ic('more', 18)}</span></div>
<div class="estage"><div class="eimg th-janae${o.cropped ? ' cropped' : ''}"></div><div class="epanel"><div class="ebox"><b>Aspect ratio</b><div class="echips"><span class="${o.cropped ? '' : 'on'}">Free</span><span>Original</span><span>1:1</span><span>4:3</span><span>3:2</span><span class="${o.cropped ? 'on' : ''}">16:9</span></div></div><div class="ebox"><b>Rotate and flip</b><div class="echips">${icon('undo', 16)}${icon('redo', 16)}</div></div></div></div>
<div class="estatus"><span>Janae Cram</span><span>in People</span><span>2048 × 1365 px</span><span>1.2 MB JPEG</span><span class="ez">41% Fit</span></div></div>`;
  return win({ x: 300, y: 90, w: 1100, h: 760, title: 'Janae Cram', active: true, icon: 'image', dirty: o.dirty, body });
}

const tasks = (...l) => l.map(([label, active]) => ({ label, active }));
const PANE_X = WIN.x + WIN.w - PANE_W;
const FOOT_Y = WIN.y + WIN.h - 28;
const SPLIT_X = PANE_X + PANE_W - 232;
const LABEL_Y = WIN.y + K.CAPTION + 34 + 70 + 22 + 50 + 16 + 11;
const PAM_X = PANE_X + 22 + 18 + 72;
const ravi = cardRect(CARDS, 0);

const scenes = [];

scenes.push(
  scene({
    id: 's1',
    title: '1. The item is the hub',
    lede: 'You clicked Janae Cram in People. Umbraco\'s workspace opens beside the window as it does today. Two things are new, and one thing is gone.',
    wins: [peopleWin({ hoverRavi: true })],
    tasks: tasks(['People', true]),
    notes: [
      [1, SPLIT_X + 60, FOOT_Y - 36, 'One button beside Save: Edit image, with an arrow that folds out the file\'s other tools (scene 3). A workspace action with menu items, which is exactly how Save and publish carries Unpublish and Schedule. For image items on the desktop.'],
      [2, PAM_X + 14, LABEL_Y - 24, 'The "..." beside the Image label is the property\'s own menu with the same four tools (scene 2). Nobody looks for it; it is there because it is Umbraco\'s place for "do something to this value".'],
      [3, ravi.x + ravi.w - 12, ravi.y + 14, 'The card is core\'s again: "..." and core\'s own quick button (Create). Edit image stays in the "..." menu at a normal weight, no longer first.'],
      [4, null, null, 'The Info tab is untouched: no File box. Dimensions, size and type are already on Details, and Referenced by and Links are already core\'s on Info.'],
      [5, null, null, 'Nothing about opening, selecting, the keys or the pane changes. Arrow keys and Enter on the cards are still previous and next.'],
    ],
  }),
);

scenes.push(
  scene({
    id: 's2',
    title: '2. The same tools on the file itself',
    lede: 'The "..." beside Image, opened. The same four actions as the footer button, registered a second time on the property.',
    wins: [peopleWin({ menuOpen: true })],
    tasks: tasks(['People', true]),
    over: propertyMenu(PAM_X + 4, LABEL_Y + 14),
    notes: [
      [1, PAM_X + 218, LABEL_Y + 32, 'Edit image: the same editor window as the footer button.'],
      [2, PAM_X + 218, LABEL_Y + 68, 'Download the original. Core has no download on a media item anywhere.'],
      [3, PAM_X + 218, LABEL_Y + 104, 'Replace file: a new upload into this item, keeping the item, its name and where it is used. Today that is Clear file(s) and then an upload.'],
      [4, PAM_X + 218, LABEL_Y + 140, 'Optimize: #139\'s settings window for this one image.'],
      [5, null, null, 'A page\'s own cropper does not get this menu: the condition is the media workspace.'],
    ],
  }),
);

scenes.push(
  scene({
    id: 's3',
    title: '3. The fold-out',
    lede: 'The arrow on the footer button, pressed. The fold-out opens upward above the footer, as Save and publish\'s does.',
    wins: [peopleWin({ foldOpen: true })],
    tasks: tasks(['People', true]),
    over: foldOut(SPLIT_X - 10, FOOT_Y - 18),
    notes: [
      [1, SPLIT_X + 218, FOOT_Y - 18 - 8 - 3 * 36 + 18, 'Download, Replace file and Optimize. Edit image is the face, so it is not repeated here.'],
      [2, null, null, 'On a PDF or a video the face is Download, with Replace file folded out: Edit image and Optimize do not apply, and a footer that offers nothing for a file would say the rule stops at images.'],
      [3, null, null, 'Optimize here is one image; Optimize images in the window\'s selection bar is many. Same window, same settings.'],
    ],
  }),
);

scenes.push(
  scene({
    id: 's4',
    title: '4. After Edit image',
    lede: 'Edit image pressed. The Image Editor opens in its own window at Janae Cram, as it does today from the menu. When it saves, the pane behind it refreshes on its own.',
    wins: [peopleWin({ inactive: true }), editorWin()],
    tasks: tasks(['People'], ['Janae Cram', true]),
    notes: [
      [1, 850, 130, 'The editor is a window, not a pane: it holds unsaved pixels and needs 720 px, and that is what every OS does (Explorer to Photos, Lightroom to Photoshop).'],
      [2, null, null, 'Pressing Edit image again, from the pane or a card\'s menu, brings this window forward rather than opening a second one.'],
    ],
  }),
);

scenes.push(
  scene({
    id: 's5',
    title: '5. Someone else changed the image while you were cropping it',
    lede: 'You cropped to 16:9 and have not saved. A colleague saved a new version of Janae Cram, from the Media section or another editor. The editor window gets the desktop\'s own banner, the one a document window gets.',
    wins: [peopleWin({ inactive: true }), editorWin({ notice: true, cropped: true, dirty: true })],
    tasks: tasks(['People'], ['Janae Cram', true]),
    notes: [
      [1, 560, 112, 'The desktop\'s notice, word for word what a content window shows: nothing new to learn. The titlebar and the taskbar button get the same warning mark.'],
      [2, 1398, 112, 'Keep my changes: the banner steps back to a mark, and Save asks its existing question before writing over their version. Discard mine, load theirs: the editor reopens their file and the crop is gone.'],
      [3, null, null, 'Behind it, the People window\'s pane was clean, so it already shows their version. A pane with typed changes would get this same banner instead, as it does today.'],
      [4, null, null, 'With no unsaved work, the editor reopens the new file on its own, as a clean window reloads. Today the editor hears nothing until Save.'],
    ],
  }),
);

const css = fs.readFileSync(path.join(__dirname, 'item.css'), 'utf8');
let html = K.page({
  title: 'The media item as the hub',
  lede: '<p class="lede">The research doc\'s §4 as pictures, second round: the item open beside a Media Manager window is the viewer, the record and the door to the file. Orange marks what is ours; everything else is core 17 as it draws today.</p>',
  decided: [
    'One split button in the footer, Edit image as its face, the rest folded out. No row of buttons.',
    'The property "..." stays, with the same tools, because it is Umbraco\'s place for them.',
    'No File box on the Info tab.',
    'The editor window gets the desktop\'s changed-elsewhere banner.',
    'No media viewer. The item is the viewer; a PDF preview closes the one gap.',
    'Edit image stays in the card and tree menus, at a normal weight. Replace file is in scope. #145 closes.',
  ],
  sections: [`<section class="sc">${scenes.join('')}</section>`],
});
html = html.replace('</style>', `${css}\n</style>`);

fs.writeFileSync(path.join(__dirname, '..', 'item-page.html'), html);
console.log('item-page.html', (html.length / 1024).toFixed(0) + ' KB');
