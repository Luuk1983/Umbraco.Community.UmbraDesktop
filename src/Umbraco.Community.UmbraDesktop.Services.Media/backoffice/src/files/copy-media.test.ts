import { expect } from '@open-wc/testing';
import { copyMedia } from './copy-media.js';
import type { CopyDeps, CopyableItem } from './copy-media.js';

/**
 * A full copy of a media item (#137, edit-image design §11.6 and §11.7): every branch of the
 * decision, against fakes of the backoffice. What a copy holds is `copy-values.test.ts`; this is
 * whether there is a copy at all, what it is made of, and what the person is told.
 */

/** The original: a custom photo type with a focal point, alt text, derived labels and a second file. */
const ORIGINAL: CopyableItem = {
  name: 'Beach',
  isTrashed: false,
  mediaType: { unique: 'photo', collection: null },
  values: [
    { alias: 'umbracoFile', editorAlias: 'Umbraco.ImageCropper', value: { src: '/media/a/beach.jpg', focalPoint: { left: 0.3, top: 0.6 }, crops: [] } },
    { alias: 'umbracoWidth', editorAlias: 'Umbraco.Label', value: 1600 },
    { alias: 'altText', editorAlias: 'Umbraco.TextBox', value: 'A beach at dusk' },
    { alias: 'licence', editorAlias: 'Umbraco.UploadField', value: { src: '/media/b/licence.pdf' } },
  ],
};

/** The words the person is told, with their arguments, so a test reads which was said. */
const WORDS = {
  formatRefused: (name: string, format: string) => `format:${name}:${format}`,
  folderRefused: (name: string) => `folder:${name}`,
  leftOut: (names: string) => `left-out:${names}`,
};

/**
 * Fakes of the backoffice, recording what was asked of them.
 * @param overrides What to answer differently.
 * @returns The deps, and what they saw.
 */
function fakes(overrides: Partial<CopyDeps> = {}) {
  const seen = { uploads: 0, reuploads: [] as string[], created: [] as Array<{ mediaType: unknown; name: string; folder: string | null; values: unknown[] }> };
  const deps: CopyDeps = {
    read: async (unique) => (unique === 'k1' ? ORIGINAL : undefined),
    typesAccepting: async (extension) => (['jpg', 'png', 'webp'].includes(extension) ? ['photo', 'image'] : ['file']),
    allowedIn: async () => ['photo', 'image', 'folder'],
    upload: async () => (seen.uploads++, 't1'),
    reupload: async (src) => (seen.reuploads.push(src), `copy-of-${src}`),
    propertyNames: async () => new Map([['licence', 'Licence']]),
    create: async (item, folder) => {
      seen.created.push({ ...item, folder });
      return { ok: true, unique: 'new1', updateDate: 'd1' };
    },
    words: WORDS,
    ...overrides,
  };
  return { deps, seen };
}

/** A copy request. */
const request = (overrides: Partial<Parameters<typeof copyMedia>[1]> = {}) => ({
  copyOf: 'k1',
  file: new File(['x'], 'Beach (copy).jpg'),
  name: 'Beach (copy)',
  folder: 'f1',
  resetFocalPoint: false,
  ...overrides,
});

describe('a full copy', () => {
  it("is created in one request, of the original's media type, with its values and the new file", async () => {
    const { deps, seen } = fakes();
    const result = await copyMedia(deps, request());
    expect(result).to.deep.equal({ ok: true, unique: 'new1', updateDate: 'd1', copied: 'full' });
    expect(seen.created.length).to.equal(1);
    const [created] = seen.created;
    expect(created.mediaType).to.deep.equal({ unique: 'photo', collection: null });
    expect(created.name).to.equal('Beach (copy)');
    expect(created.folder).to.equal('f1');
    expect((created.values as Array<{ alias: string }>).map((value) => value.alias)).to.deep.equal(['umbracoFile', 'altText', 'licence']);
  });

  it('resets the focal point when the picture was reframed', async () => {
    const { deps, seen } = fakes();
    await copyMedia(deps, request({ resetFocalPoint: true }));
    const file = (seen.created[0].values as Array<{ alias: string; value: { focalPoint?: unknown } }>).find((value) => value.alias === 'umbracoFile');
    expect(file?.value.focalPoint).to.equal(null);
  });

  /** Owner, 2026-10-20: the copy is made without the one property, and the person is told which. */
  it('leaves out another file that cannot be copied, and says which', async () => {
    const { deps, seen } = fakes({ reupload: async () => undefined });
    const result = await copyMedia(deps, request());
    expect(result).to.deep.include({ ok: true, copied: 'full', notice: 'left-out:Licence' });
    expect((seen.created[0].values as Array<{ alias: string }>).map((value) => value.alias)).to.deep.equal(['umbracoFile', 'altText']);
  });
});

describe('when there is no full copy to make', () => {
  /** As a save over a gone item does: the person asked for their work to be saved. */
  it('makes way for a plain new item when the original is gone, binned, or holds no file', async () => {
    expect(await copyMedia(fakes().deps, request({ copyOf: 'gone' }))).to.equal(null);
    expect(await copyMedia(fakes({ read: async () => ({ ...ORIGINAL, isTrashed: true }) }).deps, request())).to.equal(null);
    expect(await copyMedia(fakes({ read: async () => ({ ...ORIGINAL, values: [] }) }).deps, request())).to.equal(null);
  });

  /** Owner, 2026-10-20: a copy that cannot be full is refused, with the reason, rather than made plain. */
  it("refuses a format the original's media type does not take, and uploads nothing", async () => {
    const { deps, seen } = fakes();
    const result = await copyMedia(deps, request({ file: new File(['x'], 'Beach (copy).gif') }));
    expect(result).to.deep.equal({ ok: false, message: 'format:Beach:GIF' });
    expect(seen.uploads).to.equal(0);
    expect(seen.created.length).to.equal(0);
  });

  it("refuses a folder that does not allow the original's media type, and uploads nothing", async () => {
    const { deps, seen } = fakes({ allowedIn: async () => ['image'] });
    const result = await copyMedia(deps, request());
    expect(result).to.deep.equal({ ok: false, message: 'folder:Beach' });
    expect(seen.uploads).to.equal(0);
  });

  it('fails when the new file cannot be uploaded, and passes on what the server said about the create', async () => {
    expect(await copyMedia(fakes({ upload: async () => undefined }).deps, request())).to.deep.equal({ ok: false });
    const refused = fakes({ create: async () => ({ ok: false, message: 'Not allowed here.' }) });
    expect(await copyMedia(refused.deps, request())).to.deep.equal({ ok: false, message: 'Not allowed here.' });
  });
});
