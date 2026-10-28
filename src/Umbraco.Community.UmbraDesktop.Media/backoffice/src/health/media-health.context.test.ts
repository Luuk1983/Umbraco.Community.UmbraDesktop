import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { HEALTH_POLL_MS, HEALTH_WATCH_MS, UmbraDesktopMediaHealthContext } from './media-health.context.js';
import type { UmbraDesktopMediaHealthCleanupState, UmbraDesktopMediaHealthManager, UmbraDesktopMediaHealthRefusal, UmbraDesktopMediaHealthState } from './media-health.context.js';
import type { HealthCheck, HealthItem, HealthOrphan, HealthResult, HealthStatus, UmbraDesktopMediaHealthClient } from './health.client.js';
import type { HealthKind } from './health-model.js';
import type { OptimizeMediaRequest, OptimizeReport } from '../shared/optimize-service.js';
import type { UmbraDesktopMediaRef } from '../operations/media-api.js';

/**
 * The Media Health context (design §2, §5, §15, §16.3): follows a check the server runs, polling only
 * while it runs, keeps the result on the desktop so the window can close, and runs Clean up and its
 * Undo.
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
  url: '/media/a/banjo.jpg',
  width: null,
  height: null,
  updatedUtc: '2026-01-01T00:00:00Z',
  ...over,
});

const unused = (key: string, sizeBytes: number, parentKey: string | null = 'f') => item({ key, name: key, sizeBytes, parentKey, used: false, usageCount: 0 });

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
 * A status as the server reports it.
 * @param over What differs from no check at all.
 * @returns The status.
 */
const status = (over: Partial<HealthStatus> = {}): HealthStatus => ({ running: null, last: null, failed: null, mediaCount: 3, ...over });

/**
 * A stand-in server whose check takes a few polls, recording every call and every wait.
 * @param over What differs from a library of three items and two orphans.
 */
function server(over: { steps?: HealthStatus[]; status?: HealthStatus; items?: HealthItem[]; orphans?: HealthOrphan[] } = {}) {
  const calls: string[] = [];
  const waits: number[] = [];
  let current: HealthStatus = over.status ?? status();
  // What each poll answers after a check starts, in order; the last one is what stays.
  const steps = over.steps ?? [
    status({ running: check({ id: 2, phase: 'Usage', scanned: 2, total: 3, finishedUtc: null }), last: current.last }),
    status({ running: check({ id: 2, phase: 'Disk', scanned: 0, total: 0, finishedUtc: null }), last: current.last }),
    status({ last: check({ id: 2 }) }),
  ];
  let step = 0;
  const items = over.items ?? [item({ key: 'a', sizeBytes: 3 * MB }), unused('b', 50), item({ key: 'c', path: '/People', parentKey: 'p', sizeBytes: 30 })];
  let orphans = over.orphans ?? [orphan('1/x.jpg'), orphan('2/y.png')];
  const ok = <T>(data: T): Promise<HealthResult<T>> => Promise.resolve({ data });
  const client = {
    status: async () => {
      calls.push('status');
      if (current.running && step < steps.length) current = steps[step++];
      return ok(current);
    },
    check: async () => {
      calls.push('check');
      current = status({ running: check({ id: 2, phase: 'Usage', scanned: 0, total: 3, finishedUtc: null }), last: current.last });
      return ok(current);
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
      return ok([
        { key: 'f', name: 'Products', parentKey: null, path: '/Products' },
        { key: 'p', name: 'People', parentKey: null, path: '/People' },
      ]);
    },
    stop: async () => {
      calls.push('stop');
      current = status({ last: current.last });
      return ok(current);
    },
    refreshItems: async (keys: ReadonlyArray<string>) => {
      calls.push(`refresh ${keys.join(',')}`);
      return ok(undefined);
    },
    deleteOrphans: async (paths: ReadonlyArray<string>) => {
      calls.push(`delete ${paths.join(',')}`);
      if (paths.includes('denied')) return { error: 'denied' as const };
      const deleted = paths.filter((path) => path !== '2/y.png');
      orphans = orphans.filter((each) => !deleted.includes(each.relativePath));
      return ok({ deleted, skipped: paths.filter((path) => path === '2/y.png').map((relativePath) => ({ relativePath, reason: 'NowOwned' })) });
    },
  } as unknown as UmbraDesktopMediaHealthClient;
  /** Answer every status from now on with this, as a colleague's check or a new result would. */
  const set = (next: HealthStatus) => {
    current = next;
    step = steps.length;
  };
  return { client, calls, waits, items, set, wait: async (ms: number) => void waits.push(ms) };
}

/**
 * A stand-in Media Manager: reads refs for keys, trashes and restores them, and records each call.
 * @param items The library, for each ref's parent.
 * @param refuse Keys core refuses to trash.
 */
function managerOf(items: ReadonlyArray<HealthItem>, refuse: ReadonlyArray<string> = []) {
  const calls: string[] = [];
  const refOf = (unique: string): UmbraDesktopMediaRef => ({
    unique,
    name: unique,
    parent: items.find((each) => each.key === unique)?.parentKey ?? null,
    mediaType: 'image-type',
    isFolder: false,
  });
  const manager: UmbraDesktopMediaHealthManager = {
    api: {
      item: async (unique: string) => {
        calls.push(`item ${unique}`);
        return { data: refOf(unique) };
      },
      items: async (uniques: ReadonlyArray<string>) => {
        calls.push(`items ${uniques.join(',')}`);
        return { data: uniques.map(refOf) };
      },
    },
    trash: async (refs, options) => {
      calls.push(`trash ${refs.map((ref) => ref.unique).join(',')}`);
      options?.onProgress?.({ done: 0, failed: 0, total: refs.length });
      options?.onProgress?.({ done: refs.length, failed: 0, total: refs.length });
      return {
        succeeded: refs.filter((ref) => !refuse.includes(ref.unique)).map((ref) => ({ item: ref, affects: [] })),
        failed: refs.filter((ref) => refuse.includes(ref.unique)).map((ref) => ({ item: ref, reason: 'Refused' })),
        cancelled: false,
      };
    },
    restore: async (refs, target) => {
      calls.push(`restore ${refs.map((ref) => ref.unique).join(',')} to ${target}`);
      return { succeeded: refs.map((ref) => ({ item: ref, affects: [] })), failed: [], cancelled: false };
    },
  };
  return { manager, calls };
}

/**
 * A Clean up that ran, not one refused, so a test can read what came of it.
 * @param outcome What `cleanUp` answered.
 * @returns The Clean up's state.
 */
function ran(outcome: UmbraDesktopMediaHealthCleanupState | UmbraDesktopMediaHealthRefusal): UmbraDesktopMediaHealthCleanupState {
  if ('refused' in outcome) throw new Error(`Clean up was refused: ${outcome.refused}`);
  return outcome;
}

describe('the Media Health context', () => {
  let hosts: UmbElementControllerHost[] = [];
  afterEach(() => {
    for (const host of hosts) host.destroy();
    hosts = [];
  });

  /**
   * The context on a stand-in server and Manager.
   * @param api The stand-in server.
   * @param options The Manager's refusals, and Optimize images.
   * @returns The context, and every state it went through.
   */
  function context(
    api = server(),
    options: {
      refuse?: string[];
      optimize?: (request: OptimizeMediaRequest) => Promise<OptimizeReport>;
      now?: () => Date;
      visible?: () => boolean;
      wait?: (ms: number) => Promise<void>;
    } = {},
  ) {
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    const states: UmbraDesktopMediaHealthState[] = [];
    const { manager, calls: managerCalls } = managerOf(api.items, options.refuse);
    const optimized: OptimizeMediaRequest[] = [];
    const subject = new UmbraDesktopMediaHealthContext(host, {
      client: api.client,
      wait: options.wait ?? api.wait,
      now: options.now ?? (() => new Date('2026-10-26T15:25:00Z')),
      visible: options.visible,
      manager,
      optimize: async (request) => {
        optimized.push(request);
        return options.optimize ? options.optimize(request) : { status: 'finished', items: [] };
      },
    });
    subject.state.subscribe((state) => states.push(state));
    return { subject, states, api, managerCalls, optimized };
  }

  const all = new Set<HealthKind>(['unused', 'orphaned', 'oversized']);

  it('asks the server nothing when it is made (design §2)', () => {
    const { api, states } = context();
    expect(api.calls).to.deep.equal([]);
    expect(states[states.length - 1]).to.deep.equal({ phase: { kind: 'idle' }, result: undefined, mediaCount: undefined, cleanup: undefined });
  });

  it('starts a check, follows it every two seconds while it runs, then reads the result', async () => {
    const { subject, api, states } = context();
    await subject.check();
    expect(HEALTH_POLL_MS).to.equal(2000);
    expect(api.calls).to.deep.equal(['check', 'status', 'status', 'status', 'items', 'orphans', 'folders']);
    expect(api.waits).to.deep.equal([2000, 2000, 2000]);
    expect(states.map((state) => state.phase.kind)).to.deep.equal(['idle', 'running', 'running', 'running', 'running', 'running', 'idle']);
    const result = states[states.length - 1].result!;
    expect(result.lists.unused.map((each) => each.key)).to.deep.equal(['b']);
    expect(result.lists.oversized.map((each) => each.key)).to.deep.equal(['a']);
    expect(result.lists.orphaned.length).to.equal(2);
    expect(result.bar).to.deep.include({ unused: 50, orphaned: 20, oversized: 3 * MB, fine: 30 });
    expect(result.folders.map((folder) => folder.name)).to.deep.equal(['Products', 'People']);
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
    const failing = server({ status: status({ last: check() }), steps: [status({ last: check(), failed: check({ id: 3, phase: 'Failed', error: 'Boom' }) })] });
    const second = new UmbraDesktopMediaHealthContext(hosts[0], { client: failing.client, wait: failing.wait, now: () => new Date() });
    await second.check();
    expect(second.getState().phase).to.deep.equal({ kind: 'failed', message: 'Boom' });
    expect(before).to.not.equal(undefined);
  });

  it('reads a result the server already has when asked to sync, and follows a check still going', async () => {
    const ready = server({ status: status({ last: check() }) });
    const { subject, api } = context(ready);
    await subject.sync();
    expect(api.calls).to.deep.equal(['status', 'items', 'orphans', 'folders']);
    expect(subject.getState().result?.items.length).to.equal(3);

    const going = server({ status: status({ running: check({ id: 2, phase: 'Usage', scanned: 1, total: 3, finishedUtc: null }) }) });
    const adopted = context(going);
    await adopted.subject.sync();
    expect(going.calls.slice(0, 2)).to.deep.equal(['status', 'status']);
    expect(going.waits.length).to.be.greaterThan(0);
    expect(adopted.subject.getState().result?.items.length).to.equal(3);
  });

  it('keeps the media count from every status, even before any check (design §16.3)', async () => {
    const { subject, api } = context(server({ status: status({ mediaCount: 18240 }) }));
    await subject.sync();
    expect(api.calls).to.deep.equal(['status']);
    expect(subject.getState()).to.deep.include({ phase: { kind: 'idle' }, result: undefined, mediaCount: 18240 });
  });

  it('shows a failure the server holds when there is nothing else', async () => {
    const failed = server({ status: status({ failed: check({ phase: 'Failed', error: 'Lost' }) }) });
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
    expect(subject.getState().result?.lists.orphaned.map((each) => each.relativePath)).to.deep.equal(['2/y.png']);
  });

  it('says when the server refuses a delete', async () => {
    const { subject } = context();
    await subject.check();
    expect(await subject.deleteOrphaned(['denied'])).to.deep.equal({ error: 'denied' });
  });

  it('trashes items through the Manager, reading their refs in one call, and drops them from the result', async () => {
    const { subject, managerCalls } = context();
    await subject.check();
    await subject.trash(['b', 'c', 'a']);
    expect(managerCalls).to.deep.equal(['items b,c,a', 'trash b,c,a']);
    expect(subject.getState().result?.lists.unused).to.deep.equal([]);
    expect(subject.getState().result?.items.length).to.equal(0);
  });

  it("takes an image's new size after Optimize images, so the oversized row follows, and the stored result too", async () => {
    const { subject, api } = context();
    await subject.check();
    subject.resized([{ unique: 'a', sizeBytes: 400 }]);
    expect(subject.getState().result?.lists.oversized).to.deep.equal([]);
    expect(subject.getState().result?.bar.fine).to.equal(430);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.calls).to.include('refresh a');
  });

  it("signs items through core and orphaned files through the add-on, each once, by the file's URL", async () => {
    const api = server();
    const asked: string[] = [];
    const fake = api.client as unknown as { itemThumbnails: unknown; orphanThumbnails: unknown };
    fake.itemThumbnails = async (keys: string[], edge: number) => {
      asked.push(`items ${keys.join(',')}`);
      return { data: Object.fromEntries(keys.map((key) => [key, `/media/${key}.jpg?width=${edge}&hmac=core`])) };
    };
    fake.orphanThumbnails = async (urls: string[], edge: number) => {
      asked.push(`orphans ${urls.join(',')}`);
      return { data: Object.fromEntries(urls.map((url) => [url, `${url}?width=${edge}&hmac=addon`])) };
    };
    const { subject } = context(api);
    const first = await subject.thumbnails([{ url: '/media/a.jpg', key: 'a' }, { url: '/media/1/x.jpg' }], 240);
    const second = await subject.thumbnails([{ url: '/media/a.jpg', key: 'a' }, { url: '/media/b.jpg', key: 'b' }], 240);
    expect(asked).to.deep.equal(['items a', 'orphans /media/1/x.jpg', 'items b']);
    expect(first.get('/media/a.jpg')).to.equal('/media/a.jpg?width=240&hmac=core');
    expect(first.get('/media/1/x.jpg')).to.equal('/media/1/x.jpg?width=240&hmac=addon');
    expect(second.get('/media/b.jpg')).to.equal('/media/b.jpg?width=240&hmac=core');
  });

  describe('watching while a window is open (design §16.12)', () => {
    /**
     * A wait that holds the watch's 30 seconds until the test lets one go, and lets every other wait,
     * the 2 seconds of a followed check, go on the next turn, so a followed check never spins.
     * @param api The stand-in server, whose waits are recorded.
     */
    function gated(api: ReturnType<typeof server>) {
      const gates: Array<() => void> = [];
      const wait = (ms: number) => {
        api.waits.push(ms);
        return ms === HEALTH_WATCH_MS ? new Promise<void>((resolve) => gates.push(resolve)) : new Promise<void>((resolve) => setTimeout(resolve, 0));
      };
      const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
      const pass = async () => {
        await tick();
        gates.shift()?.();
        await tick();
        await tick();
      };
      return { wait, pass, pending: () => gates.length };
    }

    it('asks every 30 seconds, and switches to a check someone else started, then to its result', async () => {
      const api = server({ status: status({ last: check({ id: 1 }) }) });
      const gate = gated(api);
      const { subject } = context(api, { wait: gate.wait });
      await subject.sync();
      const stop = subject.watch();
      expect(HEALTH_WATCH_MS).to.equal(30000);

      api.set(status({ running: check({ id: 2, phase: 'Usage', scanned: 1, total: 3, finishedUtc: null }), last: check({ id: 1 }) }));
      await gate.pass();
      expect(subject.getState().phase.kind).to.equal('running');

      api.set(status({ last: check({ id: 2, finishedUtc: '2026-10-26T15:20:00Z' }) }));
      await gate.pass();
      await gate.pass();
      expect(subject.getState().phase.kind).to.equal('idle');
      expect(subject.getState().result?.checkId).to.equal(2);
      stop();
    });

    it('loads a newer result someone else finished, and asks nothing more while nothing changed', async () => {
      const api = server({ status: status({ last: check({ id: 1 }) }) });
      const gate = gated(api);
      const { subject } = context(api, { wait: gate.wait });
      await subject.sync();
      const stop = subject.watch();
      await gate.pass();
      expect(api.calls.filter((call) => call === 'items').length, 'the same check is not read again').to.equal(1);

      api.set(status({ last: check({ id: 3 }) }));
      await gate.pass();
      expect(subject.getState().result?.checkId).to.equal(3);
      expect(api.calls.filter((call) => call === 'items').length).to.equal(2);
      stop();
    });

    it('asks nothing while the window cannot be seen', async () => {
      const api = server({ status: status({ last: check({ id: 1 }) }) });
      const gate = gated(api);
      const { subject } = context(api, { wait: gate.wait, visible: () => false });
      await subject.sync();
      const before = api.calls.length;
      const stop = subject.watch();
      await gate.pass();
      await gate.pass();
      expect(api.calls.length).to.equal(before);
      stop();
    });

    it('stops asking once the last window has closed, and watches once for two windows', async () => {
      const api = server({ status: status({ last: check({ id: 1 }) }) });
      const gate = gated(api);
      const { subject } = context(api, { wait: gate.wait });
      await subject.sync();
      const first = subject.watch();
      const second = subject.watch();
      await gate.pass();
      expect(gate.pending(), 'one watch, however many windows').to.equal(1);
      first();
      second();
      const before = api.calls.length;
      await gate.pass();
      await gate.pass();
      expect(api.calls.length).to.equal(before);
    });
  });

  it('stops a running check on the server, and goes back to the last result', async () => {
    const api = server({ status: status({ last: check({ id: 1 }) }) });
    const { subject } = context(api);
    await subject.sync();
    api.set(status({ running: check({ id: 2, phase: 'Usage', scanned: 1, total: 3, finishedUtc: null }), last: check({ id: 1 }) }));
    await subject.stop();
    expect(api.calls).to.include('stop');
    expect(subject.getState().phase.kind).to.equal('idle');
    expect(subject.getState().result?.checkId).to.equal(1);
  });

  describe('Clean up', () => {
    it('refuses a result a newer check has replaced, loads the newer one, and changes nothing', async () => {
      const api = server({ status: status({ last: check({ id: 1 }) }) });
      const { subject, managerCalls } = context(api);
      await subject.sync();
      api.set(status({ last: check({ id: 2 }) }));

      const outcome = await subject.cleanUp(all);

      expect(outcome).to.deep.equal({ refused: 'newer' });
      expect(managerCalls.filter((call) => call.startsWith('trash'))).to.deep.equal([]);
      expect(api.calls.filter((call) => call.startsWith('delete'))).to.deep.equal([]);
      expect(subject.getState().result?.checkId).to.equal(2);
    });

    it('refuses a result older than a day: the person checks again first', async () => {
      const api = server({ status: status({ last: check({ id: 1, finishedUtc: '2026-10-25T13:00:00Z' }) }) });
      const { subject, managerCalls } = context(api, { now: () => new Date('2026-10-26T15:25:00Z') });
      await subject.sync();

      expect(await subject.cleanUp(all)).to.deep.equal({ refused: 'stale' });
      expect(managerCalls.filter((call) => call.startsWith('trash'))).to.deep.equal([]);
    });

    it('brings the stored result in line with what it trashed and what Undo put back', async () => {
      const api = server({ status: status({ last: check({ id: 1 }) }) });
      const { subject } = context(api);
      await subject.sync();
      await subject.cleanUp(new Set<HealthKind>(['unused']));
      expect(api.calls).to.include('refresh b');
      await subject.undoCleanup();
      expect(api.calls.filter((call) => call === 'refresh b').length).to.equal(2);
    });


    it('runs only the ticked kinds', async () => {
      const { subject, api, optimized } = context();
      await subject.check();
      await subject.cleanUp(new Set<HealthKind>(['unused']));
      expect(api.calls.some((call) => call.startsWith('delete'))).to.equal(false);
      expect(optimized).to.deep.equal([]);
      expect(subject.getState().cleanup).to.deep.include({ phase: 'done', done: 1, total: 1, freedBytes: 50 });
    });

    it('reports what went, not what was asked', async () => {
      const api = server({ items: [unused('u1', 500), unused('u2', 900)] });
      const { subject } = context(api, { refuse: ['u2'] });
      await subject.check();
      const done = ran(await subject.cleanUp(new Set<HealthKind>(['unused', 'orphaned'])));
      expect(done.failed).to.deep.equal(['u2']);
      expect(done.trashed.map((ref) => ref.unique)).to.deep.equal(['u1']);
      expect(done.deleted).to.equal(1);
      expect(done.skipped).to.deep.equal([{ relativePath: '2/y.png', reason: 'NowOwned' }]);
      expect(done.freedBytes, 'the trashed item and the deleted file').to.equal(500 + 10);
      expect(done.beforeBytes).to.equal(1400 + 20);
      expect(done.afterBytes).to.equal(1400 + 20 - 510);
      expect(subject.getState().result?.lists.unused.map((each) => each.key)).to.deep.equal(['u2']);
    });

    it('counts trashed items and deleted files as they go, for the taskbar', async () => {
      const { subject, states } = context(server({ items: [unused('u1', 500), unused('u2', 900)] }));
      await subject.check();
      await subject.cleanUp(new Set<HealthKind>(['unused', 'orphaned']));
      const seen = states.map((state) => state.cleanup).filter((each) => each?.phase === 'running').map((each) => `${each!.done}/${each!.total}`);
      expect(seen[0]).to.equal('0/4');
      expect(seen).to.include('2/4');
      expect(subject.getState().cleanup).to.deep.include({ phase: 'done', done: 4, total: 4 });
    });

    it('undoes by restoring each item to its own folder, and puts it back in the list', async () => {
      const { subject, managerCalls } = context(server({ items: [unused('u1', 500, 'f1'), unused('u2', 900, null)] }));
      await subject.check();
      await subject.cleanUp(new Set<HealthKind>(['unused']));
      expect(subject.getState().result?.lists.unused).to.deep.equal([]);
      const outcome = await subject.undoCleanup();
      expect(outcome.failed).to.deep.equal([]);
      expect(managerCalls.filter((call) => call.startsWith('restore'))).to.deep.equal(['restore u2 to null', 'restore u1 to f1']);
      expect(subject.getState().result?.lists.unused.map((each) => each.key)).to.deep.equal(['u2', 'u1']);
      expect(subject.getState().cleanup?.trashed).to.deep.equal([]);
    });

    it('does not wait for Optimize images, and follows how far it is', async () => {
      let tell: ((progress: { completed: number; total: number; location: string }) => void) | undefined;
      const { subject, optimized } = context(server(), {
        optimize: (request) => {
          tell = request.onProgress;
          return new Promise<OptimizeReport>(() => {});
        },
      });
      await subject.check();
      const done = ran(await subject.cleanUp(new Set<HealthKind>(['oversized']), { title: 'Oversized images' }));
      expect(done.phase).to.equal('done');
      expect(optimized[0]).to.deep.include({ items: ['a'], title: 'Oversized images' });
      tell!({ completed: 38, total: 214, location: 'run1' });
      expect(subject.getState().cleanup?.optimizing).to.deep.equal({ completed: 38, total: 214, location: 'run1' });
    });

    it('takes the new sizes when Optimize images ends, and stops showing it', async () => {
      let finish: ((report: OptimizeReport) => void) | undefined;
      const { subject } = context(server(), { optimize: () => new Promise<OptimizeReport>((resolve) => (finish = resolve)) });
      await subject.check();
      await subject.cleanUp(new Set<HealthKind>(['oversized']));
      finish!({ status: 'finished', items: [{ unique: 'a', status: 'optimized', after: { size: 400 } }] });
      await new Promise((resolve) => setTimeout(resolve));
      expect(subject.getState().cleanup?.optimizing).to.equal(undefined);
      expect(subject.getState().result?.lists.oversized).to.deep.equal([]);
    });

    it('goes back to the overview when dismissed', async () => {
      const { subject } = context();
      await subject.check();
      await subject.cleanUp(new Set<HealthKind>(['unused']));
      subject.dismissCleanup();
      expect(subject.getState().cleanup).to.equal(undefined);
    });

    it('keeps every kind in order: the bin, then the disk, then Optimize images', async () => {
      const { subject, api, managerCalls, optimized } = context();
      await subject.check();
      await subject.cleanUp(all);
      expect(managerCalls).to.deep.equal(['items b', 'trash b']);
      expect(api.calls[api.calls.length - 1]).to.equal('delete 1/x.jpg,2/y.png');
      expect(optimized.length).to.equal(1);
    });
  });
});
