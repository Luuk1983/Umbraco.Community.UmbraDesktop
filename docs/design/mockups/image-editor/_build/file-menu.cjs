// The file menu redesign for the Image Editor (issue #136, after the real-backoffice run). The File tab and
// the separate Save button go; Save and a "..." button share the right corner, and "..." slides a
// panel in from the right, the way Umbraco's own side panels do. The modes take Umbraco's tab look.
// Static HTML, like the other mocks. Writes ../file-menu.html.
const E = require('./editor.cjs');

const { K, ic, WIN, CAPTION, PANEL, STATUS, MODES, fit, area, status, box, slider, seg, btn, pic, writePage } = E;

/** Where the window body starts and how tall it is: the side panels cover the body, not the title bar. */
const BODY = { x: WIN.x, y: WIN.y + CAPTION, w: WIN.w, h: WIN.h - CAPTION };
/** The "..." menu's width, and the wider panels that open from it. */
const MENU_W = 380;
const OPEN_W = 760;
const SAVEAS_W = 940;
const INFO_W = 460;

const LOUNGE = fit(1200, 800);
/** Lucide's arrow-left, for the way back to the menu. */
const BACK = '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';
const tasks = () => [{ label: 'Image Editor', active: true, icon: 'image' }];

/** The proposed mode bar: undo and redo, the modes as Umbraco tabs, and Save plus "..." at the right. */
function bar(o) {
  const tabs = MODES.map(
    ([id, label]) => `<span class="mt${o.mode === id ? ' on' : ''}${o.empty ? ' off' : ''}">${ic(id, 19)}<span>${label}</span></span>`,
  ).join('');
  const save =
    o.save === 'icon'
      ? `<span class="savei${o.empty || !o.dirty ? ' off' : ''}" title="Save">${ic('save', 19)}${o.dirty ? '<i class="udot"></i>' : ''}</span>`
      : `<span class="saveb${o.empty || !o.dirty ? ' off' : ''}">Save</span>`;
  return `<div class="nbar">
<span class="ib${o.empty || !o.undo ? ' off' : ''}">${ic('undo', 18)}</span><span class="ib off">${ic('redo', 18)}</span>
<span class="tabs">${tabs}</span>
<span class="nright">${save}<span class="more${o.menu ? ' on' : ''}" title="More">${ic('more', 20)}</span></span></div>`;
}

/** The bar as built today: File tab, filled tabs, and a filled Save that reads as a tab. */
function oldBar() {
  const tabs = MODES.map(([id, label]) => `<span class="mt fill${id === 'crop' ? ' on' : ''}">${ic(id, 19)}<span>${label}</span></span>`).join('');
  return `<div class="nbar old"><span class="mt fill file">${ic('open', 19)}<span>File</span></span><span class="tsep2"></span>
<span class="ib">${ic('undo', 18)}</span><span class="ib off">${ic('redo', 18)}</span>
<span class="tabs">${tabs}</span><span class="nright"><span class="oldsave">${ic('save', 17)}Save</span></span></div>`;
}

/** The editor window with the proposed bar. */
function editor(o) {
  const a = area();
  const body = `<div class="ed">${bar(o)}<div class="emid"><div class="cv" style="width:${a.w}px">${o.canvas ?? ''}</div><div class="panel">${o.panel ?? ''}</div></div>${status(o)}</div>`;
  return K.win({ ...WIN, title: o.title ?? (o.empty ? 'Image Editor' : 'Lounge'), icon: 'image', active: true, dirty: o.dirty, body });
}

/** The dimmed window under a side panel. */
const scrim = `<div class="sbscrim" style="left:${BODY.x}px;top:${BODY.y}px;width:${BODY.w}px;height:${BODY.h}px"></div>`;

/**
 * A side panel sliding in from the window's right edge: header, body, footer. `back` draws the arrow
 * that returns to the "..." menu.
 */
function side(o) {
  const head = `<div class="sbh">${o.back ? `<span class="sbback">${BACK}</span>` : ''}<span>${o.title}</span></div>`;
  const foot = o.foot ? `<div class="sbf">${o.foot}</div>` : '';
  return `<div class="sb" style="left:${BODY.x + BODY.w - o.w}px;top:${BODY.y}px;width:${o.w}px;height:${BODY.h}px">${head}<div class="sbb">${o.body}</div>${foot}</div>`;
}

/** One command in the "..." menu: icon, label, what it does, then its key or the arrow to its own panel. */
const item = (icon, label, sub, key, o = {}) =>
  `<div class="mi${o.hov ? ' hov' : ''}${o.off ? ' off' : ''}">${ic(icon, 22)}<span class="mtx"><b>${label}</b><small>${sub}</small></span>${key ? `<kbd>${key}</kbd>` : ''}${o.more ? `<span class="chev">${ic('right', 18)}</span>` : ''}</div>`;

/** The "..." menu itself. `empty` greys what needs an open image. */
function menu(o = {}) {
  const off = !!o.empty;
  const name = o.name ?? 'Lounge';
  return side({
    w: MENU_W,
    title: 'Image Editor',
    body: `<div class="mlist">
${item('open', 'Open', 'Another image from the media library', 'Ctrl+O', { more: true, hov: o.hov === 'Open' })}
${item('save', 'Save', off ? 'Nothing to save yet' : `Write over ${name}`, 'Ctrl+S', { off: off || !o.dirty, hov: o.hov === 'Save' })}
${item('copy', 'Save as', 'A copy, or another format', 'Ctrl+Shift+S', { more: true, off, hov: o.hov === 'Save as' })}
${item('info', 'Info', 'Size, format, folder, last change', '', { more: true, off, hov: o.hov === 'Info' })}
</div>
<div class="mlist">${item('x', 'Close', 'Close the Image Editor', '', { hov: o.hov === 'Close' })}</div>`,
    foot: `<span class="pbtn">Close menu</span>`,
  });
}

/** A recent image: thumbnail, name and folder. */
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
const openButtons = `<div class="obtns"><span class="pbtn big primary">${ic('open', 18)}Browse the media library...</span><span class="pbtn big">${ic('upload', 18)}Upload from this computer...</span></div>`;

const scenes = [];
const base = { mode: 'crop', undo: true, dirty: true, zoom: Math.round(LOUNGE.z * 100) + '%', name: 'Lounge', folder: 'Media / Design', dims: '1200 × 800 px', size: '1.4 MB JPEG' };
const cropPanel =
  box('Aspect ratio', `<div class="chips">${['Free', 'Original', '1:1', '4:3', '3:2', '16:9'].map((r) => `<span class="${r === 'Original' ? 'on' : ''}">${r}</span>`).join('')}</div>`) +
  box('Rotate and flip', `<div class="iconrow">${btn('', 'rotL', 'sq')}${btn('', 'rotR', 'sq')}${btn('', 'flipH', 'sq')}${btn('', 'flipV', 'sq')}</div>`) +
  `<div class="pfoot">${btn('Reset')}<span class="pbtn primary">Apply crop</span></div>`;
const RIGHT = WIN.x + WIN.w;
const BAR_Y = BODY.y + 26;

/* 1. Editing: the new bar. */
scenes.push(
  K.scene({
    id: 'f1',
    title: '1. Editing: Save and "..." together in the corner',
    lede: 'No File tab. Undo and redo on the left, the modes in the middle as Umbraco tabs, and the file commands in the right corner.',
    wins: [editor({ ...base, panel: cropPanel }) + pic(LOUNGE, 'lounge')],
    tasks: tasks(),
    notes: [
      [1, 540, BAR_Y, 'The modes look like the tabs at the top of a document in Umbraco: an icon over the name, and a line under the one you are in. They no longer look like buttons.'],
      [2, RIGHT - 120, BAR_Y + 30, 'Save is Umbraco\'s green Save button, so it never looks like a tab. Greyed when there is nothing to save. Ctrl+S does the same.'],
      [3, RIGHT - 30, BAR_Y + 30, '"..." opens the menu with everything else to do with the file.'],
    ],
  }),
);

/* 2. The "..." menu open. */
scenes.push(
  K.scene({
    id: 'f2',
    title: '2. The "..." menu',
    lede: 'It slides in from the right over the mode\'s panel, the way Umbraco\'s own side panels do, and stays inside the editor window. The picture stays in view behind it.',
    wins: [editor({ ...base, menu: true, panel: cropPanel }) + pic(LOUNGE, 'lounge') + scrim + menu({ dirty: true, hov: 'Save as' })],
    tasks: tasks(),
    notes: [
      [1, RIGHT - MENU_W - 26, BODY.y + 160, 'Save acts at once. Open, Save as and Info each open their own panel, shown by the arrow.'],
      [2, RIGHT - MENU_W - 26, BODY.y + 380, 'Close closes the editor window, asking first if there is unsaved work. That is what "Exit" would do, so there is only one of them.'],
      [3, null, null, 'Escape, a click on the dimmed picture, or Close menu puts it away. The keys still work without opening it.'],
    ],
  }),
);

/* 3. Open, from the menu. */
scenes.push(
  K.scene({
    id: 'f3',
    title: '3. Open',
    lede: 'Choosing Open slides a wider panel over the menu. The arrow at the top goes back to the menu.',
    wins: [
      editor({ ...base, menu: true, panel: cropPanel }) +
        pic(LOUNGE, 'lounge') +
        scrim +
        side({
          w: OPEN_W,
          back: true,
          title: 'Open',
          body: `<p class="pp">Recent images in the media library</p><div class="rgrid sm">${RECENT.join('')}</div>${openButtons}`,
          foot: `<span class="pbtn">Cancel</span>`,
        }),
    ],
    tasks: tasks(),
    notes: [
      [1, RIGHT - OPEN_W - 26, BODY.y + 32, 'Back to the menu. The same panel the File page had, at the side instead of over everything.'],
      [2, RIGHT - OPEN_W - 26, BODY.y + 250, 'One tap on a recent image opens it. Browse is Umbraco\'s media picker; Upload adds a file to the media library first.'],
      [3, null, null, 'With unsaved work, opening another image asks first, as it does today.'],
    ],
  }),
);

/* 4. Save as. */
{
  const radio = (on, label, sub) => `<div class="rcard${on ? ' on' : ''}"><span class="rb"></span><span><b>${label}</b><small>${sub}</small></span></div>`;
  const form = `<div class="sagrid"><div class="saform">
<div class="rcards">${radio(false, 'Replace Lounge', 'Write over the media item')}${radio(true, 'Save a copy', 'Keep the original as it is')}</div>
<div class="row2 fl"><label class="fld"><span>Name</span><span class="inp">Lounge (banner)</span></label></div>
<p class="pp">${ic('open', 15)} In <b>Media / Design</b>, next to the original. <u>Change...</u></p>
${box('File', `${seg(['Keep (JPEG)', 'JPEG', 'PNG', 'WebP'], 'Keep (JPEG)')}${slider('Quality', '85', 0.85, false)}<div class="sizes"><span>Now<b>1.4 MB</b></span><span class="arr">→</span><span>After<b>486 KB</b></span><em>−65%</em></div>`, 'flat')}
</div><div class="saprev"><span class="sapic" style="background-image:var(--lounge)"></span><small>1200 × 800 px, as it will be saved</small></div></div>`;
  scenes.push(
    K.scene({
      id: 'f4',
      title: '4. Save as',
      lede: 'The Save as page you had, as a panel. The buttons that do it are in the panel\'s footer, where Umbraco puts them.',
      wins: [
        editor({ ...base, menu: true, panel: cropPanel }) +
          pic(LOUNGE, 'lounge') +
          scrim +
          side({ w: SAVEAS_W, back: true, title: 'Save as', body: form, foot: `<span class="pbtn">Cancel</span><span class="pbtn save">Save copy</span>` }),
      ],
      tasks: tasks(),
      notes: [
        [1, RIGHT - SAVEAS_W - 26, BODY.y + 130, 'Replace or copy, name and folder, format and quality, with the size after measured. Nothing changed from the File page.'],
        [2, RIGHT - SAVEAS_W - 26, BODY.y + BODY.h - 32, 'The green button says what it will do: Save copy, or Replace Lounge.'],
      ],
    }),
  );
}

/* 5. Info. */
{
  const row = (k, v) => `<div class="irow"><span>${k}</span><b>${v}</b></div>`;
  scenes.push(
    K.scene({
      id: 'f5',
      title: '5. Info',
      lede: 'A narrow panel: what the media item is and where it lives.',
      wins: [
        editor({ ...base, menu: true, panel: cropPanel }) +
          pic(LOUNGE, 'lounge') +
          scrim +
          side({
            w: INFO_W,
            back: true,
            title: 'Info',
            body: box('Lounge', row('Folder', 'Media / Design') + row('Dimensions', '1200 × 800 px') + row('Size', '1.4 MB') + row('Format', 'JPEG') + row('Last updated', '16 Oct 2026, 14:02')),
            foot: `<span class="pbtn">Close</span>`,
          }),
      ],
      tasks: tasks(),
      notes: [[1, RIGHT - INFO_W - 26, BODY.y + 32, 'Back to the menu, or Close to go straight back to the picture.']],
    }),
  );
}

/* 6. Nothing open yet. */
{
  const a = area();
  const canvas = `<div class="eopen"><h2>Open an image</h2><p class="pp">Recent images in the media library</p><div class="rgrid sm">${RECENT.join('')}</div>${openButtons}</div>`;
  scenes.push(
    K.scene({
      id: 'f6',
      title: '6. Opened from the launcher, with nothing open',
      lede: 'There is no File page to start on any more, so the empty canvas offers the same choices as Open.',
      wins: [editor({ empty: true, zoom: '', canvas })],
      tasks: tasks(),
      notes: [
        [1, a.x + (a.w - 860) / 2 + 250, a.y + 87, 'The recent images, Browse and Upload, on the canvas where the picture will be.'],
        [2, RIGHT - 120, BAR_Y + 30, 'Disabled, never hidden: the modes, undo, redo and Save are greyed until an image is open. "..." still works, for Open and Close.'],
      ],
    }),
  );
}

/** A strip of just the bar, at the window's width, for the comparison at the top. */
const strip = (id, title, cap, inner) =>
  `<figure class="scene" id="${id}"><h3>${title}</h3><p class="cap">${cap}</p><div class="bscreen"><div class="bstage">${inner}</div></div></figure>`;
const strips = [
  strip('b0', 'Now, as built', 'File on the left and Save on the right, and Save drawn like the selected tab.', oldBar()),
  strip('b1', 'A. Proposed: Umbraco\'s green Save button and "..."', 'My recommendation. Umbraco editors already know the green Save.', bar({ ...base, save: 'button' })),
  strip('b2', 'B. Proposed: a save icon and "..."', 'Quieter. The dot on the icon says there is something to save.', bar({ ...base, save: 'icon' })),
];

writePage(
  'file-menu.html',
  {
    title: 'Image Editor: the file menu',
    lede: `<p class="lede">Issue #136, after the run in a real backoffice. The File tab and the separate Save button go. Save and a "..." menu share the right corner; the menu slides in from the right like Umbraco's own side panels. Drawn in the Umbraco theme; every other theme draws the same controls its own way.</p>
  <div class="key"><span><span class="mk">1</span> a note, listed under the picture</span></div>`,
    sections: [
      `<section class="sc"><h2>The bar</h2>${strips.join('')}</section>`,
      `<section class="sc"><h2>The editor, with A</h2>${scenes.join('')}</section>`,
    ],
    questions: [
      'Save as Umbraco\'s green button (A) or as an icon (B)? I recommend A.',
      'The menu sliding in from the right, inside the editor window, over the mode\'s panel. Right side and that width?',
      'Open, Save as and Info as panels that slide over the menu, with an arrow back. Or should they be dialogs in the middle of the window?',
      '"Exit" and "Close" as one command, Close. Or did you mean something else by Exit?',
      'With nothing open, the recent images on the empty canvas (scene 6). Good?',
    ],
  },
  ['filemenu.css'],
);
