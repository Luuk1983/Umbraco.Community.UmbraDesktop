// The Optimize images settings, reworked after the owner's first look (2026-10-25): an introduction that
// says what is being optimized and from where, one compact row per setting with its explanation behind
// an (i), the options of a switch that is off hidden, a warning before a run that will make files
// larger, and an end without a full progress bar. Writes ../optimize-images-rework.html.
const fs = require('fs');
const path = require('path');
const K = require('../../media-manager/_build/kit.cjs');

const { PRODUCTS, FOLDERS, byId, manager, scene, ic, win } = K;

const LEFT = { x: 24, y: 24, w: 880, h: 900 };
const RIGHT = { x: 920, y: 24, w: 656, h: 560 };
const RIGHT_TALL = { x: 920, y: 24, w: 656, h: 640 };

const ITEMS = [FOLDERS[2], ...PRODUCTS];
const SELECTED = ['design', 'knitted', 'banjo', 'jumpsuit', 'bowling', 'pingpong', 'unicorn', 'tattoo', 'biker'];
const state = Object.fromEntries(SELECTED.map((id) => [id, { selected: true }]));
const BULK = [['Move to'], ['Copy to', true], ['Optimize images', true], ['Trash']];
const PHOTOS = ['knitted', 'banjo', 'jumpsuit', 'bowling', 'pingpong', 'unicorn', 'tattoo', 'biker'];
const tasks = (...l) => l.map(([label, active, icon, progress, failed]) => ({ label, active, icon, progress, failed }));

/** The backoffice's icon-info (Lucide info), as its icon registry ships it. */
const INFO = (px) => `<svg class="uic" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;

/** The backoffice's icon-alert (Lucide triangle-alert), as its icon registry ships it. */
const ALERT = (px) => `<svg class="uic" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01"/></svg>`;

/** A switch. */
const sw = (on, locked) => `<span class="tg${on ? ' on' : ''}${locked ? ' locked' : ''}"><i></i></span>`;

/** An (i) button; pressed when its explanation shows. */
const info = (open) => `<span class="ib${open ? ' open' : ''}">${INFO(18)}</span>`;

/** A segmented control. */
const seg = (opts, on, cls = '') => `<span class="seg ${cls}">${opts.map((o) => `<span${o === on ? ' class="on"' : ''}>${o}</span>`).join('')}</span>`;

/** A number field. */
const num = (v, cls = '') => `<span class="in ${cls}">${v}</span>`;

/**
 * The introduction: what is optimized and from where, with the pictures themselves, so the window says
 * what it is about before any setting.
 */
function intro(o = {}) {
  const thumbs = PHOTOS.slice(0, 7).map((id) => `<span class="it th-${id}"></span>`).join('');
  return `<div class="intro">
<div class="from">${ic('folder', 16)}<span>Media <span class="sep">/</span> <b>Products</b></span></div>
<div class="ih"><b>Optimize 8 images</b></div>
<div class="strip">${thumbs}<span class="more">+1</span></div>
<div class="skip">${`<span class="ii">${INFO(15)}</span>`}<span>${o.skip ?? '1 folder in the selection is left out.'}</span></div>
</div>`;
}

/** One setting's row: switch, name, its options on the same line, and the (i). */
function row({ on, locked, name, opts = '', summary = '', open, hint }) {
  return `<div class="sr${on ? ' on' : ''}">
<div class="sl">${sw(on, locked)}<b>${name}</b></div>
<div class="so">${on ? opts : `<span class="sum">${summary}</span>`}</div>
${info(open)}
</div>${open ? `<div class="ex">${hint}</div>` : ''}`;
}

/** The settings, variant A: compact rows on one surface. */
function settingsA(o = {}) {
  const resize = o.resize ?? true;
  const convert = o.convert ?? true;
  const format = o.format ?? 'WebP';
  const locked = resize || convert;
  const quality = format === 'PNG' ? '' : `<span class="at">at</span>${num(o.quality ?? 80, 'q')}`;
  const rows = [
    row({
      on: resize,
      name: 'Resize',
      opts: `<span class="lbl">to fit</span>${num(2560)}<span class="x">×</span>${num(2560)}<span class="u">px</span>`,
      summary: 'Sizes stay as they are',
      open: o.open === 'resize',
      hint: 'Never made larger: an image already inside the box keeps its size. The focal point and crops are kept.',
    }),
    row({
      on: convert,
      name: 'Convert',
      opts: `<span class="lbl">to</span>${seg(['Keep', 'JPEG', 'PNG', 'WebP'], format)}${quality}`,
      summary: 'Each file keeps its format',
      open: o.open === 'convert',
      hint: 'The file keeps its name with the new extension. Pages that use the image keep working.',
    }),
    row({
      on: true,
      locked,
      name: 'Remove metadata',
      opts: `<span class="sum">${locked ? 'Always, when resizing or converting' : 'Location, camera and date'}</span>`,
      open: o.open === 'metadata',
      hint: locked
        ? 'Resizing or converting saves the picture anew, which leaves the location, camera and date behind anyway.'
        : 'Removed from the file without saving the picture anew, so the quality stays exactly the same.',
    }),
  ].join('');
  const warn = o.warn
    ? `<div class="warn">${ALERT(16)}<span>${o.warn}</span></div>`
    : '';
  const used = o.copies ? '' : `<div class="note">${`<span class="ii">${INFO(15)}</span>`}<span>4 of these images are used in 11 places. Replacing changes them everywhere.</span></div>`;
  return `<div class="rw">
${intro(o)}
<div class="rows">${rows}</div>
<div class="svr"><b>Save</b>${seg(['Replace the originals', 'Save copies next to them'], o.copies ? 'Save copies next to them' : 'Replace the originals', 'wide')}${info(false)}</div>
${used}
${warn}
<div class="of"><span class="dbtn">Cancel</span><span class="dbtn positive">Optimize 8 images</span></div>
</div>`;
}

/**
 * The settings, second pass (owner, 2026-10-25): what to do to the images and where the result goes
 * as two separate sections; a switch per change with a name that says what it does; once on, one
 * setting per line, its label on the left and its field on the right, the labels one column across
 * every group so the page reads as a whole; the quality slider back; Save as a radio list.
 */
function settingsC(o = {}) {
  const resize = o.resize ?? true;
  const convert = o.convert ?? true;
  const format = o.format ?? 'WebP';
  const locked = resize || convert;
  const line = (label, field) => `<div class="fl"><span class="fk">${label}</span><span class="fv">${field}</span></div>`;
  const group = ({ on, locked: lock, name, fields = '', open, hint }) => `<div class="cg${on ? ' on' : ''}">
<div class="ch">${sw(on, lock)}<b>${name}</b>${info(open)}</div>
${open ? `<div class="ex2">${hint}</div>` : ''}
${on && fields ? `<div class="cf">${fields}</div>` : ''}
</div>`;
  const quality = `<span class="slider${format === 'PNG' ? ' off' : ''}"><span style="width:${o.quality ?? 80}%"></span><i style="left:${o.quality ?? 80}%"></i></span>${num(o.quality ?? 80, `q${format === 'PNG' ? ' off' : ''}`)}`;
  const groups = [
    group({
      on: resize,
      name: 'Resize to a maximum width or height',
      open: o.open === 'resize',
      hint: 'Never made larger: an image already inside the box keeps its size. Leave a field empty for no limit on that side. The focal point and crops are kept.',
      fields: line('Max width', `${num(2560)}<span class="u">px</span>`) + line('Max height', `${num(2560)}<span class="u">px</span>`),
    }),
    group({
      on: convert,
      name: 'Convert to another format or quality',
      open: o.open === 'convert',
      hint: 'Keep writes each file in its own format. The file keeps its name with the new extension, and pages that use the image keep working.',
      fields: line('Format', seg(['Keep', 'JPEG', 'PNG', 'WebP'], format)) + line('Quality', quality),
    }),
    group({
      on: true,
      locked,
      name: 'Remove location, camera and date',
      open: o.open === 'metadata',
      hint: locked
        ? 'Always removed when an image is resized or converted, because the picture is saved anew.'
        : 'Removed from the file without saving the picture anew, so the quality stays exactly the same.',
    }),
  ].join('');
  const warn = o.warn ? `<div class="warn">${ALERT(16)}<span>${o.warn}</span></div>` : '';
  const radio = (on, label, hint, extra = '') => `<div class="rd${on ? ' on' : ''}"><span class="rb"></span><div><span>${label}</span>${hint ? `<small>${hint}</small>` : ''}${extra}</div></div>`;
  const used = `<div class="note in-rd"><span class="ii">${INFO(15)}</span><span>4 of these images are used in 11 places. Replacing changes them everywhere. <a class="lnk">Show where</a></span></div>`;
  return `<div class="rw">
${intro(o)}
<div class="sect"><div class="st">What to do</div>${groups}${warn}</div>
<div class="sect save2"><div class="st">Where the result goes</div>
${radio(!o.copies, 'Replace the originals', 'Same media items, a new file in each.', o.copies ? '' : used)}
${radio(!!o.copies, 'Save copies next to them', 'Named like the original with "(optimized)", in the same folder.')}
</div>
<div class="of"><span class="dbtn">Cancel</span><span class="dbtn positive">Optimize 8 images</span></div>
</div>`;
}

/**
 * Where the images are used (R6): one section per image that is used anywhere, each with Umbraco's own
 * references list under it, the one its trash and delete questions show, so nothing here is new to an
 * editor. Opened from Show where in the replace note; the lists load when it opens.
 */
function whereUsed() {
  const USES = [
    ['banjo', 'Banjo', [['file', 'Home', 'Document · Website'], ['file', 'Instruments', 'Document · Shop / Music'], ['image', 'Summer sale', 'Media · Banners']]],
    ['bowling', 'Bowling Ball', [['file', 'Sports', 'Document · Shop'], ['file', 'Bowling night', 'Document · Events / 2026'], ['file', 'Gift ideas', 'Document · Blog'], ['file', 'Newsletter October', 'Document · Newsletters']]],
    ['tattoo', 'Tattoo', [['file', 'About us', 'Document · Website'], ['file', 'Team', 'Document · Website / About us']]],
    ['pingpong', 'Ping Pong Ball', [['file', 'Sports', 'Document · Shop'], ['file', 'Office games', 'Document · Blog']]],
  ];
  const sections = USES.map(([id, name, refs]) => `<div class="wu-s"><div class="wu-h"><span class="tth th-${id}"></span><b>${name}</b><small>Used in ${refs.length} places</small></div>
<div class="wu-l">${refs.map(([icon, ref, detail]) => `<div class="wu-r">${ic(icon, 18)}<span><b>${ref}</b><small>${detail}</small></span></div>`).join('')}</div></div>`).join('');
  return `<div class="scrim"></div><div class="wu">
<div class="wu-t"><b>Where these images are used</b><small>4 of the 8 images, in 11 places. Replacing changes the picture in every one of them.</small></div>
<div class="wu-b">${sections}</div>
<div class="wu-f"><span class="dbtn">Close</span></div>
</div>`;
}

/** The settings, variant B: each switch a box of its own, opened when on, like Desktop settings. */
function settingsB() {
  const box = (on, name, body, locked) => `<div class="bx${on ? ' on' : ''}"><div class="bh">${sw(on, locked)}<b>${name}</b>${info(false)}</div>${on && body ? `<div class="bb">${body}</div>` : ''}</div>`;
  return `<div class="rw">
${intro()}
<div class="boxes">
${box(true, 'Resize', `<span class="lbl">Fit inside</span>${num(2560)}<span class="x">×</span>${num(2560)}<span class="u">px</span>`)}
${box(true, 'Convert', `<span class="lbl">To</span>${seg(['Keep', 'JPEG', 'PNG', 'WebP'], 'WebP')}<span class="at">at</span>${num(80, 'q')}`)}
${box(true, 'Remove metadata', '', true)}
${box(false, 'Save copies instead of replacing', '')}
</div>
<div class="note">${`<span class="ii">${INFO(15)}</span>`}<span>4 of these images are used in 11 places. Replacing changes them everywhere.</span></div>
<div class="of"><span class="dbtn">Cancel</span><span class="dbtn positive">Optimize 8 images</span></div>
</div>`;
}

/** A finished run's head, without the full bar: a result line instead. */
function ended(o) {
  const rows = o.rows
    .map(([id, name, before, after, change, grew]) => `<div class="jr"><span class="tth th-${id}"></span><span class="tnm"><b>${name}</b><small>${before} <span class="ar">→</span> ${after}</small></span><span class="js ${grew ? 'grew' : 'ok'}">${ic(grew ? 'alert' : 'check', 15)}${change}</span></div>`)
    .join('');
  return `<div class="job">
<div class="jh"><span class="done ${o.grew ? 'grew' : ''}">${ic(o.grew ? 'alert' : 'check', 18)}</span><b>${o.title}</b><span class="tob"><span class="tbtn primary">Close</span></span></div>
<div class="jm ${o.grew ? 'grew' : ''}">${o.meta}</div>
<div class="jsets">${o.sets}</div>
<div class="jl">${rows}</div>
</div>`;
}

const CSS = `<style>
.rw { flex: 1; width: 100%; min-width: 0; height: 100%; display: flex; flex-direction: column; background: #fff; color: #303033; font-size: 14.5px; }
.intro { padding: 16px 24px 14px; background: #f6f7fb; border-bottom: 1px solid #e6e8f0; display: grid; gap: 8px; }
.from { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #515054; }
.from .sep { color: #a0a0a8; margin: 0 2px; }
.ih b { font-size: 18px; color: #1b264f; }
.strip { display: flex; gap: 6px; align-items: center; }
.strip .it { width: 52px; height: 39px; border-radius: 3px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px rgba(0,0,0,.08); }
.strip .more { font-size: 13px; color: #515054; padding-left: 4px; }
.skip { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #6b6b72; }
.rows { padding: 6px 0; }
.sr { display: grid; grid-template-columns: 190px 1fr 28px; align-items: center; gap: 10px; min-height: 46px; padding: 0 16px 0 24px; border-bottom: 1px solid #f0f0f2; }
.sl { display: flex; align-items: center; gap: 12px; }
.sl b { font-size: 14.5px; }
.sr:not(.on) .sl b { color: #6b6b72; font-weight: 700; }
.so { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sum { color: #8a8a90; font-size: 13.5px; }
.lbl, .at, .x, .u { color: #6b6b72; font-size: 13.5px; }
.tg { position: relative; flex: none; width: 34px; height: 20px; border-radius: 10px; background: #c9ccd8; }
.tg i { position: absolute; left: 3px; top: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; }
.tg.on { background: #3544b1; }
.tg.on i { left: 17px; }
.tg.locked { background: #9aa2d8; }
.in { display: inline-flex; align-items: center; width: 64px; height: 30px; padding: 0 8px; border: 1px solid #c2c2c2; border-radius: 3px; font-size: 13.5px; }
.in.q { width: 44px; }
.seg { display: inline-flex; border: 1px solid #c2c2c2; border-radius: 3px; overflow: hidden; font-size: 13px; }
.seg span { padding: 5px 10px; border-left: 1px solid #c2c2c2; }
.seg span:first-child { border-left: 0; }
.seg span.on { background: #3544b1; color: #fff; }
.seg.wide span { padding: 6px 12px; }
.ib { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; color: #6b6b72; justify-self: end; }
.ii { flex: none; display: inline-flex; margin-top: 1px; color: #3544b1; }
.ib.open { background: #e3e6f5; color: #3544b1; }
.uic { flex: none; display: block; }
.lnk { color: #3544b1; text-decoration: underline; font-weight: 700; margin-left: 4px; }
.ex { margin: -1px 0 0; padding: 8px 24px 10px 70px; background: #f6f7fb; border-bottom: 1px solid #f0f0f2; font-size: 13px; color: #515054; }
.svr { display: grid; grid-template-columns: 190px 1fr 28px; align-items: center; gap: 10px; min-height: 52px; padding: 0 16px 0 24px; }
.svr b { font-size: 14.5px; }
.note, .warn { display: flex; gap: 8px; align-items: flex-start; margin: 0 24px 8px; padding: 8px 10px; border-radius: 3px; font-size: 13.5px; }
.note { background: #f1f3fb; color: #3b4060; }
.note .ic { color: #3544b1; margin-top: 1px; }
.warn { background: #fff3e0; color: #6b4a00; }
.warn .ic { color: #c27c00; margin-top: 1px; }
.of { margin-top: auto; padding: 14px 24px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid #e9e9eb; }
.boxes { padding: 14px 24px 4px; display: grid; gap: 8px; }
.bx { border: 1px solid #e3e4ea; border-radius: 4px; }
.bh { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }
.bh b { flex: 1; }
.bx:not(.on) .bh b { color: #6b6b72; }
.bb { display: flex; align-items: center; gap: 8px; padding: 0 12px 12px 58px; }
.job { flex: 1; min-width: 0; height: 100%; padding: 18px 20px; background: #fff; display: flex; flex-direction: column; overflow: hidden; }
.jh { display: flex; align-items: center; gap: 10px; font-size: 16px; color: #1b264f; }
.jh b { flex: 1; }
.done { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; align-items: center; justify-content: center; background: #e5f3e8; color: #2e8540; }
.done.grew { background: #fff3e0; color: #c27c00; }
.jm { margin: 10px 0 0; font-size: 14px; font-weight: 700; color: #2e8540; }
.jm.grew { color: #9a6200; }
.jsets { font-size: 12.5px; color: #8a8a90; margin: 2px 0 12px; }
.jl { border-top: 1px solid #ececef; overflow: hidden; }
.jr { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0f0f2; font-size: 14px; }
.jr .tth { width: 48px; height: 36px; }
.jr .ar { color: #3544b1; font-weight: 700; }
.js { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; min-width: 80px; justify-content: flex-end; font-weight: 700; }
.js.ok { color: #2e8540; }
.js.grew { color: #c27c00; }
.cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 10px 0 0; font-size: 14px; }
.cmp div { background: #fff; border: 1px solid #e3e4ea; border-radius: 6px; padding: 12px 14px; }
.cmp h4 { margin: 0 0 6px; }
.cmp ul { margin: 0; padding-left: 18px; }
.sect { padding: 6px 0 10px; border-bottom: 1px solid #e6e8f0; }
.st { padding: 12px 24px 6px; font-size: 12.5px; font-weight: 700; color: #6b6b72; }
.cg { padding: 4px 0; }
.ch { display: grid; grid-template-columns: 34px 1fr 20px; align-items: center; gap: 12px; padding: 8px 16px 8px 24px; }
.ch b { font-size: 14.5px; }
.cg:not(.on) .ch b { color: #6b6b72; }
.cf { display: grid; gap: 8px; padding: 0 16px 8px 70px; }
.fl { display: grid; grid-template-columns: 96px 1fr; align-items: center; gap: 12px; }
.fk { color: #515054; font-size: 13.5px; }
.fv { display: flex; align-items: center; gap: 8px; }
.ex2 { margin: 0 16px 6px 70px; padding: 8px 10px; background: #f6f7fb; border-radius: 3px; font-size: 13px; color: #515054; }
.slider { position: relative; flex: 1; max-width: 240px; height: 4px; border-radius: 2px; background: #e3e6f5; }
.slider span { display: block; height: 100%; background: #3544b1; border-radius: 2px; }
.slider i { position: absolute; top: -7px; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: #fff; border: 2px solid #3544b1; }
.slider.off, .in.off { opacity: .4; }
.save2 { border-bottom: 0; }
.rd { display: flex; gap: 10px; align-items: flex-start; padding: 6px 24px; }
.rd small { display: block; color: #6b6b72; font-size: 13px; }
.rb { flex: none; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; border: 2px solid #8f8f93; }
.rd.on .rb { border-color: #3544b1; box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 9px #3544b1; }
.note.in-rd { margin: 8px 0 0; }
.sect .warn { margin: 6px 24px 4px; }
.wu { position: absolute; z-index: 86; left: 50%; top: 50%; width: 560px; max-height: 760px; transform: translate(-50%, -50%); display: flex; flex-direction: column; background: #fff; border-radius: 6px; box-shadow: 0 14px 40px rgba(0,0,0,.4); color: #303033; font-size: 14px; }
.wu-t { padding: 20px 24px 14px; border-bottom: 1px solid #e9e9eb; display: grid; gap: 4px; }
.wu-t b { font-size: 18px; color: #1b264f; }
.wu-t small { color: #6b6b72; font-size: 13.5px; }
.wu-b { padding: 8px 24px; overflow: hidden; }
.wu-s { padding: 10px 0; border-bottom: 1px solid #f0f0f2; }
.wu-h { display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 12px; }
.wu-h .tth { width: 48px; height: 36px; border-radius: 2px; }
.wu-h small { color: #6b6b72; font-size: 13px; }
.wu-l { margin: 8px 0 0 60px; border: 1px solid #e3e4ea; border-radius: 3px; }
.wu-r { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-top: 1px solid #f0f0f2; }
.wu-r:first-child { border-top: 0; }
.wu-r .ic { color: #6b6b72; }
.wu-r span { display: flex; flex-direction: column; }
.wu-r b { font-weight: 400; }
.wu-r small { color: #8a8a90; font-size: 12.5px; }
.wu-f { padding: 14px 24px; display: flex; justify-content: flex-end; border-top: 1px solid #e9e9eb; }
</style>`;

const left = manager({ ...LEFT, title: 'Products', current: 'products', items: ITEMS, state, selectionBar: '9 of 9 selected', bulk: BULK });
const leftIdle = manager({ ...LEFT, title: 'Products', current: 'products', items: ITEMS, state: {} });
const optimizeWin = (body, rect = RIGHT) => win({ ...rect, title: 'Optimize images: Products (8)', icon: 'image', active: true, body });
const sections = [];

const TALL = { x: 920, y: 24, w: 656, h: 900 };
sections.push(`<section class="sc"><h2>R5. Second pass: what to do, and where it goes</h2><p>After the owner's look at R1 (2026-10-25): what to do to the images and where the result goes are two sections; each switch says what it does; once on, one setting per line, labels on the left and fields on the right, in one column across the groups; the quality slider is back; Save is a radio list.</p>
${scene({
  id: 'r5',
  title: 'R5. On the defaults',
  wins: [left, optimizeWin(settingsC(), TALL)],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
  notes: [
    [1, 1590, 249, 'What to do: three switches, each named for what it does. Their settings sit under them, one per line.'],
    [2, 1590, 345, 'Labels in one column and fields in another, the same across Resize and Convert, so the page reads as one form.'],
    [3, 1590, 597, 'Where the result goes: its own section, a radio list. The used-elsewhere note sits under Replace, which it is about.'],
  ],
})}
${scene({
  id: 'r5b',
  title: 'R5B. Convert off, Resize with its (i) open: only what is on shows its settings',
  wins: [left, optimizeWin(settingsC({ convert: false, open: 'resize' }), TALL)],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
})}
${scene({
  id: 'r5c',
  title: 'R5C. PNG for photos, saving copies: the warning sits in What to do, where the cause is',
  wins: [left, optimizeWin(settingsC({ format: 'PNG', copies: true, warn: '<b>These 8 images will get much larger.</b> They are JPEG and WebP photos, and PNG keeps every pixel: expect 10 to 15 times their size. WebP or JPEG makes them smaller.' }), TALL)],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
  notes: [[1, null, null, 'Quality is drawn and greyed for PNG, which has none, so the line does not jump away and back as the format changes.']],
})}
${scene({
  id: 'r6',
  title: 'R6. Show where: the places that replacing changes',
  lede: 'Opened from Show where in the note under Replace the originals. One section per image that is used anywhere, with the references list Umbraco shows in its own trash question. The lists load when the dialog opens; the counts were already known.',
  wins: [left, optimizeWin(settingsC(), TALL)],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
  over: whereUsed(),
  notes: [
    [1, null, null, 'Read only for now: a place is not a link, because a link inside the desktop needs care not to navigate the whole backoffice away. Opening a page from here is a later step.'],
    [2, null, null, 'The icons throughout are icon-info and icon-alert from the backoffice icon set, as umb-icon draws them; a proper info popup for the desktop comes later as its own issue.'],
  ],
})}</section>`);

sections.push(`<section class="sc"><h2>R1. The settings, reworked</h2><p>What you asked for on the first look (2026-10-25): the window says what it is optimizing and from where before any setting; one row per setting, its options on the same line; the explanation behind the (i); the options of a switch that is off hidden, with one muted line saying what happens instead.</p>
${scene({
  id: 'r1',
  title: 'R1. Variant A: compact rows, on the defaults',
  wins: [left, optimizeWin(settingsA())],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
  notes: [
    [1, 1090, 80, 'The introduction: where the images come from, how many, the pictures themselves, and what is left out.'],
    [2, 1540, 253, 'The (i) opens the explanation under its row, and closes it again. It works by touch, unlike a tooltip.'],
    [3, null, null, 'Remove metadata is on and locked while Resize or Convert is on; its row says why in a few words instead of a paragraph.'],
    [4, null, null, 'Save is one control with two choices. The used-elsewhere note shows only for Replace.'],
    [5, null, null, 'The window gets about 200 px shorter: 560 high instead of 760.'],
  ],
})}
${scene({
  id: 'r2',
  title: 'R2. Variant A: Resize on with its (i) open, Convert off, so metadata is its own choice',
  wins: [left, optimizeWin(settingsA({ convert: false, open: 'resize' }), RIGHT_TALL)],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
  notes: [[1, null, null, 'A switch that is off shows one muted line, "Each file keeps its format", instead of its greyed options.']],
})}
${scene({
  id: 'r2b',
  title: 'R2B. Variant B: a box per switch, opened when on, as in Desktop settings',
  wins: [left, optimizeWin(settingsB(), RIGHT_TALL)],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
  notes: [[1, null, null, 'Save copies becomes a fourth switch, off for Replace. Tidier still, but "off" meaning "replace" is less obvious than naming both choices.']],
})}</section>`);

sections.push(`<section class="sc"><h2>R3. A warning before a run that will make files larger</h2><p>The first real run you did converted WebP to PNG and grew every image fifteen times. The settings already know every file's format before the run, so the warning can come before you press the button, and say how many images it is about.</p>
${scene({
  id: 'r3',
  title: 'R3. PNG chosen for photos',
  wins: [left, optimizeWin(settingsA({ format: 'PNG', warn: '<b>These 8 images will get much larger.</b> They are JPEG and WebP photos, and PNG keeps every pixel: expect 10 to 15 times their size. WebP or JPEG makes them smaller.' }), RIGHT_TALL)],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
})}
<div class="cmp"><div><h4>When it warns</h4><ul>
<li>Convert to PNG, and some files are JPEG or WebP: "will get much larger", with the count. Measured: 13 to 16 times.</li>
<li>Quality 95 or more for JPEG or WebP: "can come out larger than they are now". Near-lossless settings often beat a camera's own compression.</li>
<li>Resize off, Convert to JPEG on WebP files: "may get larger". JPEG is less efficient than WebP at the same quality.</li>
</ul></div><div><h4>When it does not</h4><ul>
<li>Anything that resizes a photo down, in any format: it shrinks.</li>
<li>PNG to WebP or JPEG, or Keep: never larger in practice.</li>
<li>Metadata only: a few hundred bytes smaller, always.</li>
</ul><p>The row's percentage after the run stays as it is: the warning is the before, the orange percentage the after.</p></div></div></section>`);

sections.push(`<section class="sc"><h2>R4. The end, without a full progress bar</h2><p>A full bar at the end looks like the run is still finishing. The bar is there only while it runs; at the end, a result line with a tick (or the warning colour when the images grew) takes its place.</p>
${scene({
  id: 'r4',
  title: 'R4. Finished, and it grew',
  wins: [
    leftIdle,
    win({
      ...RIGHT,
      title: 'Optimize images: Products (3)',
      icon: 'image',
      active: true,
      body: ended({
        title: '3 optimized',
        grew: true,
        meta: '22.5 MB larger than before',
        sets: 'PNG · metadata removed · saving copies',
        rows: [
          ['banjo', 'Banjo', '2560 × 1707 WebP, 621 KB', '2560 × 1707 PNG, 8.7 MB', '+1300%', true],
          ['tattoo', 'Tattoo', '2560 × 1707 WebP, 438 KB', '2560 × 1707 PNG, 7.4 MB', '+1593%', true],
          ['bowling', 'Bowling Ball', '2560 × 1707 WebP, 510 KB', '2560 × 1707 PNG, 8 MB', '+1466%', true],
        ],
      }),
    }),
  ],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
})}
${scene({
  id: 'r4b',
  title: 'R4B. Finished, as it should',
  wins: [
    leftIdle,
    win({
      ...RIGHT,
      title: 'Optimize images: Products (3)',
      icon: 'image',
      active: true,
      body: ended({
        title: '3 optimized',
        meta: '24.9 MB saved, 96% of what they were',
        sets: 'Resize to 2560 × 2560 · WebP at 80 · metadata removed · replacing the originals',
        rows: [
          ['banjo', 'Banjo', '6000 × 4000 JPEG, 13.2 MB', '2560 × 1707 WebP, 621 KB', '−95%'],
          ['tattoo', 'Tattoo', '6000 × 4000 JPEG, 12.2 MB', '2560 × 1707 WebP, 438 KB', '−96%'],
          ['bowling', 'Bowling Ball', '6000 × 4000 JPEG, 12.8 MB', '2560 × 1707 WebP, 510 KB', '−96%'],
        ],
      }),
    }),
  ],
  tasks: tasks(['Products'], ['Optimize images', true, 'image']),
})}</section>`);

const html = K.page({
  title: 'Optimize images: the settings reworked (#139)',
  lede: `${CSS}<p class="lede">A second pass at the Optimize images window after the owner's first real look (2026-10-25). Same kit and theme as <a href="optimize-images.html">the first mocks</a>; only the window changes.</p>`,
  sections,
  questions: [
    'R5: are the two sections, the names of the switches and the aligned labels what you meant?',
    'Save as a radio list (R5), as you suggested, rather than the segmented control of R1?',
    'R6: is the Show where dialog what you meant, read only for now?',
    'Is the introduction right: folder path, count, a strip of the pictures, and what is left out?',
    'The (i) opens the explanation under its row (R2). Did you mean a different (i) we already have?',
    'Warn in the three cases of R3, or only for PNG?',
  ],
});
fs.writeFileSync(path.join(__dirname, '..', 'optimize-images-rework.html'), html);
console.log('optimize-images-rework.html', fs.statSync(path.join(__dirname, '..', 'optimize-images-rework.html')).size);
