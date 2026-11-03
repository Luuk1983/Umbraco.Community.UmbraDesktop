import { expect } from '@open-wc/testing';
import { filesSettings, kindOfFormat, optionsForFile } from './file-fixes.js';
import type { OptimizeSettings } from './remembered.js';

/**
 * What a file handed to Optimize images gets (#179): only the fixes for what it breaks, with the
 * run's settings deciding how. A JPEG whose only problem is a recorded location has it removed
 * without the picture being saved again.
 */

/** The settings the Media add-on's guidelines open a run on: 2560, PNG photos to WebP at 80, location removed. */
const GUIDED: OptimizeSettings = filesSettings({
  resize: { maxWidth: 2560, maxHeight: 2560 },
  formats: { jpeg: 'keep', 'png-photo': 'webp', 'png-transparent': 'keep', webp: 'keep', gif: 'keep' },
  quality: 80,
  removeLocation: true,
});

describe('a file\'s fixes', () => {
  it('start from the caller\'s settings, with Convert on and every row the caller did not name kept', () => {
    expect(GUIDED).to.include({ resize: true, maxWidth: 2560, maxHeight: 2560, convert: true, quality: 80, removeMetadata: true });
    expect(filesSettings({}).formats).to.deep.equal({ jpeg: 'keep', 'png-photo': 'keep', 'png-transparent': 'keep', webp: 'keep', gif: 'keep' });
    expect(filesSettings({}).resize).to.equal(false);
  });

  it('remove only the location from a JPEG whose only problem is the location: no resize, no new encode', () => {
    const options = optionsForFile({ format: 'jpeg', fix: ['location'] }, GUIDED)!;
    expect(options).to.deep.include({ resize: null, format: 'keep', removeMetadata: true, recompress: false });
  });

  it('resize a JPEG that is too large in its own format, at the run\'s quality', () => {
    const options = optionsForFile({ format: 'jpeg', fix: ['size', 'location'] }, GUIDED)!;
    expect(options).to.deep.include({ resize: { maxWidth: 2560, maxHeight: 2560 }, format: 'keep', quality: 80, removeMetadata: true });
  });

  it('convert a PNG photo by its row, and resize it too only when it is too large', () => {
    expect(optionsForFile({ format: 'png', kind: 'png-photo', fix: ['format'] }, GUIDED)).to.deep.include({ resize: null, format: 'webp', quality: 80 });
    expect(optionsForFile({ format: 'png', kind: 'png-photo', fix: ['size', 'format'] }, GUIDED)).to.deep.include({
      resize: { maxWidth: 2560, maxHeight: 2560 },
      format: 'webp',
    });
  });

  it('save a resized file in its row\'s format when the row asks for one, even if the file did not break Formats', () => {
    const jpegToWebp = { ...GUIDED, formats: { ...GUIDED.formats!, jpeg: 'webp' as const } };
    expect(optionsForFile({ format: 'jpeg', fix: ['size'] }, jpegToWebp)).to.deep.include({ format: 'webp' });
  });

  it('leave the format when the row was set back to Keep in the window, or Convert was switched off', () => {
    const kept = { ...GUIDED, formats: { ...GUIDED.formats!, 'png-photo': 'keep' as const } };
    expect(optionsForFile({ format: 'png', kind: 'png-photo', fix: ['size', 'format'] }, kept)).to.deep.include({ format: 'keep' });
    expect(optionsForFile({ format: 'png', kind: 'png-photo', fix: ['format'] }, kept)).to.equal(null);
    expect(optionsForFile({ format: 'png', kind: 'png-photo', fix: ['format'] }, { ...GUIDED, convert: false })).to.equal(null);
  });

  it("encode a file over the upload limit anew at the run's quality, in its row's format", () => {
    expect(optionsForFile({ format: 'jpeg', fix: ['upload-limit'] }, GUIDED)).to.deep.include({ resize: null, format: 'keep', quality: 80, recompress: true });
    expect(optionsForFile({ format: 'png', kind: 'png-photo', fix: ['upload-limit'] }, GUIDED)).to.deep.include({ format: 'webp' });
  });

  it('do nothing for a fix the person switched off, and say so with null', () => {
    expect(optionsForFile({ format: 'jpeg', fix: ['location'] }, { ...GUIDED, removeMetadata: false })).to.equal(null);
    expect(optionsForFile({ format: 'jpeg', fix: ['size'] }, { ...GUIDED, resize: false })).to.equal(null);
  });

  it('give every fix the settings ask for to a file the caller said nothing about', () => {
    expect(optionsForFile({ format: 'png' }, GUIDED)).to.deep.include({ resize: { maxWidth: 2560, maxHeight: 2560 }, format: 'webp', removeMetadata: true });
  });

  it('read a kind from a format when the caller gave none, a PNG counted as a photo', () => {
    expect(kindOfFormat('jpeg')).to.equal('jpeg');
    expect(kindOfFormat('png')).to.equal('png-photo');
    expect(kindOfFormat('webp')).to.equal('webp');
    expect(kindOfFormat('gif')).to.equal('gif');
    expect(kindOfFormat(undefined)).to.equal(undefined);
  });
});
