import { expect } from '@open-wc/testing';
import { canReach, refusalTerm, split } from './rules.js';
import { runOperation } from './engine.js';
import type { UmbraDesktopOperationProgress, UmbraDesktopOperationStep } from './engine.js';
import { copySteps, moveSteps, renameStep, replaceStep, restoreSteps, trashSteps } from './steps.js';
import type { UmbraDesktopReplaceDeps } from './steps.js';
import type { UmbraDesktopMediaApi, UmbraDesktopMediaDetail, UmbraDesktopMediaRef, UmbraDesktopMediaValue } from './media-api.js';

/** Moving, copying, trashing, restoring and renaming media from a manager window (plan phase 4). */

const IMAGE_TYPE = 'image-type';
const FOLDER_TYPE = 'folder-type';
const ref = (unique: string, parent: string | null, folder = false, name = unique): UmbraDesktopMediaRef => ({
  unique,
  name,
  parent,
  mediaType: folder ? FOLDER_TYPE : IMAGE_TYPE,
  isFolder: folder,
});

describe('where items may go', () => {
  it('reaches a folder in or under a start folder, and the root only with root access', () => {
    const limited = { root: false, starts: new Set(['people']) };
    expect([
      canReach(limited, { unique: 'people', ancestors: [] }),
      canReach(limited, { unique: 'archive', ancestors: ['people'] }),
      canReach(limited, { unique: 'products', ancestors: [] }),
      canReach(limited, { unique: null, ancestors: [] }),
      canReach({ root: true, starts: new Set() }, { unique: null, ancestors: [] }),
    ]).to.deep.equal([true, true, false, false, true]);
  });

  it('refuses everything for a folder out of reach, and says so', () => {
    const banjo = { unique: 'banjo', name: 'Banjo', parent: 'people', mediaType: IMAGE_TYPE, isFolder: false };
    const result = split([banjo], { unique: null, ancestors: [] }, undefined, 'copy', { root: false, starts: new Set(['people']) });
    expect([result.allowed, result.refused, refusalTerm('access')]).to.deep.equal([[], [{ item: banjo, reason: 'access' }], 'umbraDesktopMedia_refusedAccess']);
  });

  const banjo = ref('banjo', 'products');
  const people = ref('people', null, true);
  const design = ref('design', 'people', true);

  it('puts every item that may go apart from those that may not, with the reason', () => {
    const result = split([banjo, people], { unique: 'design', ancestors: ['people'] }, new Set([IMAGE_TYPE, FOLDER_TYPE]), 'move');
    expect(result.allowed.map((each) => each.unique)).to.deep.equal(['banjo']);
    expect(result.refused).to.deep.equal([{ item: people, reason: 'self' }]);
  });

  it('refuses a type the folder does not allow', () => {
    const result = split([banjo, design], { unique: 'archive', ancestors: [] }, new Set([FOLDER_TYPE]), 'move');
    expect(result.refused).to.deep.equal([{ item: banjo, reason: 'type' }]);
    expect(result.allowed).to.deep.equal([design]);
  });

  it('refuses a folder into itself', () => {
    expect(split([people], { unique: 'people', ancestors: [] }, undefined, 'copy').refused).to.deep.equal([{ item: people, reason: 'self' }]);
  });

  it('refuses moving an item to the folder it is in, and allows copying it there', () => {
    expect(split([banjo], { unique: 'products', ancestors: [] }, undefined, 'move').refused).to.deep.equal([{ item: banjo, reason: 'there' }]);
    expect(split([banjo], { unique: 'products', ancestors: [] }, undefined, 'copy').allowed).to.deep.equal([banjo]);
  });
});

describe('running an operation', () => {
  /**
   * Steps that record when they run, each answering with what it is given.
   * @param answers One answer per step.
   * @returns The steps and the log.
   */
  function steps(answers: Array<{ error?: string; created?: string[] } | Promise<{ error?: string }>>) {
    const log: string[] = [];
    const list: UmbraDesktopOperationStep[] = answers.map((answer, i) => ({
      item: ref(`item-${i}`, null),
      affects: [],
      run: async () => {
        log.push(`run ${i}`);
        return answer;
      },
    }));
    return { list, log };
  }

  it('runs each step in turn and reports what worked and what failed, with the reason', async () => {
    const { list, log } = steps([{}, { error: 'Not allowed' }, { created: ['copy'] }]);
    const result = await runOperation(list).done;
    expect(log).to.deep.equal(['run 0', 'run 1', 'run 2']);
    expect(result.succeeded.map((each) => [each.item.unique, each.created])).to.deep.equal([
      ['item-0', undefined],
      ['item-2', ['copy']],
    ]);
    expect(result.failed.map((each) => [each.item.unique, each.reason])).to.deep.equal([['item-1', 'Not allowed']]);
    expect(result.cancelled).to.equal(false);
  });

  it('reports progress as it goes', async () => {
    const seen: UmbraDesktopOperationProgress[] = [];
    const { list } = steps([{}, { error: 'no' }]);
    await runOperation(list, (progress) => seen.push({ ...progress })).done;
    expect(seen[seen.length - 1]).to.deep.include({ total: 2, done: 2, failed: 1, state: 'finished' });
  });

  it('finishes the step in flight on pause, starts nothing more, and carries on when resumed', async () => {
    let release!: () => void;
    const first = new Promise<{ error?: string }>((resolve) => (release = () => resolve({})));
    const { list, log } = steps([first, {}, {}]);
    const handle = runOperation(list);
    await new Promise((resolve) => setTimeout(resolve));
    handle.pause();
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(log).to.deep.equal(['run 0']);
    expect(handle.progress().state).to.equal('paused');
    handle.resume();
    await handle.done;
    expect(log).to.deep.equal(['run 0', 'run 1', 'run 2']);
  });

  it('keeps a row per item: waiting, running, done, failed with the reason, and cancelled', async () => {
    let release!: () => void;
    const second = new Promise<{ error?: string }>((resolve) => (release = () => resolve({ error: 'Too big' })));
    const { list } = steps([{}, second, {}]);
    const handle = runOperation(list);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handle.rows().map((row) => row.status)).to.deep.equal(['done', 'running', 'waiting']);
    handle.cancel();
    release();
    await handle.done;
    expect(handle.rows().map((row) => [row.status, row.reason])).to.deep.equal([
      ['done', undefined],
      ['failed', 'Too big'],
      ['cancelled', undefined],
    ]);
  });

  it('retries only the failed items, in the same operation, and counts them again', async () => {
    let tries = 0;
    const flaky: UmbraDesktopOperationStep = {
      item: ref('flaky', null),
      affects: [],
      run: async () => (++tries === 1 ? { error: 'Busy' } : {}),
    };
    const { list, log } = steps([{}]);
    const handle = runOperation([...list, flaky]);
    const first = await handle.done;
    expect(first.failed.length).to.equal(1);
    const again = await handle.retry();
    expect(log, 'the item that worked is not run again').to.deep.equal(['run 0']);
    expect(again.failed.length).to.equal(0);
    expect(again.succeeded.map((each) => each.item.unique)).to.deep.equal(['item-0', 'flaky']);
    expect(handle.progress()).to.deep.include({ total: 2, done: 2, failed: 0, state: 'finished' });
    expect(handle.rows().map((row) => row.status)).to.deep.equal(['done', 'done']);
  });

  it('retries just the failed items asked for', async () => {
    const { list, log } = steps([{ error: 'no' }, { error: 'no' }]);
    const handle = runOperation(list);
    await handle.done;
    await handle.retry([list[1].item]);
    expect(log).to.deep.equal(['run 0', 'run 1', 'run 1']);
  });

  it('stops starting steps on cancel, and keeps what is done', async () => {
    let release!: () => void;
    const first = new Promise<{ error?: string }>((resolve) => (release = () => resolve({})));
    const { list, log } = steps([first, {}, {}]);
    const handle = runOperation(list);
    await new Promise((resolve) => setTimeout(resolve));
    handle.cancel();
    release();
    const result = await handle.done;
    expect(log).to.deep.equal(['run 0']);
    expect(result.succeeded.map((each) => each.item.unique)).to.deep.equal(['item-0']);
    expect(result.cancelled).to.equal(true);
  });
});

/**
 * A stand-in server holding a few items, recording every call.
 * @returns The API, its items and its log.
 */
function server() {
  const log: string[] = [];
  const details = new Map<string, UmbraDesktopMediaDetail>([
    [
      'banjo',
      {
        mediaType: IMAGE_TYPE,
        variants: [{ name: 'Banjo' }],
        values: [
          { alias: 'umbracoFile', editorAlias: 'Umbraco.ImageCropper', value: { src: '/media/abc/banjo.jpg', crops: [], focalPoint: null } },
          { alias: 'umbracoWidth', editorAlias: 'Umbraco.Label', value: 1200 },
          { alias: 'altText', editorAlias: 'Umbraco.TextBox', value: 'A banjo' },
        ],
      },
    ],
    ['folder', { mediaType: FOLDER_TYPE, variants: [{ name: 'Folder' }], values: [] }],
  ]);
  const created: Array<{ unique: string; parent: string | null; name: string; values: UmbraDesktopMediaValue[] }> = [];
  const api: UmbraDesktopMediaApi = {
    item: async (unique) => ({ data: ref(unique, null) }),
    items: async (uniques) => ({ data: uniques.map((unique) => ref(unique, null)) }),
    children: async (parent) => ({ data: parent === 'folder' ? [ref('banjo', 'folder', false, 'Banjo')] : [] }),
    detail: async (unique) => (details.has(unique) ? { data: structuredClone(details.get(unique)!) } : { error: 'Not found' }),
    create: async (model) => {
      log.push(`create ${model.name} in ${model.parent}`);
      created.push(model);
      return {};
    },
    update: async (unique, model) => {
      log.push(`update ${unique} ${model.variants[0].name}`);
      return {};
    },
    move: async (unique, target) => {
      log.push(`move ${unique} to ${target}`);
      return unique === 'locked' ? { error: 'You do not have access' } : {};
    },
    trash: async (unique) => {
      log.push(`trash ${unique}`);
      return {};
    },
    restore: async (unique, target) => {
      log.push(`restore ${unique} to ${target}`);
      return {};
    },
    upload: async (file, name) => {
      log.push(`upload ${name} ${file.size}`);
      return { data: 'tmp-1' };
    },
    download: async (url) => {
      log.push(`download ${url}`);
      return url.includes('broken') ? { error: '404 Not Found' } : { data: new Blob(['1234']) };
    },
    folderTypes: async () => ({ data: [FOLDER_TYPE] }),
    allowedTypes: async () => ({ data: [IMAGE_TYPE, FOLDER_TYPE] }),
  };
  return { api, log, created, details };
}

describe('the operations', () => {
  it('moves each item to the folder, and says which folders changed', async () => {
    const { api, log } = server();
    const list = moveSteps(api, [ref('banjo', 'products'), ref('locked', 'products')], 'people');
    expect(list.map((step) => step.affects)).to.deep.equal([
      ['products', 'people'],
      ['products', 'people'],
    ]);
    const result = await runOperation(list).done;
    expect(log).to.deep.equal(['move banjo to people', 'move locked to people']);
    expect(result.failed.map((each) => each.reason)).to.deep.equal(['You do not have access']);
  });

  it('copies an item as a new one with the same values and a new file', async () => {
    const { api, log, created } = server();
    const result = await runOperation(copySteps(api, [ref('banjo', 'products', false, 'Banjo')], 'people')).done;
    expect(log).to.deep.equal(['download /media/abc/banjo.jpg', 'upload banjo.jpg 4', 'create Banjo in people']);
    expect(created[0].values).to.deep.equal([
      { alias: 'umbracoFile', editorAlias: 'Umbraco.ImageCropper', value: { crops: [], focalPoint: null, temporaryFileId: 'tmp-1' } },
      { alias: 'altText', editorAlias: 'Umbraco.TextBox', value: 'A banjo' },
    ]);
    expect(result.succeeded[0].created).to.deep.equal([created[0].unique]);
  });

  it('copies a folder with what is in it', async () => {
    const { api, log, created } = server();
    await runOperation(copySteps(api, [ref('folder', null, true, 'Folder')], 'people')).done;
    expect(log.filter((line) => line.startsWith('create'))).to.deep.equal([
      'create Folder in people',
      `create Banjo in ${created[0].unique}`,
    ]);
  });

  it('copies a place that is no folder with what it holds, as a folder is copied (#158)', async () => {
    const { api, log, created } = server();
    const holding: UmbraDesktopMediaRef = { ...ref('folder', null, false, 'Folder'), hasChildren: true };
    await runOperation(copySteps(api, [holding], 'people')).done;
    expect(log.filter((line) => line.startsWith('create'))).to.deep.equal([
      'create Folder in people',
      `create Banjo in ${created[0].unique}`,
    ]);
  });

  it('creates nothing when the file cannot be read', async () => {
    const { api, created, details } = server();
    details.get('banjo')!.values[0].value = { src: '/media/broken/banjo.jpg' };
    const result = await runOperation(copySteps(api, [ref('banjo', 'products')], 'people')).done;
    expect(created).to.deep.equal([]);
    expect(result.failed[0].reason).to.equal('404 Not Found');
  });

  it('trashes, restores and renames', async () => {
    const { api, log } = server();
    await runOperation(trashSteps(api, [ref('banjo', 'products')])).done;
    await runOperation(restoreSteps(api, [ref('banjo', null)], 'products')).done;
    await runOperation([renameStep(api, ref('banjo', 'products', false, 'Banjo'), 'Banjo two')]).done;
    expect(log).to.deep.equal(['trash banjo', 'restore banjo to products', 'update banjo Banjo two']);
  });
});

/**
 * Replace file (#176): a new file into the same item, through the media service's save, after Umbraco's
 * own check that the item's media type takes the file's format.
 */
describe('replacing a file', () => {
  /**
   * Stand-ins that record what was saved.
   * @param over What differs: the types taking the extension, and the save's answer.
   * @returns The deps and what was saved.
   */
  function deps(over: Partial<{ accepting: string[]; answer: { ok: boolean; message?: string } }> = {}) {
    const saved: unknown[] = [];
    const asked: string[] = [];
    const fake: UmbraDesktopReplaceDeps = {
      accepts: async (extension) => (asked.push(extension), over.accepting ?? [IMAGE_TYPE]),
      save: async (request) => (saved.push(request), over.answer ?? { ok: true }),
      refusal: (extension) => `Cannot upload this file, it does not have an approved file type: ${extension}`,
    };
    return { fake, saved, asked };
  }

  const BANJO = ref('banjo', 'products', false, 'Banjo');

  it('saves the file over the item, resetting the focal point and naming the file after its contents', async () => {
    const { fake, saved, asked } = deps();
    const file = new File(['x'], 'new-banjo.PNG');
    const step = replaceStep(fake, BANJO, file);
    expect(step.affects).to.deep.equal(['products']);
    expect(await step.run()).to.deep.equal({});
    expect(asked).to.deep.equal(['png']);
    expect(saved).to.deep.equal([{ file, name: 'Banjo', folder: 'products', existing: 'banjo', resetFocalPoint: true, versioned: true }]);
  });

  it("refuses a format the item's media type does not take, in Umbraco's words, before uploading", async () => {
    const { fake, saved } = deps({ accepting: ['file-type'] });
    const result = await replaceStep(fake, BANJO, new File(['x'], 'report.pdf')).run();
    expect(result).to.deep.equal({ error: 'Cannot upload this file, it does not have an approved file type: pdf' });
    expect(saved).to.deep.equal([]);
  });

  it('refuses a file without an extension', async () => {
    const { fake, saved } = deps();
    const result = await replaceStep(fake, BANJO, new File(['x'], 'README')).run();
    expect(result.error).to.match(/approved file type/);
    expect(saved).to.deep.equal([]);
  });

  it("passes the media service's reason on when the save fails", async () => {
    const { fake } = deps({ answer: { ok: false, message: 'Too large' } });
    expect(await replaceStep(fake, BANJO, new File(['x'], 'a.jpg')).run()).to.deep.equal({ error: 'Too large' });
  });
});
