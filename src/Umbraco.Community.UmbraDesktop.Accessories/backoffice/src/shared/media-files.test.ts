import { expect } from '@open-wc/testing';
import { editableImageType, extensionOf, fileNameFor, isTextFile } from './media-files.js';

it('reads a file’s extension from a media URL, lower-cased', () => {
  expect(extensionOf('/media/abc123/Meeting-Notes.MD')).to.equal('md');
  expect(extensionOf('/media/abc123/photo.jpg?width=200')).to.equal('jpg');
  expect(extensionOf('/media/abc123/README')).to.equal('');
});

/**
 * The media item's name is what the person typed; the file behind it needs an extension so the
 * media library picks the right media type and a browser knows what it is.
 */
it('names the file after the document, keeping an extension the name already has', () => {
  expect(fileNameFor('', 'Untitled', 'txt')).to.equal('Untitled.txt');
  expect(fileNameFor('Meeting notes', 'Untitled', 'txt')).to.equal('Meeting notes.txt');
  expect(fileNameFor('robots.txt', 'Untitled', 'txt')).to.equal('robots.txt');
  expect(fileNameFor('Changelog', 'Untitled', 'md')).to.equal('Changelog.md');
  expect(fileNameFor('  Logo  ', 'Untitled', 'png')).to.equal('Logo.png');
});

it('opens text files in Notepad, by extension or by type', () => {
  for (const extension of ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'svg']) {
    expect(isTextFile(extension, ''), extension).to.equal(true);
  }
  expect(isTextFile('', 'text/plain')).to.equal(true);
  expect(isTextFile('pdf', 'application/pdf')).to.equal(false);
  expect(isTextFile('png', 'image/png')).to.equal(false);
});

/**
 * Paint edits pixels, so it takes raster images, and it saves in the format it was given where the
 * browser can write that format, so a JPEG stays a JPEG. An SVG is a drawing in text, not pixels,
 * and is refused rather than silently flattened.
 */
it('edits raster images, saving each in a format the browser can write', () => {
  expect(editableImageType('image/png')).to.equal('image/png');
  expect(editableImageType('image/jpeg')).to.equal('image/jpeg');
  expect(editableImageType('image/webp')).to.equal('image/webp');
  expect(editableImageType('image/gif'), 'a GIF is saved as PNG').to.equal('image/png');
  expect(editableImageType('image/bmp')).to.equal('image/png');
  expect(editableImageType('image/svg+xml')).to.equal(undefined);
  expect(editableImageType('application/pdf')).to.equal(undefined);
});
