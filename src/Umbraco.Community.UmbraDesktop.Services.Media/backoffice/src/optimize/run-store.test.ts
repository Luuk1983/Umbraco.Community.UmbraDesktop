import { expect } from '@open-wc/testing';
import { OptimizeRunStore, reportOf } from './run-store.js';
import type { OptimizeRun } from './run-store.js';
import { DEFAULT_SETTINGS } from './remembered.js';
import { image, library, settled, until } from './run-fixtures.test-helper.js';
import type { Stored } from './run-fixtures.test-helper.js';

/**
 * The run store (design §5, §6.2, §7, §8.3): every run by id, outliving the window that shows it.
 * The deps answer from tables, so a test says exactly what the media library holds and does.
 */

/** A folder, a PDF and a binned image beside three images in Products. */
const MIXED = (): Stored[] => [
  { ...image('design'), facts: { ...image('design').facts, mediaType: 'folder', hasUrl: false, extension: undefined } },
  image('banjo'),
  image('bowling'),
  { ...image('report'), facts: { ...image('report').facts, extension: 'pdf' } },
  { ...image('old'), facts: { ...image('old').facts, isTrashed: true } },
  image('jumpsuit'),
];

describe('OptimizeRunStore', () => {
  it('prepares the selection: skips a folder, a PDF and a binned image, and names the window after their folder', async () => {
    const lib = library(MIXED());
    const store = new OptimizeRunStore(lib.deps);
    const { id } = store.create({ items: ['design', 'banjo', 'bowling', 'report', 'old', 'jumpsuit'] });
    const run = await settled(store, id);
    expect(run.phase).to.equal('settings');
    expect(run.items.map((item) => [item.unique, item.status, item.skip])).to.deep.equal([
      ['design', 'skipped', 'folder'],
      ['banjo', 'waiting', undefined],
      ['bowling', 'waiting', undefined],
      ['report', 'skipped', 'not-an-image'],
      ['old', 'skipped', 'trashed'],
      ['jumpsuit', 'waiting', undefined],
    ]);
    expect(run.title).to.equal('Optimize images: Products (3)');
    expect(run.settings).to.deep.equal(DEFAULT_SETTINGS);
  });

  it('counts the places the images are used in, and gives up quietly when it cannot', async () => {
    const lib = library(MIXED());
    const store = new OptimizeRunStore(lib.deps);
    const { id } = store.create({ items: ['banjo', 'bowling', 'jumpsuit'] });
    await settled(store, id);
    await until(() => store.get(id)?.usage !== undefined);
    expect(store.get(id)!.usage).to.deep.equal({ images: 2, places: 5 });

    const failing = new OptimizeRunStore({ ...lib.deps, references: async () => Promise.reject(new Error('offline')) });
    const second = failing.create({ items: ['banjo'] });
    await settled(failing, second.id);
    await until(() => failing.get(second.id)?.usage !== undefined);
    expect(failing.get(second.id)!.usage).to.equal(null);
  });

  it('starts at once when asked, on the caller’s options, and remembers what it started with', async () => {
    const lib = library([image('banjo')]);
    const store = new OptimizeRunStore(lib.deps);
    const { report } = store.create({ items: ['banjo'], options: { format: 'webp' }, start: true });
    expect((await report).status).to.equal('finished');
    expect(lib.remembered.length).to.equal(1);
    expect(lib.remembered[0]).to.deep.include({ convert: true, format: 'webp', resize: false });
  });

  it('processes items in selection order, one at a time', async () => {
    const lib = library([image('banjo'), image('bowling'), image('jumpsuit')]);
    const store = new OptimizeRunStore(lib.deps);
    const { id, report } = store.create({ items: ['jumpsuit', 'banjo', 'bowling'] });
    await settled(store, id);
    store.start(id);
    await report;
    expect(lib.log).to.deep.equal(['open jumpsuit', 'save jumpsuit', 'open banjo', 'save banjo', 'open bowling', 'save bowling']);
  });

  it("carries on after a failure, and reports it with Umbraco's words", async () => {
    const lib = library([image('banjo'), image('bowling')]);
    lib.answerSaves((request) => (request.existing === 'banjo' ? { ok: false, message: 'The folder does not allow WebP.' } : undefined));
    const store = new OptimizeRunStore(lib.deps);
    const { id, report } = store.create({ items: ['banjo', 'bowling'], start: true });
    const done = await report;
    expect(done.items.map((item) => [item.unique, item.status, item.reason])).to.deep.equal([
      ['banjo', 'failed', 'The folder does not allow WebP.'],
      ['bowling', 'optimized', undefined],
    ]);
    expect(store.get(id)!.phase).to.equal('ended');
  });

  it('fails a conflict without forcing it', async () => {
    const lib = library([image('banjo')]);
    lib.answerSaves(() => ({ ok: false, conflict: true }));
    const store = new OptimizeRunStore(lib.deps);
    const done = await store.create({ items: ['banjo'], start: true }).report;
    expect(done.items[0]).to.deep.include({ status: 'failed', reason: 'Someone else saved this image after you started.' });
    expect(lib.saves.length).to.equal(1);
    expect(lib.saves[0].force).to.equal(undefined);
  });

  it('fails an item binned before it is opened, and saves nothing over it', async () => {
    const lib = library([image('banjo')]);
    lib.byKey.get('banjo')!.trashed = true;
    const store = new OptimizeRunStore(lib.deps);
    const done = await store.create({ items: ['banjo'], start: true }).report;
    expect(done.items[0]).to.deep.include({ status: 'failed', reason: 'No longer in the media library' });
    expect(lib.saves).to.deep.equal([]);
  });

  it('saves over the item with a hashed file name and the date it opened', async () => {
    const lib = library([image('banjo')]);
    lib.byKey.get('banjo')!.fileName = 'banjo-ud0badf00d.jpg';
    const store = new OptimizeRunStore(lib.deps);
    const done = await store.create({ items: ['banjo'], start: true }).report;
    const [request] = lib.saves;
    expect(request).to.deep.include({ existing: 'banjo', expectedUpdateDate: '2026-10-20T10:00:00Z', name: 'Banjo', folder: 'products' });
    expect(request.file.name).to.match(/^banjo-ud[0-9a-f]{8}\.webp$/);
    expect(request.file.name).to.not.include('0badf00d');
    expect(request.force).to.equal(undefined);
    expect(request.resetFocalPoint).to.equal(undefined);
    expect(request.copyOf).to.equal(undefined);
    expect(done.items[0]).to.deep.include({ status: 'optimized', after: { width: 2560, height: 1707, size: 400_000, format: 'webp' } });
    expect(done.saved).to.equal(7_600_000);
  });

  it('saves copies next to the original as full copies', async () => {
    const lib = library([image('banjo')]);
    lib.byKey.get('banjo')!.fileName = 'banjo-ud0badf00d.jpg';
    const store = new OptimizeRunStore(lib.deps);
    const done = await store.create({ items: ['banjo'], save: 'copy', start: true }).report;
    const [request] = lib.saves;
    expect(request).to.deep.include({ copyOf: 'banjo', folder: 'products', name: 'Banjo (optimized)' });
    expect(request.existing).to.equal(undefined);
    expect(request.file.name).to.equal('banjo-optimized.webp');
    expect(done.items[0].copy).to.match(/^copy-/);
  });

  it('leaves an item with nothing to do alone', async () => {
    const lib = library([image('banjo')]);
    lib.byKey.get('banjo')!.content = 'optimized';
    const store = new OptimizeRunStore(lib.deps);
    const done = await store.create({ items: ['banjo'], start: true }).report;
    expect(done.items[0]).to.deep.include({ status: 'unchanged', reason: 'unchanged: fits' });
    expect(lib.saves).to.deep.equal([]);
  });

  it('lets the item being saved finish, then stops', async () => {
    const lib = library([image('banjo'), image('bowling'), image('jumpsuit')]);
    const store = new OptimizeRunStore(lib.deps);
    lib.holdSaves();
    const { id, report } = store.create({ items: ['banjo', 'bowling', 'jumpsuit'], start: true });
    await until(() => lib.saves.length === 1);
    store.cancel(id);
    expect(store.get(id)!.cancelling).to.equal(true);
    lib.releaseSaves();
    const done = await report;
    expect(done.status).to.equal('cancelled');
    expect(done.items.map((item) => item.status)).to.deep.equal(['optimized', 'not-started', 'not-started']);
    expect(store.get(id)!.outcome).to.equal('cancelled');
  });

  it('runs the failed items again, opening each afresh', async () => {
    const lib = library([image('banjo'), image('bowling')]);
    let refuse = true;
    lib.answerSaves((request) => (refuse && request.existing === 'banjo' ? { ok: false, message: 'busy' } : undefined));
    const store = new OptimizeRunStore(lib.deps);
    const { id, report } = store.create({ items: ['banjo', 'bowling'], start: true });
    const first = await report;
    expect(first.items[0].status).to.equal('failed');
    refuse = false;
    lib.log.length = 0;
    store.retryFailed(id);
    await settled(store, id, 'ended');
    await until(() => store.get(id)!.phase === 'ended' && store.get(id)!.items[0].status === 'optimized');
    expect(lib.log).to.deep.equal(['open banjo', 'save banjo']);
    expect(store.get(id)!.pass).to.equal(2);
  });

  it('runs the rest after a cancel', async () => {
    const lib = library([image('banjo'), image('bowling')]);
    const store = new OptimizeRunStore(lib.deps);
    lib.holdSaves();
    const { id, report } = store.create({ items: ['banjo', 'bowling'], start: true });
    await until(() => lib.saves.length === 1);
    store.cancel(id);
    lib.releaseSaves();
    await report;
    store.runRest(id);
    await until(() => store.get(id)!.phase === 'ended' && store.get(id)!.items[1].status === 'optimized');
    expect(store.get(id)!.outcome).to.equal('finished');
  });

  it('runs the animated items again, keeping their first frame, only when asked', async () => {
    const lib = library([image('banjo'), { ...image('spinner'), fileName: 'spinner.gif' }]);
    const store = new OptimizeRunStore(lib.deps);
    const { id, report } = store.create({ items: ['banjo', 'spinner'], start: true });
    const first = await report;
    expect(first.items[1]).to.deep.include({ status: 'skipped', reason: 'skipped: animated' });
    store.runAnimated(id);
    await until(() => store.get(id)!.phase === 'ended' && store.get(id)!.items[1].status === 'optimized');
    expect(lib.log.filter((line) => line.startsWith('open'))).to.deep.equal(['open banjo', 'open spinner', 'open spinner']);
    expect(store.get(id)!.settings).to.deep.equal(DEFAULT_SETTINGS);
  });

  /** Review Focus 4: the second is opened afresh, after the first was saved, and found done. */
  it('opens each item just before saving it, so a repeat in the selection is found already done', async () => {
    const lib = library([image('banjo')]);
    const store = new OptimizeRunStore(lib.deps);
    const done = await store.create({ items: ['banjo', 'banjo'], start: true }).report;
    expect(done.items.map((item) => item.status)).to.deep.equal(['optimized', 'unchanged']);
    expect(lib.saves.length).to.equal(1);
  });

  it('resolves not-started when the settings are cancelled, and drops the run', async () => {
    const lib = library([image('banjo')]);
    const store = new OptimizeRunStore(lib.deps);
    const { id, report } = store.create({ items: ['banjo'] });
    await settled(store, id);
    store.release(id);
    const done = await report;
    expect(done.status).to.equal('not-started');
    expect(done.items[0].status).to.equal('not-started');
    expect(store.get(id)).to.equal(undefined);
    expect(lib.log).to.deep.equal([]);
  });

  /** Review Focus 5. */
  it('drops a run when its window closes mid-run, once the item in hand is saved', async () => {
    const lib = library([image('banjo'), image('bowling')]);
    const store = new OptimizeRunStore(lib.deps);
    lib.holdSaves();
    const { id, report } = store.create({ items: ['banjo', 'bowling'], start: true });
    await until(() => lib.saves.length === 1);
    store.release(id);
    expect(store.get(id), 'still there while its item saves').to.not.equal(undefined);
    lib.releaseSaves();
    const done = await report;
    expect(done.status).to.equal('cancelled');
    expect(done.items.map((item) => item.status)).to.deep.equal(['optimized', 'not-started']);
    await until(() => store.get(id) === undefined);
  });

  it('cancels every run when the desktop leaves', async () => {
    const lib = library([image('banjo'), image('bowling')]);
    const store = new OptimizeRunStore(lib.deps);
    lib.holdSaves();
    const running = store.create({ items: ['banjo', 'bowling'], start: true });
    const waiting = store.create({ items: ['banjo'] });
    await until(() => lib.saves.length === 1);
    store.dispose();
    lib.releaseSaves();
    expect((await running.report).status).to.equal('cancelled');
    expect((await waiting.report).status).to.equal('not-started');
  });

  it('knows nothing of a run it does not hold', () => {
    const store = new OptimizeRunStore(library([]).deps);
    expect(store.get('run-from-before-a-reload')).to.equal(undefined);
    expect(() => store.start('run-from-before-a-reload')).not.to.throw();
  });

  it('reports the bytes saved, a growth included', () => {
    const run = {
      outcome: 'finished',
      items: [
        { unique: 'a', name: 'A', parent: null, status: 'optimized', before: { width: 1, height: 1, size: 1000, format: 'jpeg' }, after: { width: 1, height: 1, size: 400, format: 'webp' } },
        { unique: 'b', name: 'B', parent: null, status: 'optimized', before: { width: 1, height: 1, size: 100, format: 'jpeg' }, after: { width: 1, height: 1, size: 300, format: 'png' } },
      ],
    } as unknown as OptimizeRun;
    expect(reportOf(run, library([]).deps.words).saved).to.equal(400);
  });
});
