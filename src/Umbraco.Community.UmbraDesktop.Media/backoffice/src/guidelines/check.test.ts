import { expect } from '@open-wc/testing';
import { breaksOf, checkFiles, kindOf } from './check.js';
import { DEFAULT_GUIDELINES } from './guidelines.js';
import type { MediaGuidelines } from './guidelines.js';
import type { UploadFacts } from './image-facts.js';

/** Which guidelines a dropped file breaks (#179), from its facts alone. */

/**
 * A file's facts, a camera JPEG unless a test says otherwise.
 * @param facts What differs.
 * @returns The facts.
 */
function facts(facts: Partial<UploadFacts> = {}): UploadFacts {
  return { format: 'jpeg', width: 6000, height: 4000, location: false, animated: false, alphaChannel: false, ...facts };
}

/**
 * The defaults with some changed.
 * @param change What differs.
 * @returns The guidelines.
 */
function guidelines(change: (g: MediaGuidelines) => void): MediaGuidelines {
  const copy = structuredClone(DEFAULT_GUIDELINES);
  change(copy);
  return copy;
}

describe('the kind of image a file is', () => {
  it('is its format, with PNG split on transparency', () => {
    expect(kindOf(facts(), undefined)).to.equal('jpeg');
    expect(kindOf(facts({ format: 'png', alphaChannel: false }), undefined)).to.equal('png-photo');
    expect(kindOf(facts({ format: 'png', alphaChannel: true }), true)).to.equal('png-photo');
    expect(kindOf(facts({ format: 'png', alphaChannel: true }), false)).to.equal('png-transparent');
    expect(kindOf(facts({ format: 'webp' }), undefined)).to.equal('webp');
    expect(kindOf(facts({ format: 'gif' }), undefined)).to.equal('gif');
    expect(kindOf(facts({ format: 'other' }), undefined)).to.equal(null);
  });
});

describe('the guidelines a file breaks', () => {
  it('include Maximum size when the longest side is longer than allowed, upright or not', () => {
    expect(breaksOf(facts({ width: 6000, height: 4000 }), 'jpeg', DEFAULT_GUIDELINES)).to.deep.equal(['size']);
    expect(breaksOf(facts({ width: 2000, height: 3000 }), 'jpeg', DEFAULT_GUIDELINES)).to.deep.equal(['size']);
    expect(breaksOf(facts({ width: 2560, height: 1707 }), 'jpeg', DEFAULT_GUIDELINES)).to.deep.equal([]);
  });

  it('include Formats when the kind\'s row is set to another format than its own', () => {
    const small = facts({ format: 'png', width: 800, height: 600 });
    expect(breaksOf(small, 'png-photo', DEFAULT_GUIDELINES)).to.deep.equal(['format']);
    expect(breaksOf(small, 'png-transparent', DEFAULT_GUIDELINES)).to.deep.equal([]);
    const pngToPng = guidelines((g) => (g.formats.rows['png-photo'] = 'png'));
    expect(breaksOf(small, 'png-photo', pngToPng)).to.deep.equal([]);
  });

  it('include Location when the file records one', () => {
    expect(breaksOf(facts({ width: 1920, height: 1280, location: true }), 'jpeg', DEFAULT_GUIDELINES)).to.deep.equal(['location']);
  });

  it('list every one a file breaks, in the order the settings list them', () => {
    expect(breaksOf(facts({ format: 'png', width: 3200, height: 2133, location: true }), 'png-photo', DEFAULT_GUIDELINES)).to.deep.equal(['size', 'format', 'location']);
  });

  it('leave out a guideline that is switched off', () => {
    const off = guidelines((g) => {
      g.maxSize.on = false;
      g.location.on = false;
    });
    expect(breaksOf(facts({ location: true }), 'jpeg', off)).to.deep.equal([]);
    const formatsOff = guidelines((g) => (g.formats.on = false));
    expect(breaksOf(facts({ format: 'png', width: 10, height: 10 }), 'png-photo', formatsOff)).to.deep.equal([]);
  });

  it('include the upload limit when the file is larger than Umbraco takes, with every guideline off', () => {
    const off = guidelines((g) => {
      g.maxSize.on = false;
      g.formats.on = false;
      g.location.on = false;
    });
    const small = facts({ width: 800, height: 600 });
    expect(breaksOf(small, 'jpeg', off, 31_000_000, 30_000_000)).to.deep.equal(['upload-limit']);
    expect(breaksOf(small, 'jpeg', off, 30_000_000, 30_000_000)).to.deep.equal([]);
    expect(breaksOf(small, 'jpeg', off, 31_000_000, 0)).to.deep.equal([]);
  });

  it('list the upload limit last', () => {
    expect(breaksOf(facts({ location: true }), 'jpeg', DEFAULT_GUIDELINES, 31_000_000, 30_000_000)).to.deep.equal(['size', 'location', 'upload-limit']);
  });

  it('never include anything for an animated image, which is always left alone', () => {
    expect(breaksOf(facts({ format: 'gif', animated: true, width: 4000, height: 3000 }), 'gif', guidelines((g) => (g.formats.rows.gif = 'webp')))).to.deep.equal([]);
  });

  it('never include anything for a file that is not an image this can fix', () => {
    expect(breaksOf(facts({ format: 'other', width: undefined, height: undefined, location: true }), null, DEFAULT_GUIDELINES)).to.deep.equal([]);
  });
});

describe('checking dropped files', () => {
  it('reads each file once and decodes a PNG only when its transparency decides something', async () => {
    const decoded: string[] = [];
    const files = [new File(['a'], 'photo.jpg'), new File(['b'], 'logo.png'), new File(['c'], 'shot.png'), new File(['d'], 'small.png')];
    const table: Record<string, UploadFacts> = {
      'photo.jpg': facts({ location: true }),
      'logo.png': facts({ format: 'png', width: 800, height: 400, alphaChannel: true }),
      'shot.png': facts({ format: 'png', width: 1600, height: 900, alphaChannel: true }),
      'small.png': facts({ format: 'png', width: 100, height: 100, alphaChannel: false }),
    };
    const checked = await checkFiles(files, DEFAULT_GUIDELINES, {
      readFacts: async (file) => table[file.name],
      isOpaquePng: async (file) => {
        decoded.push(file.name);
        return file.name === 'shot.png';
      },
    });
    expect(checked.map((each) => [each.file.name, each.kind, each.breaks])).to.deep.equal([
      ['photo.jpg', 'jpeg', ['size', 'location']],
      ['logo.png', 'png-transparent', []],
      ['shot.png', 'png-photo', ['format']],
      ['small.png', 'png-photo', ['format']],
    ]);
    // small.png has no alpha channel, so its header already says it is opaque.
    expect(decoded).to.deep.equal(['logo.png', 'shot.png']);
  });

  it('decodes no PNG when both PNG rows ask the same and the PNG breaks nothing else', async () => {
    const decoded: string[] = [];
    const same = guidelines((g) => (g.formats.rows['png-photo'] = 'keep'));
    await checkFiles([new File(['b'], 'logo.png')], same, {
      readFacts: async () => facts({ format: 'png', width: 800, height: 400, alphaChannel: true }),
      isOpaquePng: async (file) => {
        decoded.push(file.name);
        return false;
      },
    });
    expect(decoded).to.deep.equal([]);
  });

  it('checks each file against the upload limit it is given', async () => {
    const big = new File(['0123456789ab'], 'big.jpg');
    const small = new File(['0123'], 'small.jpg');
    const read = { readFacts: async () => facts({ width: 800, height: 600 }), isOpaquePng: async () => true };
    const checked = await checkFiles([big, small], DEFAULT_GUIDELINES, read, 10);
    expect(checked.map((each) => each.breaks)).to.deep.equal([['upload-limit'], []]);
  });

  it('passes a file it could not read, rather than holding up the upload', async () => {
    const checked = await checkFiles([new File(['x'], 'odd.jpg')], DEFAULT_GUIDELINES, {
      readFacts: async () => {
        throw new Error('no');
      },
      isOpaquePng: async () => true,
    });
    expect(checked[0].breaks).to.deep.equal([]);
  });
});
