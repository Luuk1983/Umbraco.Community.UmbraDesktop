import { expect } from '@open-wc/testing';
import { UmbraDesktopSitePackageSettingsStore } from './site-settings-store.js';
import type { UmbraDesktopSiteSettingsAnswer, UmbraDesktopSiteSettingsSnapshot } from './site-settings-store.js';
import { applyMergePatch } from './json-merge-patch.js';

/**
 * One package's settings for the whole site, kept on the server and held in the page. What differs
 * from the per-user store is what is tested here: whether this user may change it, a patch that
 * merges with what other people stored, the server's answer winning once nothing is waiting, and a
 * failed change that is sent again with the next one.
 */

/** A server the test controls: what it holds, who may change it, and whether it answers. */
function fakeServer(stored: string | null = null) {
  const state = {
    stored,
    canChange: true,
    failing: false,
    /** The server's validators: why a value would be refused, or nothing when it may be stored. */
    validate: (() => []) as (value: unknown) => string[],
    requests: [] as Array<['read'] | ['replace' | 'patch', string]>,
    /** When set, a request waits for this before it answers, so a test can act while it is out. */
    gate: undefined as Promise<void> | undefined,
  };
  const answer = (): UmbraDesktopSiteSettingsSnapshot | undefined =>
    state.failing ? undefined : { value: state.stored, canChange: state.canChange };
  const document = {
    async read() {
      state.requests.push(['read']);
      if (state.gate) await state.gate;
      return answer();
    },
    async replace(value: string): Promise<UmbraDesktopSiteSettingsAnswer | undefined> {
      state.requests.push(['replace', value]);
      if (state.gate) await state.gate;
      if (state.failing || !state.canChange) return undefined;
      const problems = state.validate(JSON.parse(value));
      if (problems.length) return { refused: problems };
      state.stored = value;
      return answer();
    },
    async patch(patch: string): Promise<UmbraDesktopSiteSettingsAnswer | undefined> {
      state.requests.push(['patch', patch]);
      if (state.gate) await state.gate;
      if (state.failing || !state.canChange) return undefined;
      const current = state.stored === null ? undefined : JSON.parse(state.stored);
      const merged = applyMergePatch(current, JSON.parse(patch));
      const problems = state.validate(merged);
      if (problems.length) return { refused: problems };
      state.stored = JSON.stringify(merged);
      return answer();
    },
  };
  return { document, state };
}

/** A gate a test opens by hand. */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

/** A channel name no other case shares, so two cases' stores never hear each other. */
let channels = 0;
const channel = () => `site-settings-test-${++channels}-${Math.random()}`;

/** Stores made by a case, closed after it. */
let made: UmbraDesktopSitePackageSettingsStore[] = [];
afterEach(() => {
  for (const store of made) store.close();
  made = [];
});

/**
 * A store over a server, closed after the case.
 * @param document What it reads and writes.
 * @param name The cross-tab channel's name, shared to stand for two tabs.
 */
function store(document: ReturnType<typeof fakeServer>['document'], name?: string) {
  const subject = new UmbraDesktopSitePackageSettingsStore(document, name);
  made.push(subject);
  return subject;
}

it('reads the stored value and whether this user may change it', async () => {
  const subject = store(fakeServer('{"a":1}').document);
  await subject.load();
  expect([subject.value, subject.loaded, subject.canChange]).to.deep.equal([{ a: 1 }, true, true]);
});

it('may not be changed until it has been read', () => {
  const { document, state } = fakeServer();
  const subject = store(document);
  expect(subject.canChange).to.equal(false);
  expect(subject.set({ a: 1 })).to.equal(false);
  expect([subject.value, state.requests]).to.deep.equal([undefined, []]);
});

it('refuses a change from a user who may not make it, and changes nothing', async () => {
  const { document, state } = fakeServer('{"a":1}');
  state.canChange = false;
  const subject = store(document);
  await subject.load();
  expect(subject.set({ a: 2 })).to.equal(false);
  expect(subject.patch({ a: 2 })).to.equal(false);
  expect(subject.value).to.deep.equal({ a: 1 });
  expect(state.requests).to.deep.equal([['read']]);
});

it('replaces the value at once and stores it in the background', async () => {
  const { document, state } = fakeServer();
  const subject = store(document);
  await subject.load();
  expect(subject.set({ a: 1 })).to.equal(true);
  expect(subject.value).to.deep.equal({ a: 1 });
  await subject.saved();
  expect(state.stored).to.equal('{"a":1}');
});

it('patches at once, and takes the server’s merged answer with everyone else’s changes', async () => {
  const { document, state } = fakeServer('{"kept":{"a":true}}');
  const subject = store(document);
  await subject.load();
  // Somebody else keeps "b" after this page read.
  state.stored = '{"kept":{"a":true,"b":true}}';
  subject.patch({ kept: { c: true } });
  expect(subject.value).to.deep.equal({ kept: { a: true, c: true } });
  await subject.saved();
  expect(state.requests[1]).to.deep.equal(['patch', '{"kept":{"c":true}}']);
  expect(subject.value).to.deep.equal({ kept: { a: true, b: true, c: true } });
});

it('sends changes made while one is out as one request, composed', async () => {
  const { document, state } = fakeServer('{}');
  const subject = store(document);
  await subject.load();
  const held = gate();
  state.gate = held.promise;
  subject.patch({ kept: { a: true } });
  subject.patch({ kept: { b: true } });
  subject.patch({ kept: { c: true } });
  state.gate = undefined;
  held.open();
  await subject.saved();
  expect(state.requests.slice(1)).to.deep.equal([
    ['patch', '{"kept":{"a":true}}'],
    ['patch', '{"kept":{"b":true,"c":true}}'],
  ]);
  expect(subject.value).to.deep.equal({ kept: { a: true, b: true, c: true } });
});

it('keeps a change made while one is out, rather than letting the first answer undo it', async () => {
  const { document, state } = fakeServer('{}');
  const subject = store(document);
  await subject.load();
  const held = gate();
  state.gate = held.promise;
  subject.patch({ a: 1 });
  await Promise.resolve();
  subject.patch({ b: 2 });
  state.gate = undefined;
  held.open();
  // The first answer, {a:1}, arrives while {b:2} is waiting, and must not hide it.
  await new Promise((resolve) => setTimeout(resolve));
  expect(subject.value).to.deep.equal({ a: 1, b: 2 });
  await subject.saved();
});

it('applies a patch to a replace still waiting, and sends the replace', async () => {
  const { document, state } = fakeServer('{}');
  const subject = store(document);
  await subject.load();
  const held = gate();
  state.gate = held.promise;
  subject.patch({ first: true });
  subject.set({ a: 1 });
  subject.patch({ b: 2 });
  state.gate = undefined;
  held.open();
  await subject.saved();
  expect(state.requests.slice(2)).to.deep.equal([['replace', '{"a":1,"b":2}']]);
});

it('keeps a failed change in the page, says so, and sends it again with the next one', async () => {
  const { document, state } = fakeServer('{}');
  const subject = store(document);
  await subject.load();
  state.failing = true;
  subject.patch({ kept: { a: true } });
  await subject.saved();
  expect([subject.value, subject.status]).to.deep.equal([{ kept: { a: true } }, 'unsaved']);
  state.failing = false;
  subject.patch({ kept: { b: true } });
  await subject.saved();
  expect(state.requests[state.requests.length - 1]).to.deep.equal(['patch', '{"kept":{"a":true,"b":true}}']);
  expect([state.stored, subject.status]).to.deep.equal(['{"kept":{"a":true,"b":true}}', undefined]);
});

it('says when it could not be read, and reads again when asked', async () => {
  const { document, state } = fakeServer('{"a":1}');
  state.failing = true;
  const subject = store(document);
  await subject.load();
  expect([subject.loaded, subject.status]).to.deep.equal([false, 'unread']);
  state.failing = false;
  await subject.load();
  expect([subject.value, subject.status]).to.deep.equal([{ a: 1 }, undefined]);
});

it('reads again on refresh, to see what other people changed since', async () => {
  const { document, state } = fakeServer('{"a":1}');
  const subject = store(document);
  await subject.load();
  state.stored = '{"a":2}';
  await subject.load();
  expect(subject.value).to.deep.equal({ a: 1 });
  await subject.refresh();
  expect(subject.value).to.deep.equal({ a: 2 });
});

it('does not let a refresh undo a change made while it was out', async () => {
  const { document, state } = fakeServer('{}');
  const subject = store(document);
  await subject.load();
  const held = gate();
  state.gate = held.promise;
  const refreshing = subject.refresh();
  subject.patch({ a: 1 });
  state.gate = undefined;
  held.open();
  await refreshing;
  await subject.saved();
  expect(subject.value).to.deep.equal({ a: 1 });
});

it('tells subscribers about a change, a finished read and the server’s answer', async () => {
  const { document, state } = fakeServer('{}');
  const subject = store(document);
  const heard: unknown[] = [];
  subject.subscribe((value) => heard.push(value));
  await subject.load();
  state.stored = '{"other":1}';
  subject.patch({ a: 1 });
  await subject.saved();
  expect(heard).to.deep.equal([{}, { a: 1 }, { other: 1, a: 1 }]);
});

it('follows another tab’s stored change, unless a change of its own is waiting', async () => {
  const name = channel();
  const server = fakeServer('{}');
  const first = store(server.document, name);
  const second = store(server.document, name);
  await Promise.all([first.load(), second.load()]);
  const heard = new Promise((resolve) => second.subscribe(resolve));
  first.patch({ a: 1 });
  await first.saved();
  expect(await heard).to.deep.equal({ a: 1 });
});

/** A validator that refuses a quality outside 1 to 100, as a package would register on the server. */
const qualityRule = (value: unknown) => {
  const quality = (value as { quality?: unknown } | undefined)?.quality;
  return typeof quality === 'number' && (quality < 1 || quality > 100) ? ['Quality must be between 1 and 100.'] : [];
};

it('drops a refused change, says why, and goes back to what the server has', async () => {
  const { document, state } = fakeServer('{"quality":80}');
  state.validate = qualityRule;
  const subject = store(document);
  await subject.load();
  subject.patch({ quality: 500 });
  expect(subject.value).to.deep.equal({ quality: 500 });
  await subject.saved();
  expect([subject.value, subject.status, subject.problems]).to.deep.equal([
    { quality: 80 },
    'refused',
    ['Quality must be between 1 and 100.'],
  ]);
  expect(state.requests.map((request) => request[0])).to.deep.equal(['read', 'patch', 'read']);
});

it('never sends a refused change again, unlike a failed one', async () => {
  const { document, state } = fakeServer('{"quality":80}');
  state.validate = qualityRule;
  const subject = store(document);
  await subject.load();
  subject.patch({ quality: 500 });
  await subject.saved();
  subject.patch({ name: 'web' });
  await subject.saved();
  expect(state.requests[state.requests.length - 1]).to.deep.equal(['patch', '{"name":"web"}']);
  expect(subject.value).to.deep.equal({ quality: 80, name: 'web' });
});

it('keeps saying why until the next change, and clears it then', async () => {
  const { document, state } = fakeServer('{}');
  state.validate = qualityRule;
  const subject = store(document);
  await subject.load();
  subject.set({ quality: 0 });
  await subject.saved();
  await subject.refresh();
  expect(subject.status).to.equal('refused');
  subject.set({ quality: 90 });
  expect([subject.status, subject.problems]).to.deep.equal([undefined, []]);
  await subject.saved();
  expect([subject.status, state.stored]).to.deep.equal([undefined, '{"quality":90}']);
});

it('still sends a change made while the refused one was out, and takes its answer', async () => {
  const { document, state } = fakeServer('{"quality":80}');
  state.validate = qualityRule;
  const subject = store(document);
  await subject.load();
  const held = gate();
  state.gate = held.promise;
  subject.patch({ quality: 500 });
  subject.patch({ name: 'web' });
  state.gate = undefined;
  held.open();
  await subject.saved();
  // The refused patch was already out, so the waiting one went on its own and was stored. Its
  // answer settles the value; the refusal stays on show until the next change.
  expect(state.requests.slice(1).map((request) => request[0])).to.deep.equal(['patch', 'patch']);
  expect([subject.value, subject.status]).to.deep.equal([{ quality: 80, name: 'web' }, 'refused']);
});

it('tells subscribers when a change is refused', async () => {
  const { document, state } = fakeServer('{"quality":80}');
  state.validate = qualityRule;
  const subject = store(document);
  await subject.load();
  const statuses: unknown[] = [];
  subject.subscribe(() => statuses.push(subject.status));
  subject.patch({ quality: 500 });
  await subject.saved();
  expect(statuses).to.include('refused');
});
