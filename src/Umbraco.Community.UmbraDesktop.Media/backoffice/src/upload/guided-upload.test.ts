import { expect } from '@open-wc/testing';
import type { UmbFileDropzoneDroppedItems } from '@umbraco-cms/backoffice/dropzone';
import { guidedUpload } from './guided-upload.js';
import type { GuidedUploadDeps, SheetAnswer, SheetRequest } from './guided-upload.js';
import { DEFAULT_GUIDELINES } from '../guidelines/guidelines.js';
import type { CheckedFile, GuidelineBreak } from '../guidelines/check.js';

/**
 * Files dropped or pasted into a Media Manager, checked against the site's media guidelines before
 * they go (#179): what follows them uploads at once without a question, and the rest wait on the
 * warning in the window.
 */

/** A file, which the fake check breaks by its name: `big-` too large, `loc-` with a location. */
const file = (name: string) => new File(['x'], name);

/**
 * The deps, recording what happened, with the warning answering as the test says.
 * @param answer What the warning answers.
 * @param change What else differs.
 * @returns The deps and the log.
 */
function deps(answer: (request: SheetRequest) => SheetAnswer = () => ({ kind: 'as-is' }), change: Partial<GuidedUploadDeps> = {}) {
  const log: string[] = [];
  const names = (items: UmbFileDropzoneDroppedItems) => [...items.files.map((each) => each.name), ...items.folders.map((each) => `${each.folderName}/`)].join(',');
  const real: GuidedUploadDeps = {
    guidelines: async () => DEFAULT_GUIDELINES,
    uploadLimit: async () => 0,
    check: async (files) =>
      files.map((each): CheckedFile => {
        const breaks: GuidelineBreak[] = [];
        if (each.name.startsWith('big-')) breaks.push('size');
        if (each.name.includes('loc-')) breaks.push('location');
        return { file: each, facts: { format: 'jpeg', location: false, animated: false, alphaChannel: false }, kind: 'jpeg', breaks };
      }),
    upload: async (items) => void log.push(`upload ${names(items)}`),
    ask: async (request) => {
      log.push(`ask ${request.listed.map((each) => each.file.name).join(',')} passing ${request.passing}`);
      return answer(request);
    },
    optimize: async (files) => void log.push(`optimize ${files.map((each) => each.file.name).join(',')}`),
    heldBack: (count) => void log.push(`held back ${count}`),
    canOptimize: () => true,
    ...change,
  };
  return { deps: real, log };
}

describe('a guided upload', () => {
  it('uploads files that follow the guidelines at once, without a question', async () => {
    const { deps: d, log } = deps();
    await guidedUpload({ files: [file('a.jpg'), file('b.png')], folders: [] }, d);
    expect(log).to.deep.equal(['upload a.jpg,b.png']);
  });

  it('checks nothing when every guideline is off', async () => {
    let checked = false;
    const off = { maxSize: { on: false, longestSide: 2560 }, formats: { ...DEFAULT_GUIDELINES.formats, on: false }, location: { on: false } };
    const { deps: d, log } = deps(undefined, { guidelines: async () => off, check: async () => ((checked = true), []) });
    await guidedUpload({ files: [file('big-a.jpg')], folders: [] }, d);
    expect(checked).to.equal(false);
    expect(log).to.deep.equal(['upload big-a.jpg']);
  });

  it('still checks against the upload limit when every guideline is off', async () => {
    let limit = -1;
    const off = { maxSize: { on: false, longestSide: 2560 }, formats: { ...DEFAULT_GUIDELINES.formats, on: false }, location: { on: false } };
    const { deps: d, log } = deps(undefined, {
      guidelines: async () => off,
      uploadLimit: async () => 5,
      check: async (files, _guidelines, uploadLimit) => ((limit = uploadLimit), files.map((each) => ({ file: each, facts: { format: 'jpeg', location: false, animated: false, alphaChannel: false }, kind: 'jpeg', breaks: [] }))),
    });
    await guidedUpload({ files: [file('a.jpg')], folders: [] }, d);
    expect(limit).to.equal(5);
    expect(log).to.deep.equal(['upload a.jpg']);
  });

  it('tells the warning the upload limit, for its line of guidelines', async () => {
    let told = -1;
    const { deps: d } = deps((request) => ((told = request.uploadLimit), { kind: 'as-is' }), { uploadLimit: async () => 7 });
    await guidedUpload({ files: [file('big-a.jpg')], folders: [] }, d);
    expect(told).to.equal(7);
  });

  it('uploads what passes before asking about the rest, dropped folders with it', async () => {
    const { deps: d, log } = deps();
    await guidedUpload({ files: [file('a.jpg'), file('big-b.jpg'), file('loc-c.jpg')], folders: [{ folderName: 'Shoot', files: [], folders: [] }] }, d);
    expect(log).to.deep.equal(['upload a.jpg,Shoot/', 'ask big-b.jpg,loc-c.jpg passing 1', 'upload big-b.jpg,loc-c.jpg']);
  });

  it('opens the warning without waiting for what passes to finish uploading', async () => {
    let finish!: () => void;
    const { deps: d, log } = deps(undefined, {
      upload: (items) => {
        log.push(`upload ${items.files.map((each) => each.name).join(',')}`);
        return items.files.some((each) => each.name === 'a.jpg') ? new Promise<void>((resolve) => (finish = resolve)) : Promise.resolve();
      },
    });
    const done = guidedUpload({ files: [file('a.jpg'), file('big-b.jpg')], folders: [] }, d);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).to.deep.equal(['upload a.jpg', 'ask big-b.jpg passing 1', 'upload big-b.jpg']);
    finish();
    await done;
  });

  it('optimizes the ticked files and uploads the unticked ones as they are', async () => {
    const { deps: d, log } = deps((request) => ({ kind: 'optimize', ticked: request.listed.filter((each) => each.file.name !== 'loc-c.jpg') }));
    await guidedUpload({ files: [file('big-b.jpg'), file('loc-c.jpg')], folders: [] }, d);
    expect(log).to.deep.equal(['ask big-b.jpg,loc-c.jpg passing 0', 'upload loc-c.jpg', 'optimize big-b.jpg']);
  });

  it('uploads none of them when the warning is closed, and the window says so', async () => {
    const { deps: d, log } = deps(() => ({ kind: 'none' }));
    await guidedUpload({ files: [file('a.jpg'), file('big-b.jpg'), file('loc-c.jpg')], folders: [] }, d);
    expect(log).to.deep.equal(['upload a.jpg', 'ask big-b.jpg,loc-c.jpg passing 1', 'held back 2']);
  });

  it('tells the warning whether Optimize can be offered at all', async () => {
    let offered: boolean | undefined;
    const { deps: d } = deps((request) => ((offered = request.canOptimize), { kind: 'as-is' }), { canOptimize: () => false });
    await guidedUpload({ files: [file('big-b.jpg')], folders: [] }, d);
    expect(offered).to.equal(false);
  });

  it('uploads everything as it is when the check itself fails, so a check never holds up an upload', async () => {
    const { deps: d, log } = deps(undefined, {
      check: async () => {
        throw new Error('no');
      },
    });
    await guidedUpload({ files: [file('big-b.jpg')], folders: [] }, d);
    expect(log).to.deep.equal(['upload big-b.jpg']);
  });
});
