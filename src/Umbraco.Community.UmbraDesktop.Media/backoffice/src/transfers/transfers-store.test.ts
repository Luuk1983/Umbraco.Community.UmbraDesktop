import { expect } from '@open-wc/testing';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import { UmbraDesktopTransfersStore } from './transfers-store.js';
import { runOperation } from '../operations/engine.js';
import type { UmbraDesktopOperationStep } from '../operations/engine.js';
import { uploadBatch } from '../upload/upload-watch.js';
import type { UmbraDesktopUploadItem } from '../upload/upload-watch.js';
import type { UmbraDesktopMediaRef } from '../operations/media-api.js';

/** The transfers the desktop keeps for its Transfers window (plan task 7.4). */

const ref = (unique: string): UmbraDesktopMediaRef => ({ unique, name: unique, parent: null, mediaType: 'image', isFolder: false });

/**
 * Steps that each wait to be released, answering with an error when asked.
 * @param names The items.
 * @param errors Which fail, and why.
 * @returns The steps and their releases.
 */
function steps(names: string[], errors: Record<string, string> = {}) {
  const release: Record<string, () => void> = {};
  const list: UmbraDesktopOperationStep[] = names.map((name) => ({
    item: ref(name),
    affects: [],
    run: () => new Promise((resolve) => (release[name] = () => resolve(errors[name] ? { error: errors[name] } : {}))),
  }));
  return { list, release };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/**
 * A store on a stand-in clock and window, recording what it asks of the desktop.
 * @param startOpen Whether the Transfers window is open already, as it is when Retry is pressed.
 * @returns The store, the clock, the scheduled checks and the record.
 */
function store(startOpen = false) {
  let now = 0;
  const later: Array<{ at: number; run: () => void }> = [];
  const record: string[] = [];
  let open = startOpen;
  const transfers = new UmbraDesktopTransfersStore({
    now: () => now,
    later: (run, ms) => void later.push({ at: now + ms, run }),
    open: () => {
      open = true;
      record.push('open');
    },
    isOpen: () => open,
    close: () => {
      open = false;
      record.push('close');
    },
    notify: (transfer) => record.push(`notify ${transfer.kind} ${transfer.rows.length}`),
    nameOf: async (unique) => (unique ? `Folder ${unique}` : '#sections_media'),
    reupload: (files, parent) => {
      record.push(`reupload ${files.map((file) => file.name).join(',')} into ${parent}`);
      const again = new UmbArrayState<UmbraDesktopUploadItem>([], (each) => each.unique);
      const batch = uploadBatch({ progressItems: again.asObservable(), remove: () => undefined }, parent);
      queueMicrotask(() => again.setValue(files.map((file) => ({ unique: `re-${file.name}`, parentUnique: parent, status: 'complete', progress: 100, temporaryFile: { file } }))));
      return batch;
    },
  });
  /** Move the clock on, running what is due. */
  const advance = (ms: number) => {
    now += ms;
    for (const due of later.filter((each) => each.at <= now)) {
      later.splice(later.indexOf(due), 1);
      due.run();
    }
  };
  return { transfers, advance, record, isOpen: () => open };
}

/**
 * Follow an operation the way the context runs one.
 * @param transfers The store.
 * @param names The items.
 * @param errors Which fail.
 * @returns Its id and its releases.
 */
function operation(transfers: UmbraDesktopTransfersStore, names: string[], errors: Record<string, string> = {}) {
  const { list, release } = steps(names, errors);
  const id = transfers.newId();
  const handle = runOperation(list, () => transfers.refresh(id));
  transfers.followOperation(id, 'copy', 'design', handle);
  return { id, release, handle };
}

describe('the transfers', () => {
  it('lists an operation with a row per item, and where it goes', async () => {
    const { transfers } = store();
    const { release } = operation(transfers, ['a', 'b']);
    await tick();
    release.a();
    await tick();
    const [transfer] = transfers.list();
    expect(transfer.rows.map((row) => [row.name, row.status])).to.deep.equal([
      ['a', 'done'],
      ['b', 'running'],
    ]);
    expect(transfer.targetName).to.equal('Folder design');
    expect(transfer.canPause).to.equal(true);
  });

  it('opens the window for an operation still running after two seconds, and not for a quick one', async () => {
    const { transfers, advance, record } = store();
    const quick = operation(transfers, ['a']);
    await tick();
    quick.release.a();
    await tick();
    advance(2000);
    expect(record).to.deep.equal([]);
    operation(transfers, ['b']);
    await tick();
    advance(2000);
    expect(record).to.deep.equal(['open']);
  });

  it('forgets a quick transfer once it has finished, so the window never shows it, nor its failures', async () => {
    const { transfers, advance, record } = store();
    const quick = operation(transfers, ['a'], { a: 'Busy' });
    await tick();
    quick.release.a();
    await tick();
    expect(transfers.list().length).to.equal(0);
    const slow = operation(transfers, ['b']);
    await tick();
    advance(2000);
    slow.release.b();
    await tick();
    expect(record).to.deep.equal(['open', 'close', 'notify copy 1']);
  });

  it('closes the window and says what went where once everything worked', async () => {
    const { transfers, advance, record } = store();
    const { release } = operation(transfers, ['a', 'b']);
    await tick();
    advance(2000);
    release.a();
    await tick();
    release.b();
    await tick();
    expect(record).to.deep.equal(['open', 'close', 'notify copy 2']);
  });

  it('keeps the window open when something failed, and the failure in the list', async () => {
    const { transfers, advance, record } = store();
    const { release } = operation(transfers, ['a', 'b'], { b: 'Too big' });
    await tick();
    advance(2000);
    release.a();
    await tick();
    release.b();
    await tick();
    expect(record).to.deep.equal(['open']);
    expect(transfers.list()[0].rows[1]).to.deep.include({ status: 'failed', reason: 'Too big' });
    expect(transfers.wasShown(transfers.list()[0].id)).to.equal(true);
  });

  it('retries the failed items in the same transfer, and closes once they all worked', async () => {
    const { transfers, advance, record } = store(true);
    let tries = 0;
    const flaky: UmbraDesktopOperationStep = { item: ref('flaky'), affects: [], run: async () => (++tries === 1 ? { error: 'Busy' } : {}) };
    const id = transfers.newId();
    const handle = runOperation([flaky], () => transfers.refresh(id));
    transfers.followOperation(id, 'move', 'design', handle);
    await handle.done;
    advance(10);
    expect(transfers.list().map((each) => each.rows.map((row) => row.status))).to.deep.equal([['failed']]);
    await transfers.retry(id);
    expect(record).to.deep.equal(['close', 'notify move 1']);
  });

  it('follows a batch of uploads, without pause, with sizes and the folders they go into', async () => {
    const { transfers } = store();
    const list = new UmbArrayState<UmbraDesktopUploadItem>([], (each) => each.unique);
    const batch = uploadBatch({ progressItems: list.asObservable(), remove: () => undefined }, 'people');
    transfers.followUpload(batch);
    list.setValue([
      { unique: 'f', parentUnique: 'people', status: 'complete', progress: 100, folder: { name: 'Spring' } },
      { unique: 'x', parentUnique: 'f', status: 'waiting', progress: 40, temporaryFile: { file: new File(['1234'], 'x.jpg') } },
      { unique: 'y', parentUnique: 'people', status: 'notAllowed', statusMessage: 'Not here', progress: 0, temporaryFile: { file: new File(['1'], 'y.exe') } },
    ]);
    await tick();
    const [transfer] = transfers.list();
    expect(transfer.kind).to.equal('upload');
    expect(transfer.canPause).to.equal(false);
    expect(transfer.rows.map((row) => [row.name, row.status, row.path, row.bytes, row.reason])).to.deep.equal([
      ['Spring', 'done', undefined, undefined, undefined],
      ['x.jpg', 'running', 'Spring', 4, undefined],
      ['y.exe', 'failed', undefined, 1, 'Not here'],
    ]);
  });

  it('uploads the failed files again into the same transfer, in place of their failures', async () => {
    const { transfers, record } = store(true);
    const list = new UmbArrayState<UmbraDesktopUploadItem>([], (each) => each.unique);
    const batch = uploadBatch({ progressItems: list.asObservable(), remove: () => undefined }, 'people');
    const id = transfers.followUpload(batch);
    list.setValue([
      { unique: 'x', parentUnique: 'people', status: 'complete', progress: 100, temporaryFile: { file: new File(['1'], 'x.jpg') } },
      { unique: 'y', parentUnique: 'people', status: 'error', progress: 0, temporaryFile: { file: new File(['1'], 'y.jpg') } },
    ]);
    await tick();
    await transfers.retry(id);
    await tick();
    expect(record).to.include('reupload y.jpg into people');
    expect(transfers.list()[0].rows.map((row) => [row.name, row.status])).to.deep.equal([
      ['x.jpg', 'done'],
      ['y.jpg', 'done'],
    ]);
  });

  it('forgets finished transfers when the window closes, and keeps one still running', async () => {
    const { transfers } = store();
    const done = operation(transfers, ['a']);
    operation(transfers, ['b']);
    await tick();
    done.release.a();
    await tick();
    transfers.clearFinished();
    expect(transfers.list().map((each) => each.rows[0].name)).to.deep.equal(['b']);
  });
});
