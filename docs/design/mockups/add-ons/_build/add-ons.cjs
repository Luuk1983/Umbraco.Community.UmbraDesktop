// Builds ../add-ons.html: the Add-ons app as static stills, from live Umbraco Marketplace data.
//
// Run with `node docs/design/mockups/add-ons/_build/add-ons.cjs` from the repository root. It needs
// the internet, because the point of the mock is that every title, description, version, download
// count and caption on it is what the Marketplace API returns today. The screenshots are the repo's
// own files, shrunk into ./img, because the side panel shows a snapshot and runs no scripts.

const fs = require('fs');
const path = require('path');

const API = 'https://api.marketplace.umbraco.com/api/v1/packages';
const SITE_MAJOR = 17;
const img = (f) => {
  const b = fs.readFileSync(path.join(__dirname, 'img', f));
  return `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,${b.toString('base64')}`;
};
/** Images used more than once go in the stylesheet once, by class, to keep the file under the side panel's 512 KB. */
const bgCss = new Map();
const bg = (f) => {
  const cls = 'bg-' + f.replace(/\W/g, '-');
  if (!bgCss.has(cls)) bgCss.set(cls, `.${cls}{background-image:url(${img(f)})}`);
  return cls;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Screenshot files by the file name the Marketplace's sourceUrl ends in. */
const SHOTS = {
  'entertainment-games.png': 'ent-games.jpg',
  'umbracoffee-live.png': 'ent-coffee.jpg',
  'arcade-overview.png': 'ent-arcade.jpg',
  'accessories-desktop.png': 'acc-desktop.jpg',
};

/** The first paragraphs of the README the Marketplace renders, as plain text. */
function readmeParagraphs(html, n) {
  return [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .map((t) => t.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'))
    .filter((t) => t.length > 60)
    .slice(0, n);
}

async function main() {
  const list = await (await fetch(`${API}?tags=umbradesktop&pageSize=50`)).json();
  const pkgs = [];
  for (const r of list.results) {
    pkgs.push(await (await fetch(`${API}/${r.packageId}`)).json());
  }
  const byId = Object.fromEntries(pkgs.map((p) => [p.packageId.split('.').pop(), p]));
  const ent = byId.Entertainment;
  const acc = byId.Accessories;
  const icon = img('icon.png');

  /** What the mock pretends is installed on this site. */
  const installed = { Accessories: '17.4.0' };
  const short = (p) => p.packageId.split('.').pop();
  const shotsOf = (p) =>
    p.screenshots
      .map((s) => ({ file: SHOTS[s.sourceUrl.split('/').pop()], caption: s.caption }))
      .filter((s) => s.file);
  const versionFor = (p) =>
    (p.versionDetails.find((v) => v.umbracoVersionNumber.startsWith(`${SITE_MAJOR}.`)) || {})
      .latestPackageVersionNumber || p.latestVersionNumber;

  const chip = (p) =>
    installed[short(p)]
      ? `<span class="chip ok">Installed</span>`
      : `<span class="chip">Not installed</span>`;

  /**
   * One card. `cover` is an image, or null for the fallback: the icon on the colour the Marketplace
   * reports as the icon's dominant one. `look` picks how the card says it can be clicked.
   */
  const card = (p, { cover, look = 'details', hovered = false, iconClass = 'icon' } = {}) => {
    const coverHtml = cover
      ? `<div class="cover"><div class="bgimg ${bg(cover)}"></div></div>`
      : `<div class="cover fallback" style="background:${p.iconDominantColor}"><span class="${iconClass} huge"></span></div>`;
    const action =
      look === 'button' ? `<button>View</button>` : look === 'details' ? `<span class="details">Details ›</span>` : '';
    return `<article class="card${hovered ? ' hovered' : ''}">
      ${coverHtml}
      <div class="card-body">
        <div class="name"><span class="${iconClass}"></span><div><b class="title">${esc(p.title)}</b><small>by ${esc(p.authors)}</small></div></div>
        <p class="clamp">${esc(p.description)}</p>
        <div class="card-foot">${chip(p)}${action}</div>
      </div>
    </article>`;
  };

  /** A made-up community add-on, only to show where third parties land and the fallback cover. */
  const example = {
    packageId: 'Example.UmbraDesktop.Kanban',
    title: 'Example: a community add-on',
    authors: 'someone in the community',
    description: 'Made up for this mock. A third-party add-on with no screenshots in its marketplace file, so its card falls back to its icon on its dominant colour.',
    iconDominantColor: '#6b3fa0',
  };

  const row = (p, withIcon = true) => `<div class="row">
      ${withIcon ? `<span class="icon"></span>` : ''}
      <div class="row-text"><b>${esc(p.title)}</b><small>by ${esc(p.authors)}</small><p class="clamp1">${esc(p.description)}</p></div>
      ${chip(p)}<span class="chev">›</span>
    </div>`;

  const addYourOwn = `<div class="own">
      <b>Made something for UmbraDesktop?</b>
      <p>List it on the Umbraco Marketplace and add <code>umbradesktop</code> to the Tags in your
      <code>umbraco-marketplace.json</code>. It shows up here within a day.</p>
      <a>How to build and list an add-on</a>
    </div>`;

  const sourceLine = `<p class="source">From the Umbraco Marketplace. Showing add-ons for Umbraco ${SITE_MAJOR}.</p>`;

  const frame = (title, body) => `<div class="win">
      <div class="titlebar"><span>${title}</span><span class="ctl">— ▢ ✕</span></div>
      <div class="win-body">${body}</div>
    </div>`;

  const listHead = `<div class="list-head"><h1>Add-ons</h1>
      <p>Extra apps for your desktop. Adding one is a change to the site's code, so it is a job for
      whoever builds your site: each add-on says what to send them.</p></div>`;

  const cover = (p) => shotsOf(p)[0].file;
  const team = `<h2 class="group">From the UmbraDesktop team</h2>
      <div class="grid">${card(ent, { cover: cover(ent) })}${card(acc, { cover: cover(acc) })}</div>`;
  const community = (cards) => `<h2 class="group">From the community</h2>
      ${cards ? `<div class="grid">${cards}</div>` : ''}`;

  const listSplit = frame('Add-ons', `${listHead}${team}
      ${community(card(example, { iconClass: 'icon ex' }))}${addYourOwn}${sourceLine}`);
  const listSplitEmpty = frame('Add-ons', `${listHead}${team}
      <h2 class="group">From the community</h2>
      <div class="own"><b>None for Umbraco ${SITE_MAJOR} yet.</b>
      <p>Made something for UmbraDesktop? List it on the Umbraco Marketplace and add <code>umbradesktop</code>
      to the Tags in your <code>umbraco-marketplace.json</code>. It shows up here within a day.</p>
      <a>How to build and list an add-on</a></div>${sourceLine}`);

  const affordances = `<div class="aff">
      <div><span class="tag">Chosen: a permanent "Details" link</span><div class="grid1">${card(ent, { cover: cover(ent), look: 'details' })}</div></div>
    </div>`;

  const facts = (p) => `<div class="facts">
      <span>Version ${esc(versionFor(p))}</span><span>Umbraco ${p.umbracoMajorVersionsSupported.join(', ')}</span>
      <span>${esc(p.licenseTypes.join(', '))}</span><span>${p.numberOfNuGetDownloads.toLocaleString('en-US')} downloads</span>
    </div>`;

  const links = (p) => `<div class="links">
      <a>View on the Umbraco Marketplace ↗</a><a>Documentation ↗</a><a>Report an issue ↗</a>
    </div>`;

  const getIt = (p) => `<div class="panel">
      <h3>Not on this site yet</h3>
      <p>Send this to whoever builds your site. After they deploy it, its apps appear in your launcher.</p>
      <div class="cmd"><code>dotnet add package ${esc(p.packageId)} --version ${esc(versionFor(p))}</code><button>Copy</button></div>
      <p class="muted small">The version is the newest one that runs on Umbraco ${SITE_MAJOR}, which this site uses.</p>
    </div>`;

  const haveIt = (p) => `<div class="panel ok-panel">
      <h3><span class="dot"></span>Installed, version ${esc(installed[short(p)])}</h3>
      <p>Its apps are in your launcher. You are on the newest version for Umbraco ${SITE_MAJOR}.</p>
      <button class="primary">Open its guide in Help</button>
    </div>`;

  const detail = (p, side) => {
    const shots = shotsOf(p);
    const [main, ...rest] = shots;
    return frame(`Add-ons`, `<a class="back">‹ All add-ons</a>
      <div class="detail-head"><span class="icon big"></span>
        <div><h1>${esc(p.title)}</h1><small>by ${esc(p.authors)}</small>${facts(p)}</div></div>
      <div class="detail">
        <div class="main-col">
          <figure class="shot"><img src="${img(main.file)}" alt=""><figcaption>${esc(main.caption)}</figcaption></figure>
          ${rest.length ? `<div class="thumbs">${rest.map((s) => `<figure><img src="${img(s.file)}" alt=""><figcaption>${esc(s.caption)}</figcaption></figure>`).join('')}</div>` : ''}
          <h3>About</h3>
          ${readmeParagraphs(p.readMeContent, 2).map((t) => `<p>${esc(t)}</p>`).join('')}
          <p class="muted small">The full README from the Marketplace continues here.</p>
        </div>
        <div class="side-col">${side(p)}${links(p)}</div>
      </div>`);
  };

  const states = `<div class="states">
      <div class="panel ok-panel"><h3><span class="dot"></span>Installed, version 17.4.0</h3><p>Up to date for Umbraco 17.</p></div>
      <div class="panel warn-panel"><h3><span class="dot"></span>Update available</h3><p>Installed 17.3.0, newest for Umbraco 17 is 17.4.0.</p>
        <div class="cmd"><code>dotnet add package … --version 17.4.0</code><button>Copy</button></div></div>
      <div class="panel"><h3>Not on this site yet</h3><p>The install line to send on.</p>
        <div class="cmd"><code>dotnet add package … --version 17.4.0</code><button>Copy</button></div></div>
    </div>`;

  const teamOffline = `<h2 class="group">From the UmbraDesktop team</h2>
      <div class="grid">${card(ent)}${card(acc)}</div>`;
  const offline = frame('Add-ons', `${listHead}${teamOffline}
      <h2 class="group">From the community</h2>
      <div class="notice">The Umbraco Marketplace can't be reached from here, so community add-ons can't be
      shown. <a>Try again</a></div>${addYourOwn}`);

  const coverRules = `<div class="rules">
      <div class="rule"><div class="grid1">${card(ent, { cover: cover(ent), look: 'details' })}</div>
        <p><b>The first screenshot, for every add-on.</b> The Marketplace has no main image, but the
        <code>Screenshots</code> list in <code>umbraco-marketplace.json</code> keeps its order, so the first one is
        the cover, filled into a 16:9 frame from the top. Ours follow the same rule: we pick our covers by
        ordering our own marketplace files. The "add your own" docs tell authors so.</p></div>
      <div class="rule"><div class="grid1">${card(example, { iconClass: 'icon ex' })}</div>
        <p><b>No screenshots: the icon on its colour.</b> The Marketplace already works out each icon's dominant
        colour (<code>iconDominantColor</code>), so a card is never an empty grey box. Offline, every card looks
        like this, ours included.</p></div>
    </div>`;

  const css = fs.readFileSync(path.join(__dirname, 'add-ons.css'), 'utf8');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Add-ons app</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}${[...bgCss.values()].join('')}.icon{background:url(${icon}) center/cover}</style></head><body><main>
<header class="intro"><h2>The Add-ons app</h2>
<p>Stills for the add-on library. Every title, description, version, download count, caption and README line
is what the Umbraco Marketplace API returned on ${new Date().toISOString().slice(0, 10)} for packages tagged
<code>umbradesktop</code>. The mock pretends Accessories is installed and Entertainment is not.</p></header>

<section><h3>1. The list: ours first, then the community's</h3>
<p class="subtitle">Left: with one community add-on (made up, so you can see where it lands). Right: with none yet, which is today, where the invitation takes its place. Only add-ons that run on this site's Umbraco are listed.</p>
<div class="pair"><div>${listSplit}</div><div>${listSplitEmpty}</div></div></section>

<section><h3>2. Saying the card can be clicked</h3>
<p class="subtitle">The whole card opens the details. A "Details" link, always there, says so; no hover effect is needed for it.</p>
${affordances}</section>

<section><h3>3. Where the cover comes from</h3>
${coverRules}</section>

<section><h3>4. An add-on you don't have</h3>
<p class="subtitle">Screenshots and captions from its marketplace file, the README under About, and the install line to send on, pinned to the newest version for this site's Umbraco.</p>
${detail(ent, getIt)}</section>

<section><h3>5. An add-on you have</h3>
<p class="subtitle">The same page. The install line gives way to where to find it.</p>
${detail(acc, haveIt)}</section>

<section><h3>6. The three states of that side panel</h3>
${states}</section>

<section><h3>7. When the Marketplace can't be reached</h3>
<p class="subtitle">A built-in list of our own add-ons, with icons for covers since the screenshots come through the Marketplace too. The community part says why it is empty.</p>
${offline}</section>
</main></body></html>`;
  const out = path.join(__dirname, '..', 'add-ons.html');
  fs.writeFileSync(out, html);
  console.log(out, Math.round(html.length / 1024), 'KB');
}

main();
