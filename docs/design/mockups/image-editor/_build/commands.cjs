// Alternatives to the menu bar for an app's commands (issues #112 and #136), each drawn on the
// Image Editor so they compare like for like. Touch is the reason for looking: a menu bar's 26px
// titles and 34px rows are fine for a mouse and fiddly for a finger. Writes ../commands.html.
const E = require('./editor.cjs');

const { K, ic, WIN, PANEL, STATUS, PAD, MODES, box, slider, btn } = E;

const ADJ = ';filter:brightness(1.55) contrast(1.06) saturate(.92)';
const tasks = [{ label: 'Image Editor', active: true, icon: 'image' }];
/** The Adjust panel every scene shows, so only the commands differ between them. */
const adjustPanel =
  box('Light', slider('Exposure', '+0.8', 0.7) + slider('Brightness', '+12', 0.56) + slider('Contrast', '+6', 0.53)) + box('Colour', slider('Saturation', '−8', 0.46));
const statusOf = (zoom) => E.status({ name: 'Lounge', folder: 'Media / Design', dims: '1200 × 800 px', size: '1.4 MB JPEG', zoom });

/** The canvas area under a caption `cap` high and `rows` of bars. */
const areaUnder = (cap, rows) => ({ x: WIN.x, y: WIN.y + cap + rows, w: WIN.w - PANEL, h: WIN.h - cap - rows - STATUS });

/** The five modes as the mode bar draws them, optionally led by a File tab. */
const modeTabs = (on, lead = '') =>
  `${lead}${MODES.map(([id, label]) => `<span class="mt${on === id ? ' on' : ''}">${ic(id, 19)}<span>${label}</span></span>`).join('')}`;

/**
 * A window whose caption the app helps fill. `cap` is the caption's inner HTML and height, `rows`
 * the bars under it; the rest is the editor's canvas, panel and status bar.
 */
function shell(o) {
  const a = areaUnder(o.capH, o.rowsH ?? 0);
  const body = `<div class="ed">${o.rows ?? ''}<div class="emid"><div class="cv" style="width:${a.w}px"></div><div class="panel">${adjustPanel}</div></div>${statusOf(o.zoom)}</div>`;
  return `<div class="win active" style="left:${WIN.x}px;top:${WIN.y}px;width:${WIN.w}px;height:${WIN.h}px"><div class="${o.capClass}" style="height:${o.capH}px">${o.cap}</div><div class="wbody">${body}</div></div>`;
}
const winCtl = '<span class="hctl"><i>&#8212;</i><i>&#9744;</i><i>&#10005;</i></span>';

const scenes = [];

/* A. The menu bar, as in the editor mocks, for reference. */
{
  const f = E.fit(1200, 800, E.area(0, 32));
  scenes.push(
    K.scene({
      id: 'a',
      title: 'A. The menu bar (the mocks so far)',
      lede: 'Recognisable, compact, complete. Made for a mouse: menu titles are 26px high and rows 34px, and nothing is visible until you open something.',
      wins: [E.editor({ classic: true, mode: 'adjust', dirty: true, undo: true, menu: 'File', panel: adjustPanel, zoom: Math.round(f.z * 100) + '%', name: 'Lounge', folder: 'Media / Design', dims: '1200 × 800 px', size: '1.4 MB JPEG' }) + E.pic(f, 'lounge', ADJ) + E.dropdown('File', 'Save as...')],
      tasks,
      notes: [
        [1, WIN.x + 300, WIN.y + 90, 'Touch: small targets, and hover does nothing, so you only find what is in a menu by opening each one.'],
        [2, null, null, 'Two rows above the picture: the menu bar and the mode bar.'],
      ],
    }),
  );
}

/* B. Commands in the title bar, with one app menu. */
{
  const CAP = 60;
  const a = areaUnder(CAP, 0);
  const f = E.fit(1200, 800, a);
  const cap = `<span class="happ">${ic('image', 18)}<b>Lounge</b><span class="dirty"></span></span>
<span class="hib">${ic('undo', 20)}</span><span class="hib off">${ic('redo', 20)}</span>
<span class="hpill">${MODES.map(([id, label]) => `<span class="${id === 'adjust' ? 'on' : ''}">${ic(id, 18)}${label}</span>`).join('')}</span>
<span class="hsave">Save</span><span class="hib on">${ic('more', 22)}</span>${winCtl}`;
  const row = (icon, label, key) => `<div class="pr">${ic(icon, 18)}<span>${label}</span><kbd>${key}</kbd></div>`;
  const menu = `<div class="amenu" style="right:${1600 - WIN.x - WIN.w + 150}px;top:${WIN.y + CAP - 4}px">
${row('open', 'Open...', 'Ctrl+O')}${row('copy', 'Save as...', 'Ctrl+Shift+S')}
<div class="psep"></div>
<div class="pzoom"><span>Zoom</span><span class="pzb">${ic('zout', 18)}</span><b>84%</b><span class="pzb">${ic('zin', 18)}</span><span class="pzb">${ic('expand', 17)}</span></div>
<div class="psep"></div>
<div class="picons">${[['rotL', 'Rotate left'], ['rotR', 'Rotate right'], ['flipH', 'Flip'], ['flipV', 'Flip up']].map(([i, l]) => `<span>${ic(i, 20)}<small>${l}</small></span>`).join('')}</div>
<div class="psep"></div>
${row('info', 'Image Editor help', 'F1')}${row('x', 'Close', 'Ctrl+W')}
</div>`;
  scenes.push(
    K.scene({
      id: 'b',
      title: 'B. Commands in the title bar, with one app menu',
      lede: 'The way GNOME, Chrome and Windows 11\'s own Photos and Paint do it: the few commands you use all the time sit in the title bar, everything else is in one menu behind the ⋯ button.',
      wins: [shell({ capClass: 'hcap', capH: CAP, cap, zoom: Math.round(f.z * 100) + '%' }) + E.pic(f, 'lounge', ADJ) + menu],
      tasks,
      notes: [
        [1, 800, WIN.y + 82, 'The modes move up into the title bar as one pill. Each is 44px high: a finger\'s worth.'],
        [2, 1030, WIN.y + 80, 'Save and the menu are always there. The menu has 48px rows, zoom inline (as Chrome\'s menu does), and rotate and flip as big buttons.'],
        [3, null, null, 'The picture gains the whole menu bar and mode bar: 84px taller than in A.'],
        [4, null, null, 'The app hands the desktop its commands as data, marked "always show" or "in the menu". The theme draws them. Windows 98 could still draw a classic menu bar from the same data, so nothing is removed.'],
        [5, null, null, 'A side effect: this is exactly the headerbar that the parked Linux theme was waiting for (see CLAUDE.md).'],
        [6, null, null, 'The cost: less empty title bar to drag the window by. In a narrow window, the modes fold into the menu first.'],
      ],
    }),
  );
}

/* C. A File page over the whole window. */
{
  const CAP = 40;
  const ROWS = 52;
  const a = areaUnder(CAP, ROWS);
  const f = E.fit(1200, 800, a);
  const file = `<span class="mt file on">${ic('open', 19)}<span>File</span></span><span class="tsep"></span>`;
  const rows = `<div class="ebar c-bar">${modeTabs('', file)}</div>`;
  const tile = (name, where, bg, pos = 'center', size = 'cover') =>
    `<div class="rtile"><span class="rimg" style="background-image:var(--${bg});background-position:${pos};background-size:${size}"></span><b>${name}</b><small>${where}</small></div>`;
  const sheet = `<div class="fsheet" style="left:${WIN.x}px;top:${WIN.y + CAP + ROWS}px;width:${WIN.w}px;height:${WIN.h - CAP - ROWS}px">
<div class="fnav"><div class="fn back">${ic('undo', 20)}Back to the picture</div>${[['open', 'Open', true], ['copy', 'Save'], ['copy', 'Save as'], ['info', 'Info'], ['x', 'Close']].map(([i, l, on]) => `<div class="fn${on ? ' on' : ''}">${ic(i, 20)}${l}</div>`).join('')}</div>
<div class="fbody"><h2>Open</h2><p>Recent images in the media library</p>
<div class="rgrid">${tile('Lounge', 'Media / Design', 'lounge')}${tile('Codegarden stage', 'Media / Engage', 'onesie', 'center 20%')}${tile('Media library how-to', 'Media / Engage', 'shot', 'left top')}${tile('Lounge (banner)', 'Media / Design', 'lounge', 'center 45%', '160%')}${tile('Ukulele', 'Media / Design', 'lounge', '62% 30%', '420%')}${tile('Stage, wide', 'Media / Engage', 'onesie', 'center 70%', '140%')}</div>
<div class="fbtns"><span class="pbtn big primary">${ic('open', 18)}Browse the media library...</span><span class="pbtn big">${ic('upload', 18)}Upload from this computer...</span></div></div></div>`;
  scenes.push(
    K.scene({
      id: 'c',
      title: 'C. A File page over the whole window',
      lede: 'Office\'s Backstage, or the gallery Procreate and Affinity Photo open on: File is the first tab, and it turns the window into a page of big targets.',
      wins: [shell({ capClass: 'wcap ccap', capH: CAP, cap: `${ic('image', 17)}<span class="title">Lounge<span class="dirty"></span></span>${winCtl}`, rows, rowsH: ROWS, zoom: Math.round(f.z * 100) + '%' }) + E.pic(f, 'lounge', ADJ) + sheet],
      tasks,
      notes: [
        [1, WIN.x + 120, WIN.y + CAP + 44, 'File is a tab like the modes, not a menu. One row of bars instead of two.'],
        [2, 1300, 300, 'Open shows the images you edited recently, with thumbnails. Most opens are one tap, without the media picker.'],
        [3, null, null, 'Save as is a page here too, not a dialog: replace or copy, format, quality, sizes, with room to show the picture.'],
        [4, null, null, 'Info could show where the image is used before you overwrite it. Not in the first version, but this is where it would go.'],
        [5, null, null, 'The cost: a whole page is too much for an app with two commands, like Sticky Notes. It is something an app chooses, not the desktop default. Zoom, undo and rotate still need a home outside it (status bar, mode bar).'],
      ],
    }),
  );
}

/* D. The menu bar, adapting to touch. */
{
  const CAP = 40;
  const ROWS = 52;
  const a = areaUnder(CAP, ROWS);
  const f = E.fit(1200, 800, a);
  const rows = `<div class="ebar"><span class="hib dk">${ic('undo', 20)}</span><span class="hib dk off">${ic('redo', 20)}</span><span class="tabs">${modeTabs('adjust')}</span><span class="hib ghost"></span><span class="hib ghost"></span></div>`;
  const cap = `${ic('image', 17)}<span class="title">Lounge<span class="dirty"></span></span><span class="dmenu">${ic('more', 20)}</span>${winCtl}`;
  const item = (icon, label, key) => `<div class="tr2">${ic(icon, 20)}<span>${label}</span><kbd>${key}</kbd></div>`;
  const sheet = `<div class="tsheet" style="right:${1600 - WIN.x - WIN.w + 140}px;top:${WIN.y + CAP - 2}px">
<div class="tcol">${['File', 'Edit', 'View', 'Image', 'Help'].map((m) => `<div class="tm${m === 'File' ? ' on' : ''}"><span>${m}</span>${ic('right', 16)}</div>`).join('')}</div>
<div class="tcol items">${item('open', 'Open...', 'Ctrl+O')}${item('copy', 'Save', 'Ctrl+S')}${item('copy', 'Save as...', 'Ctrl+Shift+S')}<div class="psep"></div>${item('x', 'Close', 'Ctrl+W')}</div></div>
<span class="touch" style="left:${WIN.x + WIN.w - 176}px;top:${WIN.y + 8}px"></span>`;
  scenes.push(
    K.scene({
      id: 'd',
      title: 'D. One menu, drawn for whatever you point with',
      lede: 'What iPadOS 26 does: with a mouse you get the menu bar of A. Touch the screen and the bar folds into a ⋯ button, which opens the same menus at finger size.',
      wins: [shell({ capClass: 'wcap ccap', capH: CAP, cap, rows, rowsH: ROWS, zoom: Math.round(f.z * 100) + '%' }) + E.pic(f, 'lounge', ADJ) + sheet],
      tasks,
      notes: [
        [1, WIN.x + WIN.w - 110, WIN.y + 330, 'Tapped with a finger. Menus on the left, their commands on the right, 52px rows.'],
        [2, null, null, 'It follows the last thing you pointed with, not the device: a laptop with a touch screen gets the bar back as soon as the mouse moves.'],
        [3, null, null, 'The safest choice: A for mouse users, unchanged, plus a touch layout. The cost is two layouts of every menu to theme and test.'],
        [4, null, null, 'Works with any of the others: a long press on the picture could open the same menus at the finger, as Procreate and Krita do.'],
      ],
    }),
  );
}

E.writePage(
  'commands.html',
  {
    title: 'Where an app\'s commands go',
    lede: `<p class="lede">Alternatives to the menu bar, for issue #112 and the Image Editor (#136). All four hold the same commands. The difference is how they look, how much room they take, and how they work with a finger.</p>
<div class="key"><span><span class="mk">1</span> a note, listed under the picture</span></div>`,
    sections: [`<section class="sc"><h2>Four ways</h2>${scenes.join('')}</section>`],
    decided: [
      'Every option is data the app hands the desktop, drawn by the theme. A theme may draw it differently, never leave a command out.',
      'Zoom lives in the status bar in every option, except where B adds it to the menu as well.',
    ],
    questions: [
      'My pick is B: it is the most touch-friendly, gives the picture the most room, looks like a 2026 app, and solves the Linux theme. C is the most different and the best for opening files; D is the safe one. Which way?',
      'If B: should a classic theme like Windows 98 draw the same commands as a menu bar and toolbar instead, so it still looks like 1998?',
    ],
  },
  [],
);
