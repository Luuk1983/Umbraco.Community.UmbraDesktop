// Screenshots every scene of ../image-editor.html into shots/, to check the mock before sending it.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { withPage } = require('./browser.cjs');

fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
withPage(async (page) => {
  await page.goto(pathToFileURL(path.join(__dirname, '..', process.argv[2] ?? 'image-editor.html')).href, { waitUntil: 'load' });
  for (const id of await page.$$eval('figure.scene', (fs) => fs.map((f) => f.id))) {
    const el = await page.$(`#${id} .screen, #${id} .tscreen`);
    await el.screenshot({ path: path.join(__dirname, 'shots', `${id}.png`) });
  }
  console.log('done');
}, { width: 1300, height: 1000 });
