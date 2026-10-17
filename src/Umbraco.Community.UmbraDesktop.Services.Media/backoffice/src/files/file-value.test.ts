import { expect } from '@open-wc/testing';
import { fileValueFor } from './file-value.js';

/**
 * The `umbracoFile` value an overwrite saves. A save that reframed the picture (a crop, a rotate, a
 * flip) resets the focal point and the named crops, because their fractions now point at other
 * pixels; any other save keeps them. Issue #136, design D8.
 */

/** An image's value as the image cropper stores it, with a focal point and one named crop. */
const value = {
  src: '/media/a/beach.jpg',
  focalPoint: { left: 0.3, top: 0.6 },
  crops: [{ alias: 'hero', width: 1600, height: 900, coordinates: { x1: 0.1, y1: 0.2, x2: 0.1, y2: 0.2 } }],
};

it('keeps the focal point and every crop when the picture was not reframed', () => {
  expect(fileValueFor(value, 't1', false)).to.deep.equal({ ...value, temporaryFileId: 't1' });
});

it("drops the focal point and every crop's coordinates, keeping the crops themselves", () => {
  expect(fileValueFor(value, 't1', true)).to.deep.equal({
    src: value.src,
    temporaryFileId: 't1',
    focalPoint: null,
    crops: [{ alias: 'hero', width: 1600, height: 900, coordinates: null }],
  });
});

it('treats a value with no crops or no value at all as empty', () => {
  expect(fileValueFor(null, 't1', true)).to.deep.equal({ temporaryFileId: 't1', focalPoint: null, crops: [] });
  expect(fileValueFor({ src: '/x.png' }, 't1', true)).to.deep.equal({
    src: '/x.png',
    temporaryFileId: 't1',
    focalPoint: null,
    crops: [],
  });
  expect(fileValueFor(null, 't1', false)).to.deep.equal({ temporaryFileId: 't1' });
});

it('never changes the value it was given', () => {
  const before = JSON.stringify(value);
  fileValueFor(value, 't1', true);
  expect(JSON.stringify(value)).to.equal(before);
});
