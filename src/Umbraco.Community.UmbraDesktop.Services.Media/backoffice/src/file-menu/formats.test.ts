import { expect } from '@open-wc/testing';
import {
  DEFAULT_QUALITY,
  contentHash,
  copyNameFor,
  extensionFor,
  formatBytes,
  formatLabel,
  keepFormatFor,
  mimeFor,
  versionedFileName,
} from './formats.js';

/**
 * The formats the file menu saves in, and what each choice means for the file's name and address.
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

/**
 * A save over an item writes the file under a name with a short hash of its contents (#137): a new
 * picture gets a new address, so no browser cache can show the old one, and the same bytes keep the
 * same address. FNV-1a, 32 bits, as eight hex digits; the vectors are FNV's published ones.
 */
it("hashes a file's bytes to eight hex digits, the same bytes to the same hash", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  expect(contentHash(bytes(''))).to.equal('811c9dc5');
  expect(contentHash(bytes('a'))).to.equal('e40c292c');
  expect(contentHash(bytes('foobar'))).to.equal('bf9cf968');
  expect(contentHash(bytes('foobar'))).to.equal(contentHash(bytes('foobar')));
});

/**
 * The hash follows `-ud`, which no camera or person writes, so an earlier save's hash is replaced and
 * nothing else is: a name ending in a date, `scan-20241020`, kept its date only once the marker was
 * there (found by the reviewer of #137).
 */
it('puts the hash after the name, replacing the hash an earlier save put there and nothing else', () => {
  expect(versionedFileName('beach', '3f9a1c07', 'jpg')).to.equal('beach-ud3f9a1c07.jpg');
  expect(versionedFileName('beach-ud0badf00d', '3f9a1c07', 'webp')).to.equal('beach-ud3f9a1c07.webp');
  expect(versionedFileName('16403439029_f500be349b_o', '3f9a1c07', 'jpg')).to.equal('16403439029_f500be349b_o-ud3f9a1c07.jpg');
  expect(versionedFileName('scan-20241020', '3f9a1c07', 'jpg'), 'a date is not a hash').to.equal('scan-20241020-ud3f9a1c07.jpg');
  expect(versionedFileName('build-cafebabe', '3f9a1c07', 'jpg'), 'nor is a hex word').to.equal('build-cafebabe-ud3f9a1c07.jpg');
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
