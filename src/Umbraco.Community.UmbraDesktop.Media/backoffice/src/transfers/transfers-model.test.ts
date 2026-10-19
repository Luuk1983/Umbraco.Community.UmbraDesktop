import { expect } from '@open-wc/testing';
import {
  OPEN_AFTER_MS,
  closesItself,
  foldRows,
  formatBytes,
  metaOf,
  opensNow,
  overallOf,
  timeLeftOf,
  titleOf,
} from './transfers-model.js';
import type { UmbraDesktopTransfer, UmbraDesktopTransferRow } from './transfers-model.js';

/** What the Transfers window shows (design §7, plan task 7.5). */

/**
 * A row.
 * @param name Its name.
 * @param status Where it is.
 * @param extra Anything else.
 * @returns The row.
 */
const row = (name: string, status: UmbraDesktopTransferRow['status'], extra: Partial<UmbraDesktopTransferRow> = {}): UmbraDesktopTransferRow => ({
  key: name,
  name,
  status,
  ...extra,
});

/**
 * A transfer.
 * @param over What differs from a running copy of three items to Design.
 * @returns The transfer.
 */
const transfer = (over: Partial<UmbraDesktopTransfer> = {}): UmbraDesktopTransfer => ({
  id: 't',
  kind: 'copy',
  target: 'design',
  targetName: 'Design',
  startedAt: 0,
  state: 'running',
  canPause: true,
  rows: [row('Banjo', 'done'), row('Clip', 'running'), row('Drum', 'waiting')],
  samples: [],
  ...over,
});

describe('the Transfers window', () => {
  it('opens for a transfer still running after two seconds, and not for a quick one', () => {
    expect(opensNow(transfer(), OPEN_AFTER_MS - 1)).to.equal(false);
    expect(opensNow(transfer(), OPEN_AFTER_MS)).to.equal(true);
    expect(opensNow(transfer({ state: 'finished' }), OPEN_AFTER_MS * 5)).to.equal(false);
  });

  it('names what a transfer does and where, one item and several', () => {
    expect(titleOf(transfer())).to.deep.equal({ key: 'umbraDesktopMedia_transferCopying', args: [3, 'Design'] });
    expect(titleOf(transfer({ kind: 'move', rows: [row('Banjo', 'running')] }))).to.deep.equal({ key: 'umbraDesktopMedia_transferMovingOne', args: ['Banjo', 'Design'] });
    expect(titleOf(transfer({ state: 'finished' }))).to.deep.equal({ key: 'umbraDesktopMedia_transferCopied', args: [3, 'Design'] });
    expect(titleOf(transfer({ kind: 'trash', target: undefined, targetName: undefined }))).to.deep.equal({ key: 'umbraDesktopMedia_transferTrashing', args: [3, ''] });
  });

  it('names an upload of one folder after the folder', () => {
    const upload = transfer({
      kind: 'upload',
      rows: [row('Spring campaign', 'done', { folder: true }), row('a.jpg', 'running', { path: 'Spring campaign', bytes: 100 })],
      targetName: 'People',
    });
    expect(titleOf(upload)).to.deep.equal({ key: 'umbraDesktopMedia_transferUploadingOne', args: ['Spring campaign', 'People'] });
  });

  it('fills the bar by count, or by size for uploads', () => {
    expect(overallOf(transfer())).to.be.closeTo(1 / 3, 0.001);
    const upload = transfer({
      kind: 'upload',
      rows: [row('a', 'done', { bytes: 300 }), row('b', 'running', { bytes: 100, progress: 0.5 })],
    });
    expect(overallOf(upload)).to.be.closeTo(350 / 400, 0.001);
  });

  it('works out the time left from the recent rate, and says nothing before it knows', () => {
    expect(timeLeftOf(transfer(), 10_000)).to.equal(undefined);
    const going = transfer({ samples: [{ at: 0, done: 0 }, { at: 10_000, done: 1 }] });
    // One item in ten seconds, two to go.
    expect(timeLeftOf(going, 10_000)).to.equal(20);
  });

  it('says counts, size and time left under the bar', () => {
    const upload = transfer({
      kind: 'upload',
      rows: [row('a', 'done', { bytes: 2 * 1024 * 1024 }), row('b', 'running', { bytes: 4 * 1024 * 1024, progress: 0 })],
      samples: [{ at: 0, done: 0 }, { at: 10_000, done: 2 * 1024 * 1024 }],
    });
    expect(metaOf(upload, 10_000)).to.deep.equal([
      { key: 'umbraDesktopMedia_transferCountFiles', args: [1, 2] },
      { key: 'umbraDesktopMedia_transferSize', args: ['2 MB', '6 MB'] },
      { key: 'umbraDesktopMedia_transferLeftSeconds', args: [20] },
    ]);
    expect(metaOf(transfer({ state: 'paused' }), 0)).to.deep.equal([
      { key: 'umbraDesktopMedia_transferCount', args: [1, 3] },
      { key: 'umbraDesktopMedia_transferPaused', args: [] },
    ]);
  });

  it('says what worked and what failed once a transfer has finished', () => {
    const finished = transfer({ state: 'finished', rows: [row('Banjo', 'done'), row('Clip', 'failed'), row('Drum', 'done')] });
    expect(metaOf(finished, 0)).to.deep.equal([
      { key: 'umbraDesktopMedia_transferWorkedOf', args: [2, 3] },
      { key: 'umbraDesktopMedia_transferFailedCount', args: [1] },
    ]);
    expect(metaOf(transfer({ state: 'cancelled', rows: [row('Banjo', 'done'), row('Clip', 'cancelled')] }), 0)).to.deep.equal([
      { key: 'umbraDesktopMedia_transferWorkedOf', args: [1, 2] },
    ]);
  });

  it('folds a finished transfer to its failures and a count of what worked', () => {
    const finished = transfer({ state: 'finished', rows: [row('Banjo', 'done'), row('Clip', 'failed', { reason: 'Too big' }), row('Drum', 'done')] });
    expect(foldRows(finished).map((each) => [each.name, each.status])).to.deep.equal([
      ['Clip', 'failed'],
      ['umbraDesktopMedia_transferWorked', 'done'],
    ]);
  });

  it('closes itself only when every transfer has finished and everything worked', () => {
    expect(closesItself([transfer({ state: 'finished', rows: [row('a', 'done')] })])).to.equal(true);
    expect(closesItself([transfer({ state: 'finished', rows: [row('a', 'failed')] })])).to.equal(false);
    expect(closesItself([transfer({ state: 'finished', rows: [row('a', 'done')] }), transfer()])).to.equal(false);
    expect(closesItself([transfer({ state: 'cancelled', rows: [row('a', 'done'), row('b', 'cancelled')] })])).to.equal(false);
    expect(closesItself([])).to.equal(false);
  });

  it('writes sizes the way a file manager does', () => {
    expect([formatBytes(900), formatBytes(1536), formatBytes(6 * 1024 * 1024), formatBytes(186.4 * 1024 * 1024)]).to.deep.equal([
      '900 B',
      '1.5 KB',
      '6 MB',
      '186 MB',
    ]);
  });
});
