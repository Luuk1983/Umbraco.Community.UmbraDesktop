import { expect } from '@open-wc/testing';
import {
  DEFAULT_QUALITY,
  addressChanges,
  copyNameFor,
  extensionFor,
  formatBytes,
  formatLabel,
  keepFormatFor,
  mimeFor,
} from './formats.js';

/**
 * The formats a File page saves in, and what each choice means for the file's name and address.
 * Keep is the item's own format when a canvas can write it; GIF and BMP cannot be kept. Design §6.
 */

it('saves JPEG and WebP at quality 90 unless told otherwise', () => {
  expect(DEFAULT_QUALITY).to.equal(90);
});

it('keeps JPEG, PNG and WebP, in any case, and nothing else', () => {
  expect(keepFormatFor('jpg')).to.equal('jpeg');
  expect(keepFormatFor('JPG')).to.equal('jpeg');
  expect(keepFormatFor('jpeg')).to.equal('jpeg');
  expect(keepFormatFor('png')).to.equal('png');
  expect(keepFormatFor('webp')).to.equal('webp');
  expect(keepFormatFor('gif')).to.equal(null);
  expect(keepFormatFor('bmp')).to.equal(null);
  expect(keepFormatFor('')).to.equal(null);
});

it('names the MIME type a canvas encodes each format with', () => {
  expect(mimeFor('jpeg')).to.equal('image/jpeg');
  expect(mimeFor('png')).to.equal('image/png');
  expect(mimeFor('webp')).to.equal('image/webp');
});

it("keeps the file's own spelling when the format is unchanged, and the usual one otherwise", () => {
  expect(extensionFor('jpeg', 'jpeg')).to.equal('jpeg');
  expect(extensionFor('jpeg', 'JPG')).to.equal('jpg');
  expect(extensionFor('jpeg', 'png')).to.equal('jpg');
  expect(extensionFor('png', 'gif')).to.equal('png');
  expect(extensionFor('webp', 'jpg')).to.equal('webp');
});

it("says when a choice changes the file's address", () => {
  expect(addressChanges('png', 'png')).to.equal(false);
  expect(addressChanges('jpeg', 'jpeg')).to.equal(false);
  expect(addressChanges('JPG', 'jpeg')).to.equal(false);
  expect(addressChanges('jpg', 'webp')).to.equal(true);
  expect(addressChanges('gif', 'png')).to.equal(true);
});

it('names a copy with the pattern from the dictionary', () => {
  expect(copyNameFor('beach', '%0% (copy)')).to.equal('beach (copy)');
  expect(copyNameFor('strand', '%0% (kopie)')).to.equal('strand (kopie)');
});

it('writes a file size the way a file manager does', () => {
  expect(formatBytes(900, 'en')).to.equal('900 B');
  expect(formatBytes(2_000, 'en')).to.equal('2 KB');
  expect(formatBytes(214_000, 'en')).to.equal('214 KB');
  expect(formatBytes(6_100_000, 'en')).to.equal('6.1 MB');
  expect(formatBytes(6_100_000, 'nl')).to.equal('6,1 MB');
});

it('names a file format for people', () => {
  expect(formatLabel('jpg')).to.equal('JPEG');
  expect(formatLabel('jpeg')).to.equal('JPEG');
  expect(formatLabel('webp')).to.equal('WebP');
  expect(formatLabel('gif')).to.equal('GIF');
});
