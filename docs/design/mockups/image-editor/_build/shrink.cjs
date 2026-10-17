// Shrinks the test instance's photos for the mocks with a canvas in headless Chrome (sharp does not
// load in this checkout). Usage: node shrink.cjs <source> <name> <width> [quality]
const fs = require('fs');
const path = require('path');
const { withPage } = require('./browser.cjs');

const [src, name, width, quality = '0.82'] = process.argv.slice(2);
const data = fs.readFileSync(src).toString('base64');
withPage(async (page) => {
  const url = await page.evaluate(async (data, w, q) => {
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((img.height * w) / img.width);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }, data, Number(width), Number(quality));
  fs.writeFileSync(path.join(__dirname, 'img', name), Buffer.from(url.split(',')[1], 'base64'));
  console.log(name, fs.statSync(path.join(__dirname, 'img', name)).size);
});
