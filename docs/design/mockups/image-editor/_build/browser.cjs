// Headless Chrome for the image editor mocks, through the Accessories project's own puppeteer-core and
// chrome-launcher. Headless Edge's --dump-dom returns nothing on this machine any more.
const path = require('path');
const { createRequire } = require('module');

const host = createRequire(path.resolve(__dirname, '../../../../../src/Umbraco.Community.UmbraDesktop.Accessories/package.json'));
const puppeteer = host('puppeteer-core');
const { Launcher } = host('chrome-launcher');

/** Runs `work(page)` in a fresh headless Chrome, and closes it after. */
async function withPage(work, viewport = { width: 1600, height: 1000 }) {
  const browser = await puppeteer.launch({ executablePath: Launcher.getInstallations()[0], headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    return await work(page);
  } finally {
    await browser.close();
  }
}

module.exports = { withPage };
