import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { HEALTH_POLL_MS, UmbraDesktopMediaHealthContext } from './media-health.context.js';
import type { UmbraDesktopMediaHealthState } from './media-health.context.js';
import type { HealthCheck, HealthItem, HealthOrphan, HealthResult, HealthStatus, UmbraDesktopMediaHealthClient } from './health.client.js';

/**
 * The Media Health context (design §2, §5, §15): follows a check the server runs, polling only while
 * it runs, and keeps the result on the desktop so the window can close and the Manager can read it
 * later.
 */

const MB = 1024 * 1024;

const item = (over: Partial<HealthItem> = {}): HealthItem => ({
  key: 'a',
  name: 'Banjo',
  mediaTypeAlias: 'Image',
  extension: 'jpg',
  sizeBytes: 100,
  parentKey: 'f',
  path: '/Products',
  usageCount: 1,
  used: true,
  ...over,
});

const orphan = (relativePath: string, sizeBytes = 10): HealthOrphan => ({ relativePath, url: `/media/${relativePath}`, sizeBytes, lastModifiedUtc: '2026-01-01T00:00:00Z' });

/**
 * A check as the server reports it.
 * @param over What differs from a finished check.
 * @returns The check.
 */
const check = (over: Partial<HealthCheck> = {}): HealthCheck => ({
  id: 1,
  startedUtc: '2026-10-26T13:12:00Z',
  finishedUtc: '2026-10-26T13:13:00Z',
  phase: 'Done',
  scanned: 3,
  total: 3,
  error: null,
  startedBy: null,
  items: 3,
  folders: 1,
  orphans: 2,
  sizeBytes: 0,
  orphanBytes: 0,
  ...over,
});

/**
 * A stand-in server whose check takes a few polls, recording every call and every wait.
 * @param over What differs from a library of three items and two orphans.
 */
function server(over: { steps?: HealthStatus[]; status?: HealthStatus; items?: HealthItem[]; orphans?: HealthOrphan[] } = {}) {
  const calls: string[] = [];
  const waits: number[] = [];
  let status: HealthStatus = over.status ?? { running: null, last: null, failed: null };
  // What each poll answers after a check starts, in order; the last one is what stays.
  const steps = over.steps ?? [
    { running: check({ id: 2, phase: 'Usage', scanned: 2, total: 3, finishedUtc: null }), last: status.last, failed: null },
    { running: check({ id: 2, phase: 'Disk', scanned: 0, total: 0, finishedUtc: null }), last: status.last, failed: null },
    { running: null, last: check({ id: 2 }), failed: null },
  ];
  let step = 0;
  const items = over.items ?? [item({ key: 'a', sizeBytes: 3 * MB }), item({ key: 'b', used: false, usageCount: 0, sizeBytes: 50 }), item({ key: 'c', path: '/People', sizeBytes: 30 })];
  let orphans = over.orphans ?? [orphan('1/x.jpg'), orphan('2/y.png')];
  const ok = <T>(data: T): Promise<HealthResult<T>> => Promise.resolve({ data });
  const client = {
    status: async () => {
      calls.push('status');
      if (status.running && step < steps.length) status = steps[step++];
      return ok(status);
    },
    check: async () => {
      calls.push('check');
      status = { running: check({ id: 2, phase: 'Usage', scanned: 0, total: 3, finishedUtc: null }), last: status.last, failed: null };
      return ok(status);
    },
    allItems: async () => {
      calls.push('items');
      return ok(items);
    },
    orphans: async () => {
      calls.push('orphans');
      return ok(orphans);
    },
    folders: async () => {
      calls.push('folders');
      return ok([{ key: 'f', name: 'Products', parentKey: null, path: '/Products' }]);
    },
    deleteOrphans: async (paths: ReadonlyArray<string>) => {
      calls.push(`delete ${paths.join(',')}`);
      if (paths.includes('denied')) return { error: 'denied' as const };
      const deleted = paths.filter((path) => path !== '2/y.png');
      orphans = orphans.filter((each) => !deleted.includes(each.relativePath));
      return ok({ deleted, skipped: paths.filter((path) => path === '2/y.png').map((relativePath) => ({ relativePath, reason: 'NowOwned' })) });
    },
  } as unknown as UmbraDesktopMediaHealthClient;
  return { client, calls, waits, wait: async (ms: number) => void waits.push(ms) };
}

describe('the Media Health context', () => {
  let hosts: UmbElementControllerHost[] = [];
  afterEach(() => {
    for (const host of hosts) host.destroy();
    hosts = [];
  });

  /**
   * The context on a stand-in server.
   * @param api The stand-in.
   * @returns The context, and every state it went through.
   */
  function context(api = server()) {
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    const states: UmbraDesktopMediaHealthState[] = [];
    const trashed: string[][] = [];
    const subject = new UmbraDesktopMediaHealthContext(host, {
      client: api.client,
      wait: api.wait,
      now: () => new Date('2026-10-26T15:25:00Z'),
      trash: async (keys) => {
        trashed.push([...keys]);
        return { failed: [] };
      },
    });
    subject.state.subscribe((state) => states.push(state));
    return { subject, states, api, trashed };
  }

  it('asks the server nothing when it is made (design §2)', () => {
    const { api, states } = context();
    expect(api.calls).to.deep.equal([]);
    expect(states[states.length - 1]).to.deep.equal({ phase: { kind: 'idle' }, result: undefined });
  });

  it('starts a check, follows it every two seconds while it runs, then reads the result', async () => {
    const { subject, api, states } = context();
    await subject.check();
    expect(HEALTH_POLL_MS).to.equal(2000);
    expect(api.calls).to.deep.equal(['check', 'status', 'status', 'status', 'items', 'orphans', 'folders']);
    expect(api.waits).to.deep.equal([2000, 2000, 2000]);
    expect(states.map((state) => state.phase.kind)).to.deep.equal(['idle', 'running', 'running', 'running', 'running', 'running', 'idle']);
    const result = states[states.length - 1].result!;
    expect(result.library).to.deep.equal({ sizeBytes: 3 * MB + 80, items: 3, folders: 1 });
    expect(result.segments.map((segment) => segment.name)).to.deep.equal(['Products', 'People']);
    expect(result.unused.map((each) => each.key)).to.deep.equal(['b']);
    expect(result.oversized.map((each) => each.key)).to.deep.equal(['a']);
    expect(result.orphaned.length).to.equal(2);
    expect(result.checkedAt.toISOString()).to.equal('2026-10-26T13:13:00.000Z');
  });

  it('says which step runs and how far it is, for the window and the taskbar', async () => {
    const { subject, states } = context();
    await subject.check();
    const running = states.filter((state) => state.phase.kind === 'running').map((state) => state.phase as { step: string; scanned: number; total: number });
    expect(running.map((phase) => `${phase.step} ${phase.scanned}/${phase.total}`)).to.deep.equal(['usage 0/0', 'usage 0/3', 'usage 2/3', 'disk 0/0', 'loading 0/0']);
  });

  it('does not start a second check while one is followed', async () => {
    const { subject, api } = context();
    const first = subject.check();
    const second = subject.check();
    await Promise.all([first, second]);
    expect(api.calls.filter((call) => call === 'check').length).to.equal(1);
  });

  it('reports a check that failed, keeping the last result', async () => {
    const { subject, states } = context();
    await subject.check();
    const before = states[states.length - 1].result;
    const failing = server({ status: { running: null, last: check(), failed: null }, steps: [{ running: null, last: check(), failed: check({ id: 3, phase: 'Failed', error: 'Boom' }) }] });
    const second = new UmbraDesktopMediaHealthContext(hosts[0], { client: failing.client, wait: failing.wait, now: () => new Date(), trash: async () => ({ failed: [] }) });
    await second.check();
    expect(second.getState().phase).to.deep.equal({ kind: 'failed', message: 'Boom' });
    expect(before).to.not.equal(undefined);
  });

  it('reads a result the server already has when asked to sync, and follows a check still going', async () => {
    const ready = server({ status: { running: null, last: check(), failed: null } });
    const { subject, api } = context(ready);
    await subject.sync();
    expect(api.calls).to.deep.equal(['status', 'items', 'orphans', 'folders']);
    expect(subject.getState().result?.library.items).to.equal(3);

    const going = server({ status: { running: check({ id: 2, phase: 'Usage', scanned: 1, total: 3, finishedUtc: null }), last: null, failed: null } });
    const adopted = context(going);
    await adopted.subject.sync();
    expect(going.calls.slice(0, 2)).to.deep.equal(['status', 'status']);
    expect(going.waits.length).to.be.greaterThan(0);
    expect(adopted.subject.getState().result?.library.items).to.equal(3);
  });

  it('leaves the state alone when the server has no check yet', async () => {
    const { subject, api } = context();
    await subject.sync();
    expect(api.calls).to.deep.equal(['status']);
    expect(subject.getState()).to.deep.equal({ phase: { kind: 'idle' }, result: undefined });
  });

  it('shows a failure the server holds when there is nothing else', async () => {
    const failed = server({ status: { running: null, last: null, failed: check({ phase: 'Failed', error: 'Lost' }) } });
    const { subject } = context(failed);
    await subject.sync();
    expect(subject.getState().phase).to.deep.equal({ kind: 'failed', message: 'Lost' });
  });

  it('syncs once per desktop: a second window asks the server nothing more', async () => {
    const { subject, api } = context();
    await subject.sync();
    await subject.sync();
    expect(api.calls.length).to.equal(1);
  });

  it('deletes orphaned files through the server, and drops the deleted ones from the result', async () => {
    const { subject, api } = context();
    await subject.check();
    const outcome = await subject.deleteOrphaned(['1/x.jpg', '2/y.png']);
    expect(api.calls[api.calls.length - 1]).to.equal('delete 1/x.jpg,2/y.png');
    expect(outcome).to.deep.equal({ deleted: 1, skipped: [{ relativePath: '2/y.png', reason: 'NowOwned' }] });
    expect(subject.getState().result?.orphaned.map((each) => each.relativePath)).to.deep.equal(['2/y.png']);
  });

  it('says when the server refuses a delete', async () => {
    const { subject } = context();
    await subject.check();
    expect(await subject.deleteOrphaned(['denied'])).to.deep.equal({ error: 'denied' });
  });

  it('trashes items through the Manager, and drops them from the result', async () => {
    const { subject, trashed } = context();
    await subject.check();
    await subject.trash(['b']);
    expect(trashed).to.deep.equal([['b']]);
    expect(subject.getState().result?.unused).to.deep.equal([]);
    expect(subject.getState().result?.library.items).to.equal(2);
  });

  it("takes an image's new size after Optimize images, so the oversized row follows", async () => {
    const { subject } = context();
    await subject.check();
    subject.resized([{ unique: 'a', sizeBytes: 400 }]);
    expect(subject.getState().result?.oversized).to.deep.equal([]);
    expect(subject.getState().result?.library.sizeBytes).to.equal(480);
  });
});
