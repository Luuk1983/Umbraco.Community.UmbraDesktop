import { expect } from '@open-wc/testing';
import { OptimizeRunStore } from './run-store.js';
import { library, settled, until } from './run-fixtures.test-helper.js';
import type { OptimizeFilesRequest } from './types.js';
import type { NormalisedOptions } from './options.js';

/**
 * A run on files rather than media items (#179): files dropped into a Media Manager that broke the
 * site's media guidelines, each optimized in the browser and then uploaded through the caller's own
 * upload, one at a time, so each appears in the folder as it lands.
 */

/**
 * A request for three dropped files: two camera JPEGs and a PNG photo, as the mock's.
 * @param upload The caller's upload.
 * @param change What else differs.
 * @returns The request.
 */
function request(upload: OptimizeFilesRequest['upload'], change: Partial<OptimizeFilesRequest> = {}): OptimizeFilesRequest {
  return {
    files: [
      { file: new File(['a'], 'DSC_0412.jpg', { type: 'image/jpeg' }), kind: 'jpeg', fix: ['size', 'location'] },
      { file: new File(['b'], 'tattoo-shop.jpg', { type: 'image/jpeg' }), kind: 'jpeg', fix: ['location'] },
      { file: new File(['c'], 'team-day.png', { type: 'image/png' }), kind: 'png-photo', fix: ['size', 'format'] },
    ],
    settings: {
      resize: { maxWidth: 2560, maxHeight: 2560 },
      formats: { 'png-photo': 'webp' },
      quality: 80,
      removeLocation: true,
    },
    destination: { name: 'Products', path: ['Shop', 'Products'] },
    note: 'Set from the media guidelines.',
    upload,
    ...change,
  };
}

/**
 * Run deps whose optimizer records what each file was asked for and shrinks it.
 * @returns The deps, and what was asked.
 */
function recording() {
  const asked: Array<[string, NormalisedOptions]> = [];
  const lib = library([], {
    optimize: async (file, options) => {
      asked.push([file.name, options]);
      if (file.name.startsWith('broken')) return { status: 'failed', message: 'This browser could not read the picture.' };
      const before = { width: 6000, height: 4000, size: 13_000_000, format: file.name.endsWith('png') ? 'png' : 'jpeg' };
      const out = new File(['small'], file.name.replace(/\.png$/, '.webp'), { type: options.format === 'webp' ? 'image/webp' : file.type });
      return { status: 'optimized', file: out, before, after: { width: 2560, height: 1707, size: 600_000, format: options.format === 'webp' ? 'webp' : before.format } };
    },
  });
  return { lib, asked };
}

describe('OptimizeRunStore on files', () => {
  it('prepares the files without asking the media library anything, and names the window after the folder', async () => {
    const { lib } = recording();
    let read = 0;
    const store = new OptimizeRunStore({ ...lib.deps, facts: async () => (read++, new Map()) });
    const { id } = store.createFiles(request(async () => ({ ok: true })));
    const run = await settled(store, id);
    expect(read).to.equal(0);
    expect(run.mode).to.equal('files');
    expect(run.title).to.equal('Optimize and upload: Products (3)');
    expect(run.from).to.deep.equal({ path: ['Shop', 'Products'] });
    expect(run.destination).to.deep.equal({ name: 'Products', path: ['Shop', 'Products'] });
    expect(run.note).to.equal('Set from the media guidelines.');
    expect(run.items.map((item) => [item.name, item.format, item.kind, item.fix])).to.deep.equal([
      ['DSC_0412.jpg', 'jpeg', 'jpeg', ['size', 'location']],
      ['tattoo-shop.jpg', 'jpeg', 'jpeg', ['location']],
      ['team-day.png', 'png', 'png-photo', ['size', 'format']],
    ]);
    expect(run.settings.formats!['png-photo']).to.equal('webp');
    expect(store.files(id)!.map((file) => file.name)).to.deep.equal(['DSC_0412.jpg', 'tattoo-shop.jpg', 'team-day.png']);
  });

  it('gives each file only the fixes for what it breaks, then uploads it before the next one starts', async () => {
    const { lib, asked } = recording();
    const log: string[] = [];
    const store = new OptimizeRunStore({ ...lib.deps, optimize: async (file, options) => (log.push(`optimize ${file.name}`), lib.deps.optimize(file, options)) });
    const { report } = store.createFiles(
      request(async (file) => {
        log.push(`upload ${file.name}`);
        return { ok: true };
      }),
    );
    const done = await report;
    expect(log).to.deep.equal(['optimize DSC_0412.jpg', 'upload DSC_0412.jpg', 'optimize tattoo-shop.jpg', 'upload tattoo-shop.jpg', 'optimize team-day.png', 'upload team-day.webp']);
    expect(asked[1][1]).to.deep.include({ resize: null, format: 'keep', removeMetadata: true, recompress: false });
    expect(asked[2][1]).to.deep.include({ format: 'webp' });
    expect(done.status).to.equal('finished');
    expect(done.items.map((item) => item.status)).to.deep.equal(['optimized', 'optimized', 'optimized']);
    // Settings that came from a caller's guidelines are not this person's choice to remember.
    expect(lib.remembered).to.deep.equal([]);
  });

  it('uploads a file as it was when nothing is left to do, or the optimizer leaves it alone', async () => {
    const { lib } = recording();
    const uploaded: File[] = [];
    const store = new OptimizeRunStore({
      ...lib.deps,
      optimize: async () => ({ status: 'skipped', reason: 'animated' }),
    });
    const settings = { ...request(async () => ({ ok: true })).settings!, removeLocation: false };
    const { id, report } = store.createFiles(request(async (file) => (uploaded.push(file), { ok: true }), { settings }));
    const done = await report;
    // tattoo-shop.jpg only had a location, and the caller did not ask for it removed: it goes as it was.
    expect(done.items[1].status).to.equal('unchanged');
    expect(done.items[0].status).to.equal('skipped');
    expect(uploaded.map((file) => file.name)).to.deep.equal(['DSC_0412.jpg', 'tattoo-shop.jpg', 'team-day.png']);
    expect(store.get(id)!.items.every((item) => item.uploaded)).to.equal(true);
  });

  it('fails a file whose optimizing or upload failed, and uploads nothing for it until asked', async () => {
    const { lib } = recording();
    const uploaded: string[] = [];
    let refuse = true;
    const store = new OptimizeRunStore(lib.deps);
    const files = request(async () => ({ ok: true })).files;
    files[1] = { ...files[1], file: new File(['b'], 'broken.jpg', { type: 'image/jpeg' }) };
    const { id, report } = store.createFiles(
      request(
        async (file) => {
          if (file.name === 'team-day.webp' && refuse) return { ok: false, message: 'The folder does not allow this type' };
          uploaded.push(file.name);
          return { ok: true };
        },
        { files },
      ),
    );
    await report;
    let run = store.get(id)!;
    expect(run.items.map((item) => [item.status, item.message, !!item.uploaded])).to.deep.equal([
      ['optimized', undefined, true],
      ['failed', 'This browser could not read the picture.', false],
      ['failed', 'The folder does not allow this type', false],
    ]);
    expect(uploaded).to.deep.equal(['DSC_0412.jpg']);

    // Upload the original: the file as it was dropped, nothing done to it.
    store.uploadOriginal(id, 1);
    await until(() => !!store.get(id)!.items[1].uploaded);
    run = store.get(id)!;
    expect(run.items[1]).to.deep.include({ status: 'unchanged', original: true, uploaded: true });
    expect(uploaded).to.deep.equal(['DSC_0412.jpg', 'broken.jpg']);

    // Retry: optimized and uploaded again, this one only.
    refuse = false;
    store.retryOne(id, 2);
    await until(() => store.get(id)!.phase === 'ended' && !!store.get(id)!.items[2].uploaded);
    expect(store.get(id)!.items[2].status).to.equal('optimized');
    expect(uploaded).to.deep.equal(['DSC_0412.jpg', 'broken.jpg', 'team-day.webp']);
  });

  it('starts at once, with no settings to confirm: the caller chose them, and the person chose Optimize', () => {
    const { lib } = recording();
    const store = new OptimizeRunStore(lib.deps);
    const { id } = store.createFiles(request(async () => ({ ok: true })));
    expect(store.get(id)!.phase).to.equal('running');
  });

  it('stops after the file in hand when the window closes mid-run, and what is uploaded stays', async () => {
    const { lib } = recording();
    const uploaded: string[] = [];
    let letGo!: () => void;
    const held = new Promise<void>((resolve) => (letGo = resolve));
    const store = new OptimizeRunStore(lib.deps);
    const { id, report } = store.createFiles(
      request(async (file) => {
        uploaded.push(file.name);
        if (uploaded.length === 1) await held;
        return { ok: true };
      }),
    );
    await until(() => uploaded.length === 1);
    store.release(id);
    letGo();
    const done = await report;
    expect(done.status).to.equal('cancelled');
    expect(done.items.map((item) => item.status)).to.deep.equal(['optimized', 'not-started', 'not-started']);
    expect(uploaded).to.deep.equal(['DSC_0412.jpg']);
  });
});
