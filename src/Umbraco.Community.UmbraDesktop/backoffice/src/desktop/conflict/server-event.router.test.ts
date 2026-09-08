import { expect } from '@open-wc/testing';
import { createServerEventRouter } from './server-event.router.js';
import type { UmbraDesktopWorkspaceSubject } from '../dirty-watcher.js';
import type { UmbraDesktopServerStatePatch } from '../window-model.js';

/**
 * The orchestration between a server event and a window's flags. Everything decided here is
 * decided without a booted backoffice: the router takes a function that hands it the current
 * windows and a sink it writes flags to, so a test can drive it with plain objects. Design §5.
 */

/** A window the router can act on, with recording stand-ins for the workspace's two methods. */
function target(over: Record<string, unknown> = {}) {
  const calls = { reload: 0, fetch: 0 };
  const subject: UmbraDesktopWorkspaceSubject = {
    entityType: 'document',
    unique: 'a1',
    reload: async () => void (calls.reload += 1),
    loadWithoutPersist: async () => {
      calls.fetch += 1;
      return (over.theirs as unknown) ?? { values: [{ alias: 't', value: 'theirs' }] };
    },
    getPersistedData: () => (over.base as unknown) ?? { values: [{ alias: 't', value: 'base' }] },
    getData: () => (over.mine as unknown) ?? { values: [{ alias: 't', value: 'mine' }] },
  };
  return {
    calls,
    window: { id: (over.id as string) ?? 'w1', dirty: (over.dirty as boolean) ?? true },
    subjects: [subject],
  };
}

/** A router over a fixed set of targets, recording every flag written. */
function router(targets: ReturnType<typeof target>[]) {
  const written: Array<{ id: string; patch: UmbraDesktopServerStatePatch }> = [];
  const refreshes: Array<{ id: string; refreshing: boolean }> = [];
  const instance = createServerEventRouter({
    windows: () => targets.map((t) => t.window),
    subjectsOf: (id) => targets.find((t) => t.window.id === id)?.subjects ?? [],
    setServerState: (id, patch) => written.push({ id, patch }),
    setRefreshing: (id, refreshing) => refreshes.push({ id, refreshing }),
  });
  return { instance, written, refreshes };
}

/** A server event, with the fields that matter stated per test. */
const event = (over: Partial<{ eventType: string; key: string; eventSource: string }> = {}) => ({
  eventSource: 'Umbraco:CMS:Document',
  eventType: 'Updated',
  key: 'a1',
  clientTimestamp: '2026-09-08T10:00:00Z',
  ...over,
});

it('marks a dirty window whose node somebody else changed', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([{ id: 'w1', patch: { changedElsewhere: true } }]);
  expect(t.calls.fetch).to.equal(1);
});

it('leaves an unrelated node alone', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ key: 'somebody-else' }));
  expect(written).to.eql([]);
  expect(t.calls.fetch).to.equal(0);
  expect(t.calls.reload).to.equal(0);
});

it('does not mark a window that wrote it itself', async () => {
  // The server's copy is what this window is holding, whichever path wrote it.
  const t = target({ theirs: { values: [{ alias: 't', value: 'mine' }] } });
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([]);
});

it('refreshes a clean window in place instead of fetching', async () => {
  const t = target({ dirty: false });
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(t.calls.reload).to.equal(1);
  expect(t.calls.fetch).to.equal(0);
  expect(written).to.eql([]);
});

it('spins the glyph across a refresh and stops it afterwards', async () => {
  const t = target({ dirty: false });
  const { instance, refreshes } = router([t]);
  await instance.handleEvent(event());
  expect(refreshes).to.eql([
    { id: 'w1', refreshing: true },
    { id: 'w1', refreshing: false },
  ]);
});

it('stops the glyph even when the reload fails', async () => {
  // Otherwise a node that goes while we are re-fetching it leaves the glyph spinning for the life
  // of the window.
  const t = target({ dirty: false });
  t.subjects[0].reload = async () => {
    throw new Error('gone');
  };
  const { instance, refreshes } = router([t]);
  try {
    await instance.handleEvent(event());
  } catch {
    // The rejection is the router's caller's problem; what is under test is the flag.
  }
  expect(refreshes[refreshes.length - 1]).to.eql({ id: 'w1', refreshing: false });
});

it('marks a trashed node and still classifies it', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Trashed' }));
  expect(written).to.eql([
    { id: 'w1', patch: { trashed: true } },
    { id: 'w1', patch: { changedElsewhere: true } },
  ]);
});

it('records the trashed flag on a clean window too, and still reloads it', async () => {
  // The router's own check used to be `event.eventType === 'Trashed' && window.dirty`, which is
  // both redundant with and lossy against `notices.ts`'s own `trashed && dirty` gate: a clean
  // window recorded nothing, so the trashed banner never showed even a minute later once the
  // editor started typing on it. The flag is recorded unconditionally now, and a clean window
  // still refreshes in place exactly as it did before — there is nothing of the editor's to lose.
  const t = target({ dirty: false });
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Trashed' }));
  expect(t.calls.reload).to.equal(1);
  expect(written).to.eql([{ id: 'w1', patch: { trashed: true } }]);
});

it('marks a deleted node without asking the server', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Deleted' }));
  expect(written).to.eql([{ id: 'w1', patch: { deleted: true } }]);
  expect(t.calls.fetch).to.equal(0);
});

it('marks a deleted node on a clean window too, and does not reload it', async () => {
  const t = target({ dirty: false });
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Deleted' }));
  expect(written).to.eql([{ id: 'w1', patch: { deleted: true } }]);
  expect(t.calls.reload).to.equal(0);
});

it('ignores an event type it does not handle', async () => {
  const t = target();
  const { instance, written } = router([t]);
  await instance.handleEvent(event({ eventType: 'Moved' }));
  expect(written).to.eql([]);
  expect(t.calls.fetch).to.equal(0);
});

it('marks every window showing the node, and only those', async () => {
  const a = target({ id: 'w1' });
  const b = target({ id: 'w2' });
  const c = target({ id: 'w3' });
  c.subjects[0].unique = 'other';
  const { instance, written } = router([a, b, c]);
  await instance.handleEvent(event());
  expect(written.map((w) => w.id)).to.eql(['w1', 'w2']);
});

it('coalesces a burst into one fetch per window', async () => {
  const t = target();
  const { instance } = router([t]);
  await Promise.all([
    instance.handleEvent(event()),
    instance.handleEvent(event()),
    instance.handleEvent(event()),
  ]);
  // One fetch for the first event, and one more for everything that arrived while it was in
  // flight, rather than one per event.
  expect(t.calls.fetch).to.equal(2);
});

it('treats a 404 from the fetch as a deleted node', async () => {
  const t = target();
  t.subjects[0].loadWithoutPersist = async () => {
    // Built via `Object.assign` rather than the two-argument `Error` constructor: the repo's
    // `tsconfig.json` targets `lib: ["ES2020"]`, whose `Error` type has no `ErrorOptions` overload,
    // so `new Error(message, { cause })` fails `tsc` even though every browser this desktop
    // supports accepts it at runtime.
    throw Object.assign(new Error('Error loading entity'), { cause: { status: 404 } });
  };
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([{ id: 'w1', patch: { deleted: true } }]);
});

it('says nothing when the fetch fails for any other reason', async () => {
  const t = target();
  t.subjects[0].loadWithoutPersist = async () => {
    throw new Error('Network down');
  };
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([]);
});

it('says nothing when the workspace cannot be asked', async () => {
  const t = target();
  t.subjects[0].loadWithoutPersist = undefined;
  const { instance, written } = router([t]);
  await instance.handleEvent(event());
  expect(written).to.eql([]);
});
