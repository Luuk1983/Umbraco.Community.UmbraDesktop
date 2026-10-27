// Media guidelines on upload: files dropped into a Media Manager folder are checked against the
// site's guidelines (too many pixels, a PNG photo, a recorded location). Those that follow them upload
// at once; the rest are listed in a warning where each can be unticked, and Optimize hands the ticked
// ones to the Optimize images window, set from the guidelines, which uploads each file as it finishes.
// Writes ../upload-guidelines.html.
const fs = require('fs');
const path = require('path');
const K = require('../../media-manager/_build/kit.cjs');

const { PRODUCTS, ic, win, manager, scene, osGhost, explorer } = K;

/** The Optimize images mocks' own styles, read from their builder so both windows look the same. */
const OPT_CSS = fs.readFileSync(path.join(__dirname, '../../optimize-images/_build/rework.cjs'), 'utf8').match(/const CSS = `<style>([\s\S]*?)<\/style>`;/)[1];

/** The backoffice's icon-info (Lucide info). */
const INFO = (px) => `<svg class="uic" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;

/** The backoffice's icon-alert (Lucide triangle-alert). */
const ALERT = (px) => `<svg class="uic" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01"/></svg>`;

/**
 * The six files dropped in every scene. Four break a guideline, two do not. `thumb` is a kit image;
 * none draws an icon. `item` is the name core gives the media item: the file name without extension.
 */
const FILES = [
  { key: 'a', name: 'DSC_0412.jpg', item: 'DSC_0412', thumb: 'banjo', meta: 'JPEG · 6000 × 4000 · 13.2 MB', reasons: ['6000 × 4000 px', 'Location'] },
  { key: 'b', name: 'DSC_0415.jpg', item: 'DSC_0415', thumb: 'bowling', meta: 'JPEG · 6000 × 4000 · 12.8 MB', reasons: ['6000 × 4000 px', 'Location'] },
  { key: 'c', name: 'team-day.png', item: 'team-day', thumb: 'janae', meta: 'PNG · 3200 × 2133 · 9.4 MB', reasons: ['3200 × 2133 px', 'PNG photo'] },
  { key: 'd', name: 'tattoo-shop.jpg', item: 'tattoo-shop', thumb: 'tattoo', meta: 'JPEG · 1920 × 1280 · 640 KB', reasons: ['Location'] },
  { key: 'e', name: 'logo-partner.png', item: 'logo-partner', meta: 'PNG with transparency · 800 × 400 · 42 KB', ok: true },
  { key: 'f', name: 'unicorn.webp', item: 'unicorn', thumb: 'unicorn', meta: 'WebP · 1600 × 1067 · 180 KB', ok: true },
];
const BREAK = FILES.filter((f) => !f.ok);
const FINE = FILES.filter((f) => f.ok);
const file = (key) => FILES.find((f) => f.key === key);

/** What is already in Products: the kit's products, less the ones whose pictures the dropped files use. */
const SHELF = PRODUCTS.filter((p) => !['banjo', 'bowling', 'tattoo', 'unicorn'].includes(p.id));

/** A dropped file as a media item card: its picture once uploaded, or an icon. */
const asItem = (f) => ({ id: f.thumb ? `${f.thumb}` : undefined, name: f.item, icon: 'image' });

const tasks = (...l) => l.map(([label, active, icon, progress]) => ({ label, active, icon, progress }));

/** A checkbox, as core's uui-checkbox draws it. */
const check = (on) => `<span class="gck${on ? ' on' : ''}">${on ? ic('check', 12) : ''}</span>`;

/** One file in the warning: tick, picture, name and what it is, then why it is listed. */
function warnRow(f, on) {
  const th = f.thumb ? `<span class="tth th-${f.thumb}"></span>` : `<span class="tth">${ic('image', 16)}</span>`;
  return `<div class="gr${on ? '' : ' off'}">${check(on)}${th}<span class="tnm"><b>${f.name}</b><small>${f.meta}</small></span><span class="chips">${f.reasons.map((r) => `<span class="chip">${r}</span>`).join('')}</span></div>`;
}

/**
 * The warning's content, the same in both placements: what happened, the files with their reasons and
 * ticks, what Optimize will do, and the two answers.
 */
function warning(o = {}) {
  const ticked = o.ticked ?? BREAK.map((f) => f.key);
  const n = ticked.length;
  const rows = BREAK.map((f) => warnRow(f, ticked.includes(f.key))).join('');
  return `<div class="gh"><span class="gi">${ALERT(20)}</span><div><b>4 of 6 files do not follow the media guidelines</b><small>The other 2 are uploading to Products now.</small></div><span class="gx">${ic('x', 16)}</span></div>
<div class="gall">${check(n === BREAK.length)}<span>Select all</span><span class="gsel">${n} of ${BREAK.length} selected</span></div>
<div class="gl">${rows}</div>
<div class="gwhat"><span class="ii">${INFO(15)}</span><span>Optimize opens the optimizer for the selected files, set to the guidelines: resize to 2560 px, PNG photos to WebP, location removed. You can still change that there.</span></div>
<div class="gf"><a class="lnk">Media guidelines</a><span class="sp"></span><span class="dbtn plain">Upload as they are</span><span class="dbtn positive">Optimize ${n}</span></div>`;
}

/**
 * The Media Manager on Products. `fine` says where the two files that follow the guidelines are:
 * 'none' not dropped yet, 'uploading' as core's placeholders, 'uploaded' as items. `extra` adds items.
 */
function shelf(o = {}) {
  const fine = o.fine ?? 'uploading';
  let items = [...SHELF];
  let state = {};
  if (fine === 'uploading') {
    // Placeholders are keyed by made-up ids, so they draw no picture.
    items.push(...FINE.map((f, i) => ({ id: `up${i}`, name: f.item })));
    state = Object.fromEntries(FINE.map((f, i) => [`up${i}`, { placeholder: { progress: o.progress?.[i] ?? 0.6 } }]));
  }
  if (fine === 'uploaded') items.push(...FINE.map(asItem));
  items.push(...(o.extra ?? []));
  Object.assign(state, o.state ?? {});
  return manager({ ...o.rect, title: 'Products', current: 'products', items, state, loader: o.loader, pane: o.pane, active: o.active });
}

const FULL = { x: 24, y: 24, w: 1552, h: 900 };
const LEFT = { x: 24, y: 24, w: 880, h: 900 };
const TALL = { x: 920, y: 24, w: 656, h: 900 };

/** Variant A: Umbraco's own kind of dialog, over the whole desktop. */
const dialogA = (o) => `<div class="scrim"></div><div class="gdlg">${warning(o)}</div>`;

/** Variant B: a sheet inside the window the files were dropped on, which is the only thing it blocks. */
const sheetB = (o) => `<div class="wscrim"></div><div class="gsheet">${warning(o)}</div>`;

/** The optimizer's settings view, opened with dropped files instead of media items. */
function settings() {
  const sw = (on, locked) => `<span class="tg${on ? ' on' : ''}${locked ? ' locked' : ''}"><i></i></span>`;
  const num = (v, cls = '') => `<span class="in ${cls}">${v}</span>`;
  const seg = (opts, on) => `<span class="seg">${opts.map((x) => `<span${x === on ? ' class="on"' : ''}>${x}</span>`).join('')}</span>`;
  const line = (label, field) => `<div class="fl"><span class="fk">${label}</span><span class="fv">${field}</span></div>`;
  const group = ({ on, locked, name, fields = '' }) => `<div class="cg${on ? ' on' : ''}"><div class="ch">${sw(on, locked)}<b>${name}</b><span class="ib">${INFO(18)}</span></div>${on && fields ? `<div class="cf">${fields}</div>` : ''}</div>`;
  const quality = `<span class="slider"><span style="width:80%"></span><i style="left:80%"></i></span>${num(80, 'q')}`;
  const thumbs = BREAK.filter((f) => f.key !== 'd').map((f) => `<span class="it th-${f.thumb}"></span>`).join('');
  return `<div class="rw">
<div class="intro">
<div class="from">${ic('upload', 16)}<span>Upload to Media <span class="sep">/</span> <b>Products</b></span></div>
<div class="ih"><b>Optimize 3 files, then upload them</b></div>
<div class="strip">${thumbs}</div>
<div class="skip"><span class="ii">${INFO(15)}</span><span>Set from the media guidelines.</span></div>
</div>
<div class="sect"><div class="st">What to do</div>
${group({ on: true, name: 'Resize to a maximum width or height', fields: line('Max width', `${num(2560)}<span class="u">px</span>`) + line('Max height', `${num(2560)}<span class="u">px</span>`) })}
${group({ on: true, name: 'Convert PNG photos', fields: line('Format', seg(['JPEG', 'WebP'], 'WebP')) + line('Quality', quality) + `<div class="fl"><span class="fk"></span><span class="fv hint">JPEG and WebP files and PNGs with transparency keep their format.</span></div>` })}
${group({ on: true, locked: true, name: 'Remove location, camera and date' })}
</div>
<div class="sect save2"><div class="st">Where the result goes</div>
<div class="dest">${ic('folder', 18)}<div><span>Uploaded to <b>Products</b>, each file as soon as it is done</span><small>The folder you dropped them on.</small></div></div>
</div>
<div class="of"><span class="dbtn">Cancel</span><span class="dbtn positive">Optimize and upload 3</span></div>
</div>`;
}

/** The run: a bar while it runs, a row per file with what it went from and to, and its state. */
function run(o) {
  const rows = o.rows
    .map(([key, after, state, change]) => {
      const f = file(key);
      const right = {
        done: `<span class="js ok">${ic('check', 15)}${change}</span>`,
        busy: `<span class="js run">${change}</span>`,
        wait: `<span class="js wait">Waiting</span>`,
        fail: `<span class="js bad">${ic('alert', 15)}Failed</span>`,
      }[state];
      const second = state === 'fail' ? `<em>${after}</em>` : `<small>${f.meta.split(' · ').slice(1).join(' · ')}${after ? ` <span class="ar">→</span> ${after}` : ''}</small>`;
      const btns = state === 'fail' ? `<span class="rbtns"><span class="tbtn sm">Retry</span><span class="tbtn sm">Upload the original</span></span>` : '';
      return `<div class="jr${state === 'fail' ? ' fail' : ''}"><span class="tth th-${f.thumb}"></span><span class="tnm"><b>${f.name}</b>${second}${btns}</span>${right}</div>`;
    })
    .join('');
  const head = o.done
    ? `<div class="jh"><span class="done ${o.failed ? 'grew' : ''}">${ic(o.failed ? 'alert' : 'check', 18)}</span><b>${o.title}</b><span class="tob"><span class="tbtn primary">Close</span></span></div><div class="jm">${o.meta}</div>`
    : `<div class="jh"><b>${o.title}</b><span class="tob"><span class="tbtn">Cancel</span></span></div><div class="jbar"><span style="width:${o.progress * 100}%"></span></div><div class="jm2">${o.meta}</div>`;
  return `<div class="job">${head}<div class="jsets">Resize to 2560 × 2560 · PNG photos to WebP at 80 · location removed · uploading to Products</div><div class="jl">${rows}</div></div>`;
}

const CSS = `<style>
${OPT_CSS}
.wscrim { position: absolute; inset: 0; z-index: 20; background: rgba(15, 18, 53, .38); }
.gsheet { position: absolute; z-index: 21; left: 50%; top: 0; width: 640px; transform: translateX(-50%); background: #fff; border-radius: 0 0 8px 8px; box-shadow: 0 14px 36px rgba(10, 14, 40, .4); color: #303033; font-size: 14px; }
.gdlg { position: absolute; z-index: 86; left: 50%; top: 46%; width: 640px; transform: translate(-50%, -50%); background: #fff; border-radius: 6px; box-shadow: 0 14px 40px rgba(0, 0, 0, .4); color: #303033; font-size: 14px; }
.gh { display: grid; grid-template-columns: 28px 1fr 26px; gap: 12px; align-items: start; padding: 18px 20px 12px 22px; }
.gh b { display: block; font-size: 17px; color: #1b264f; }
.gh small { display: block; margin-top: 2px; color: #6b6b72; font-size: 13.5px; }
.gi { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; align-items: center; justify-content: center; background: #fff3e0; color: #c27c00; }
.gx { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; color: #6b6b72; }
.gall { display: flex; align-items: center; gap: 10px; padding: 8px 22px; border-top: 1px solid #ececef; border-bottom: 1px solid #ececef; background: #fafafb; font-size: 13.5px; color: #515054; }
.gsel { margin-left: auto; color: #8a8a90; }
.gck { flex: none; display: inline-grid; place-items: center; width: 18px; height: 18px; border: 1px solid #8f8f93; border-radius: 3px; background: #fff; color: #fff; }
.gck.on { background: #3544b1; border-color: #3544b1; }
.gl { padding: 0 22px; }
.gr { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid #f0f0f2; }
.gr:last-child { border-bottom: 0; }
.gr .tth { width: 48px; height: 36px; }
.gr.off .tth, .gr.off .tnm, .gr.off .chips { opacity: .5; }
.chips { flex: none; display: flex; gap: 6px; }
.chip { padding: 2px 8px; border-radius: 10px; background: #fff3e0; color: #7a5200; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.gwhat { display: flex; gap: 8px; align-items: flex-start; margin: 4px 22px 0; padding: 8px 10px; border-radius: 3px; background: #f1f3fb; color: #3b4060; font-size: 13.5px; }
.gf { display: flex; align-items: center; gap: 8px; padding: 14px 22px 16px; margin-top: 12px; border-top: 1px solid #e9e9eb; }
.gf .lnk { margin-left: 0; font-weight: 400; font-size: 13.5px; }
.gf .sp { flex: 1; }
.dbtn.plain { border: 1px solid #c2c2c2; }
.fv.hint { color: #6b6b72; font-size: 13px; }
.dest { display: flex; gap: 10px; align-items: flex-start; padding: 6px 24px; }
.dest .ic { color: #3544b1; margin-top: 1px; }
.dest small { display: block; color: #6b6b72; font-size: 13px; }
.jbar { margin: 12px 0 0; height: 6px; border-radius: 3px; background: #e3e6f5; overflow: hidden; }
.jbar span { display: block; height: 100%; background: #3544b1; }
.jm2 { margin: 8px 0 0; font-size: 13.5px; color: #515054; }
.js.run { color: #3544b1; }
.js.wait { color: #8a8a90; font-weight: 400; }
.js.bad { color: #d42054; }
.jr .tnm em { font-style: normal; color: #b0173e; font-size: 12.5px; }
.rbtns { display: flex; gap: 6px; margin-top: 6px; }
.jr.fail { align-items: flex-start; }
.cmp2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 10px 0 0; font-size: 14px; }
.cmp2 div { background: #fff; border: 1px solid #e3e4ea; border-radius: 6px; padding: 12px 14px; }
.cmp2 h4 { margin: 0 0 6px; }
.cmp2 ul { margin: 0; padding-left: 18px; }
</style>`;

const sections = [];

// U1: the drop. Nothing new to see, which is the point.
sections.push(`<section class="sc"><h2>U1. The drop</h2><p>Six files dragged from File Explorer onto the Products folder in a Media Manager window, the way it works today. The check happens when they land, in the browser, before anything is sent.</p>
${scene({
  id: 'u1',
  title: 'U1. Six photos and a logo on their way in',
  wins: [
    shelf({ rect: { x: 24, y: 24, w: 1000, h: 900 }, active: true, fine: "none" }),
    explorer({
      x: 1060, y: 140, w: 500, h: 260, title: 'Pictures',
      rows: FILES.map((f) => ({ name: f.name, meta: f.meta.split(' · ').pop(), sel: true })),
    }),
  ],
  tasks: tasks(['Products', true]),
  over: osGhost(640, 520, 6),
})}</section>`);

// U2: the warning, in two placements.
sections.push(`<section class="sc"><h2>U2. The warning</h2><p>The two files that follow the guidelines are already uploading, as core's placeholders in the grid. The four that do not are listed, each with why, all ticked. Untick what you want left alone, then Optimize, or upload everything as it is. The same content in two places: over the whole desktop, or inside the window you dropped on.</p>
${scene({
  id: 'u2a',
  title: 'U2A. Over the desktop, as Umbraco’s own dialogs open',
  wins: [shelf({ rect: FULL, progress: [0.7, 0.45], loader: 0.55 })],
  tasks: tasks(['Products', true]),
  over: dialogA({ ticked: ['a', 'b', 'c'] }),
  notes: [
    [1, null, null, 'Blocks the whole desktop until answered, like core’s own dialogs. Clear, but a slow upload elsewhere waits on it too.'],
  ],
})}
${scene({
  id: 'u2b',
  title: 'U2B. Inside the window the files were dropped on',
  wins: [shelf({ rect: FULL, progress: [0.7, 0.45], loader: 0.55, active: true, pane: sheetB({ ticked: ['a', 'b', 'c'] }) })],
  tasks: tasks(['Products', true]),
  notes: [
    [1, 460, 103, 'Drops from the top of the window’s body. Only this window waits; the rest of the desktop carries on.'],
    [2, 460, 382, 'tattoo-shop.jpg is unticked: a shop photo whose location you mean to keep. It uploads as it is, along with any you do not tick.'],
    [3, 1140, 208, 'Each file says why it is listed, in the words of the guideline it breaks.'],
    [4, 460, 516, 'Media guidelines opens them in Desktop settings: editable for users with the Settings section, read only for everyone else.'],
    [5, 1140, 95, 'Closing it: see the questions. My proposal is that it means "upload as they are", so nothing dropped silently vanishes.'],
  ],
})}</section>`);

// U3-U5: the optimizer, given files rather than media items.
sections.push(`<section class="sc"><h2>U3. The optimizer, opened with the files</h2><p>The Optimize images window from #139, opened by Optimize with the three ticked files and set from the guidelines. Two things differ from a run on media items: there are no originals in the library to replace, so where the result goes is just the folder; and Convert only touches PNG photos, which is what the guideline asks for.</p>
${scene({
  id: 'u3',
  title: 'U3. Set from the guidelines, ready to go',
  wins: [shelf({ rect: LEFT, fine: "uploaded" }), win({ ...TALL, title: 'Optimize and upload: Products (3)', icon: 'image', active: true, body: settings() })],
  tasks: tasks(['Products'], ['Optimize and upload', true, 'image']),
  notes: [
    [1, 1590, 144, 'Says where the files are going, how many, and that the settings came from the guidelines.'],
    [2, 1590, 470, 'Convert names what it converts: PNG photos only. A JPEG that only had a location keeps its format, and a logo with transparency stays PNG.'],
    [3, 1590, 662, 'No Replace or Save copies: the files are new. They go to the folder you dropped them on.'],
    [4, null, null, 'Cancel here uploads nothing of the three. They are still on your computer.'],
  ],
})}</section>`);

sections.push(`<section class="sc"><h2>U4. Running, and when it is done</h2><p>One file at a time: optimized, then uploaded, then the next. Each appears in the folder as it lands. The window shows progress on its title bar and its taskbar button, as #139 does, so it can be minimized while you work on.</p>
${scene({
  id: 'u4',
  title: 'U4. Halfway: one uploaded, one on its way up, one waiting',
  wins: [
    shelf({ rect: LEFT, fine: "uploaded", extra: [asItem(file("a")), { id: "upb", name: "DSC_0415" }], state: { upb: { placeholder: { progress: 0.2 } } } }),
    win({ ...TALL, h: 560, title: 'Optimize and upload: Products (3)', icon: 'image', active: true, body: run({ title: 'Optimizing 3 files', progress: 0.45, meta: '1 of 3 uploaded · 12.6 MB saved so far', rows: [['a', 'WebP · 2560 × 1707 · 612 KB', 'done', '−95%'], ['b', '', 'busy', 'Uploading'], ['c', '', 'wait']] }) }),
  ],
  tasks: tasks(['Products'], ['Optimize and upload', true, 'image', 0.45]),
  notes: [
    [1, 431, 830, 'DSC_0412 is in the folder at its new size; DSC_0415 is uploading as core’s placeholder.'],
    [2, 720, 960, 'The taskbar button carries the progress, so the window can be minimized.'],
  ],
})}
${scene({
  id: 'u5',
  title: 'U5. Done, with one file that could not be read',
  wins: [
    shelf({ rect: LEFT, fine: "uploaded", extra: [asItem(file("a")), asItem(file("b"))] }),
    win({ ...TALL, h: 560, title: 'Optimize and upload: Products (3)', icon: 'image', active: true, body: run({ done: true, failed: true, title: '2 uploaded to Products', meta: '25.1 MB saved · 1 failed', rows: [['a', 'WebP · 2560 × 1707 · 612 KB', 'done', '−95%'], ['b', 'WebP · 2560 × 1707 · 588 KB', 'done', '−95%'], ['c', 'This browser could not read the picture. Nothing was uploaded.', 'fail']] }) }),
  ],
  tasks: tasks(['Products'], ['Optimize and upload', true, 'image']),
  notes: [
    [1, 1590, 334, 'A file that fails is never lost silently: Retry, or Upload the original as it is.'],
  ],
})}
<div class="cmp2"><div><h4>What does not change</h4><ul>
<li>Files that follow the guidelines upload at once, with no question.</li>
<li>Core's upload does the work: media type from the extension, the folder's allowed types, its own placeholders.</li>
<li>The Media section's own window and the pickers on content pages are not checked. They are core's upload, which this does not touch.</li>
</ul></div><div><h4>What is new in the optimizer</h4><ul>
<li>It takes files and a folder, not only media items.</li>
<li>Convert can be limited to PNG photos.</li>
<li>Each file is uploaded through the Media Manager's upload as it finishes; a failure offers the original instead.</li>
</ul></div></div></section>`);

const html = K.page({
  title: 'Media guidelines on upload',
  lede: `${CSS}<p class="lede">Files dropped into the Media Manager are checked against the site's media guidelines: no more than 2560 px, no PNG photos, no recorded location. What follows them uploads at once; what does not is listed, and the ones you tick are optimized before they are uploaded. Same kit as <a href="../optimize-images/optimize-images-rework.html">the Optimize images mocks</a>.</p>`,
  decided: [
    'Three guidelines, each with a switch and its own fix: too many pixels, a PNG photo, a recorded location. No file size rule.',
    'Set once for the whole site in Desktop settings, under Add-ons, in the Media row. Only users with the Settings section can change them.',
    'Files are optimized before upload, in the browser, one at a time.',
    'Optimize opens the optimizer window with the files, not a silent background job.',
  ],
  sections,
  questions: [
    'U2: the warning inside the window you dropped on (B), or over the whole desktop (A)?',
    'Closing the warning: upload them as they are (my proposal), or upload none of the four?',
    'U3: may the settings be changed in the optimizer, or are they locked to the guidelines?',
    'U3: Convert limited to PNG photos, so a JPEG that only had a location keeps its format?',
    'U5: is Upload the original the right way out for a file that fails?',
  ],
});
const out = path.join(__dirname, '..', 'upload-guidelines.html');
fs.writeFileSync(out, html);
console.log('upload-guidelines.html', fs.statSync(out).size);
