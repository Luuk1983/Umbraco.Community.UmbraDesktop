// Headless Edge helpers for the mock build. sharp and puppeteer's launcher do not load in this
// checkout, so everything goes through Edge's own command line: --dump-dom to run a page's script
// and read its result, --screenshot to check what a mock looks like.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// A short profile path: a long one overflows MAX_PATH and Edge hangs.
const PROFILE = path.join(os.tmpdir(), 'ppmm');

/** Runs `html`, which must put its result in <pre id="out">, and returns that text. */
function runPage(html) {
  const tmp = path.join(os.tmpdir(), 'mm-run.html');
  fs.writeFileSync(tmp, html);
  const dom = execFileSync(
    EDGE,
    ['--headless', '--disable-gpu', `--user-data-dir=${PROFILE}`, '--virtual-time-budget=15000', '--dump-dom', pathToFileURL(tmp).href],
    { maxBuffer: 1 << 29 },
  ).toString();
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!m) throw new Error('no output: ' + dom.slice(0, 400));
  return m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Screenshots `file` at `w`x`h` into `out`. */
function screenshot(file, out, w = 1600, h = 1000) {
  execFileSync(EDGE, [
    '--headless', '--disable-gpu', `--user-data-dir=${PROFILE}`, '--hide-scrollbars',
    `--window-size=${w},${h}`, `--screenshot=${path.resolve(out)}`, '--virtual-time-budget=5000', pathToFileURL(path.resolve(file)).href,
  ]);
}

module.exports = { runPage, screenshot };
