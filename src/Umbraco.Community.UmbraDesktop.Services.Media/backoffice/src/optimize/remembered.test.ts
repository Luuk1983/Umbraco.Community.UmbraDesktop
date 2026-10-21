import { expect } from '@open-wc/testing';
import { DEFAULT_SETTINGS, optionsOf, readRemembered, rememberedKeyFor, startingSettings, writeRemembered } from './remembered.js';
import type { OptimizeSettings } from './remembered.js';

/** A map standing in for `localStorage`. */
function memory(): Pick<Storage, 'getItem' | 'setItem'> & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) };
}

/** Somebody's last choices: resize only, saving copies. */
const LAST: OptimizeSettings = { resize: true, maxWidth: 1600, maxHeight: null, convert: false, format: 'webp', quality: 70, removeMetadata: true, save: 'copy' };

/**
 * The settings a run starts on (D11): a caller's, then the person's own from the last run, then the
 * designed defaults. Remembered per user in this browser, read as if anyone could have written it.
 */
describe('remembered settings', () => {
  it('starts on 2560 × 2560, WebP at 80, metadata removed, replacing the originals', () => {
    expect(DEFAULT_SETTINGS).to.deep.equal({
      resize: true,
      maxWidth: 2560,
      maxHeight: 2560,
      convert: true,
      format: 'webp',
      quality: 80,
      removeMetadata: true,
      save: 'replace',
    });
  });

  it('keeps one list per user', () => {
    expect(rememberedKeyFor('u1')).to.equal('umbradesktop-media-optimize:u1');
  });

  it('reads back what it wrote', () => {
    const storage = memory();
    writeRemembered(storage, 'k', LAST);
    expect(readRemembered(storage, 'k')).to.deep.equal(LAST);
  });

  it('ignores what is not a set of settings', () => {
    const storage = memory();
    for (const junk of ['nonsense', '{"resize":"yes"}', '[]', 'null', JSON.stringify({ ...LAST, format: 'avif' })]) {
      storage.map.set('k', junk);
      expect(readRemembered(storage, 'k'), junk).to.equal(undefined);
    }
  });

  it('reads and writes nothing where storage throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readRemembered(broken, 'k')).to.equal(undefined);
    expect(() => writeRemembered(broken, 'k', LAST)).not.to.throw();
    expect(readRemembered(null, 'k')).to.equal(undefined);
  });

  it("starts on the caller's options, then the remembered ones, then the defaults", () => {
    expect(startingSettings({}, undefined)).to.deep.equal(DEFAULT_SETTINGS);
    expect(startingSettings({}, LAST)).to.deep.equal(LAST);
    expect(startingSettings({ save: 'replace' }, LAST)).to.deep.equal({ ...LAST, save: 'replace' });
    expect(startingSettings({ options: { format: 'jpeg', quality: 60 } }, LAST)).to.deep.equal({
      ...DEFAULT_SETTINGS,
      resize: false,
      convert: true,
      format: 'jpeg',
      quality: 60,
      removeMetadata: true,
    });
    expect(startingSettings({ options: { removeMetadata: true } }, LAST)).to.deep.include({ resize: false, convert: false, removeMetadata: true });
  });

  it('turns settings into the options a run works from', () => {
    expect(optionsOf(DEFAULT_SETTINGS)).to.deep.equal({ resize: { maxWidth: 2560, maxHeight: 2560 }, format: 'webp', quality: 80, removeMetadata: true, animated: 'skip' });
    expect(optionsOf(LAST)).to.deep.equal({ resize: { maxWidth: 1600 }, format: 'keep', quality: 70, removeMetadata: true, animated: 'skip' });
    expect(optionsOf({ ...LAST, resize: false, removeMetadata: false })).to.deep.equal({ resize: null, format: 'keep', quality: 70, removeMetadata: false, animated: 'skip' });
  });
});
